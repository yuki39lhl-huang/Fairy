// src/main/llmAdapter/providers/deepseek.ts
import axios from 'axios'
import { randomUUID } from 'crypto'
import { StringDecoder } from 'string_decoder'
import { BaseModel, ChatMessage, StreamChunkCallback, ToolCall } from '../baseModel'

export interface ChatStreamOptions {
  /** 跟进轮强制禁止再调工具，避免模型把 DSML 写进正文 */
  toolChoice?: 'auto' | 'none'
}

/**
 * DeepSeek V4/V4.1 工具调用会写成 DSML 块。API 正常时走 delta.tool_calls；
 * 泄漏进 content 时常见形态：
 *   <｜DSML｜tool_calls> … </｜DSML｜tool_calls>
 *   <｜DSML｜ calls> … </｜DSML｜ calls>   （V4.1 带空格）
 * 剥掉特殊 token 后用户会看到裸的 <calls>/<invoke>——必须整块拦截并解析执行。
 */

const DSML = String.raw`(?:\|?\s*｜?\s*DSML\s*｜?\s*\|?\s*)`
const TOOL_BLOCK_START_RE = new RegExp(`<${DSML}?\\s*(?:tool_)?calls>`, 'i')
const TOOL_BLOCK_END_RE = new RegExp(`</${DSML}?\\s*(?:tool_)?calls>`, 'i')
const INVOKE_RE = new RegExp(
  `<${DSML}?\\s*invoke\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)</${DSML}?\\s*invoke>`,
  'gi'
)
const PARAM_RE = new RegExp(
  `<${DSML}?\\s*parameter\\s+name="([^"]+)"(?:\\s+string="([^"]*)")?[^>]*>([\\s\\S]*?)</${DSML}?\\s*parameter>`,
  'gi'
)

function parseDsmlToolCalls(block: string): ToolCall[] {
  const calls: ToolCall[] = []
  INVOKE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INVOKE_RE.exec(block)) !== null) {
    const name = m[1]?.trim()
    if (!name) continue
    const body = m[2] ?? ''
    const args: Record<string, unknown> = {}
    PARAM_RE.lastIndex = 0
    let pm: RegExpExecArray | null
    while ((pm = PARAM_RE.exec(body)) !== null) {
      const key = pm[1]
      const asString = (pm[2] ?? 'true').toLowerCase() !== 'false'
      const raw = (pm[3] ?? '').trim()
      if (asString) {
        args[key] = raw
      } else {
        try {
          args[key] = JSON.parse(raw)
        } catch {
          args[key] = raw
        }
      }
    }
    calls.push({
      id: `dsml_${randomUUID()}`,
      name,
      arguments: JSON.stringify(args)
    })
  }
  return calls
}

/** 去掉零散协议碎片（非整块 tool_calls 时） */
function stripLooseDsml(text: string): string {
  return text
    .replace(new RegExp(`</?${DSML}[^>]*>`, 'gi'), '')
    .replace(/[|｜]\s*[|｜]?\s*DSML\s*[|｜]?\s*[|｜]?/gi, '')
    .replace(/<\/?(?:tool_)?calls>/gi, '')
    .replace(/<\/?invoke\b[^>]*>/gi, '')
    .replace(/<\/?parameter\b[^>]*>/gi, '')
    .replace(/invoke\s+name=(?:"[^"]*"|'[^']*')/gi, '')
}

export class DeepSeekModel extends BaseModel {
  private baseURL = 'https://api.deepseek.com/beta'

  constructor(apiKey: string, model = 'deepseek-v4-flash') {
    super(apiKey, model)
  }

  async chatStream(
    messages: ChatMessage[],
    callbacks: StreamChunkCallback,
    tools?: object[],
    options?: ChatStreamOptions
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let isDone = false
      const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> =
        {}
      const dsmlParsedCalls: ToolCall[] = []

      let emotionResolved = false
      let emotionBuffer = ''
      const EMOTION_BUFFER_MAX = 40

      // 进入 DSML tool 块后整段缓冲，不展示，结束时解析
      let inToolBlock = false
      let toolBlockBuf = ''
      let pending = '' // 尚未判定是否进入 tool 块的尾部
      let dsmlWarned = false

      const emitText = (text: string): void => {
        if (!text) return
        if (emotionResolved) {
          const out = text.replace(/\[emotion:[a-zA-Z]+\]/g, '')
          if (out) callbacks.onChunk(out)
          return
        }
        emotionBuffer += text
        const match = emotionBuffer.match(/^\s*\[emotion:([a-zA-Z]+)\]/)
        if (match) {
          const validEmotions = ['normal', 'smug', 'teasing', 'caring', 'alert']
          const emotion = validEmotions.includes(match[1]) ? match[1] : 'normal'
          callbacks.onEmotion?.(emotion)
          emotionBuffer = emotionBuffer.slice(match[0].length).replace(/\[emotion:[a-zA-Z]+\]/g, '')
          emotionResolved = true
          if (emotionBuffer) callbacks.onChunk(emotionBuffer)
          return
        }
        if (emotionBuffer.length >= EMOTION_BUFFER_MAX) {
          emotionResolved = true
          callbacks.onChunk(emotionBuffer.replace(/\[emotion:[a-zA-Z]+\]/g, ''))
          emotionBuffer = ''
        }
      }

      const finishToolBlock = (block: string): void => {
        const parsed = parseDsmlToolCalls(block)
        if (parsed.length > 0) {
          dsmlParsedCalls.push(...parsed)
          if (!dsmlWarned) {
            dsmlWarned = true
            console.warn(
              '[DeepSeek] content 中的 DSML 工具块已拦截并解析为 tool_calls:',
              parsed.map((c) => c.name).join(', ')
            )
          }
        } else if (!dsmlWarned) {
          dsmlWarned = true
          console.warn('[DeepSeek] 已丢弃无法解析的 DSML 协议块，不展示给用户')
        }
      }

      /** 流式处理：正常文本下发；DSML tool 块整段吞掉 */
      const ingestContent = (raw: string): void => {
        let chunk = raw
        while (chunk) {
          if (inToolBlock) {
            toolBlockBuf += chunk
            chunk = ''
            const endMatch = toolBlockBuf.match(TOOL_BLOCK_END_RE)
            if (endMatch && endMatch.index !== undefined) {
              const endAt = endMatch.index + endMatch[0].length
              finishToolBlock(toolBlockBuf.slice(0, endAt))
              const rest = toolBlockBuf.slice(endAt)
              toolBlockBuf = ''
              inToolBlock = false
              if (rest) chunk = rest
            }
            continue
          }

          const scan = pending + chunk
          pending = ''
          chunk = ''

          const startMatch = scan.match(TOOL_BLOCK_START_RE)
          if (startMatch && startMatch.index !== undefined) {
            const before = scan.slice(0, startMatch.index)
            const cleanBefore = stripLooseDsml(before)
            if (cleanBefore) emitText(cleanBefore)
            inToolBlock = true
            toolBlockBuf = scan.slice(startMatch.index)
            const endMatch = toolBlockBuf.match(TOOL_BLOCK_END_RE)
            if (endMatch && endMatch.index !== undefined) {
              const endAt = endMatch.index + endMatch[0].length
              finishToolBlock(toolBlockBuf.slice(0, endAt))
              const rest = toolBlockBuf.slice(endAt)
              toolBlockBuf = ''
              inToolBlock = false
              if (rest) chunk = rest
            }
            continue
          }

          // 可能落在未写完的 `<｜DSML` / `<calls` 前缀上：扣住尾部再等
          const hold = scan.match(/<[|｜\w\s]{0,24}$/)
          if (hold) {
            const safe = scan.slice(0, -hold[0].length)
            const clean = stripLooseDsml(safe)
            if (clean) emitText(clean)
            pending = hold[0]
          } else {
            const clean = stripLooseDsml(scan)
            if (clean) emitText(clean)
          }
        }
      }

      const finalize = (): void => {
        if (isDone) return
        isDone = true

        if (inToolBlock && toolBlockBuf) {
          finishToolBlock(toolBlockBuf)
          toolBlockBuf = ''
          inToolBlock = false
        }
        if (pending) {
          const clean = stripLooseDsml(pending)
          if (clean) emitText(clean)
          pending = ''
        }
        if (!emotionResolved && emotionBuffer) {
          const rest = stripLooseDsml(emotionBuffer).replace(/\[emotion:[a-zA-Z]+\]/g, '')
          if (rest) callbacks.onChunk(rest)
          emotionBuffer = ''
        }

        const fromDelta = Object.values(toolCallsAccumulator).filter((c) => c.name)
        const calls: ToolCall[] =
          fromDelta.length > 0
            ? (fromDelta as ToolCall[])
            : options?.toolChoice === 'none'
              ? []
              : dsmlParsedCalls

        if (calls.length > 0 && callbacks.onToolCall) {
          callbacks.onToolCall(calls)
        } else {
          callbacks.onDone()
        }
        resolve()
      }

      const apiMessages = messages.map((m) => {
        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }))
          }
        }
        if (m.role === 'tool') {
          return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
        }
        return { role: m.role, content: m.content }
      })

      const run = async (): Promise<void> => {
        try {
          const body: Record<string, unknown> = {
            model: this.model,
            messages: apiMessages,
            stream: true
          }
          if (tools?.length) {
            body.tools = tools
            if (options?.toolChoice) body.tool_choice = options.toolChoice
          } else if (options?.toolChoice === 'none') {
            body.tool_choice = 'none'
          }

          const response = await axios.post(`${this.baseURL}/chat/completions`, body, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            responseType: 'stream'
          })

          const decoder = new StringDecoder('utf8')
          let lineBuffer = ''

          response.data.on('data', (chunk: Buffer) => {
            lineBuffer += decoder.write(chunk)
            const lines = lineBuffer.split('\n')
            lineBuffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine.startsWith('data: ')) continue
              const data = trimmedLine.slice(6)
              if (data === '[DONE]') {
                finalize()
                return
              }

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta

                if (delta?.content) {
                  ingestContent(delta.content as string)
                }

                if (delta?.tool_calls && options?.toolChoice !== 'none') {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0
                    if (!toolCallsAccumulator[idx]) {
                      toolCallsAccumulator[idx] = { id: '', name: '', arguments: '' }
                    }
                    if (tc.id) toolCallsAccumulator[idx].id = tc.id
                    if (tc.function?.name) toolCallsAccumulator[idx].name += tc.function.name
                    if (tc.function?.arguments) {
                      toolCallsAccumulator[idx].arguments += tc.function.arguments
                    }
                  }
                }
              } catch {
                // ignore bad SSE lines
              }
            }
          })

          response.data.on('end', () => finalize())
          response.data.on('error', (error: Error) => {
            callbacks.onError(error)
            resolve()
          })
        } catch (error) {
          callbacks.onError(error instanceof Error ? error : new Error(String(error)))
          resolve()
        }
      }

      run()
    })
  }
}
