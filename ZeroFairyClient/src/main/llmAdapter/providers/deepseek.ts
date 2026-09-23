// src/main/llmAdapter/providers/deepseek.ts
import axios from 'axios'
import { StringDecoder } from 'string_decoder'
import { BaseModel, ChatMessage, StreamChunkCallback, ToolCall } from '../baseModel'

export class DeepSeekModel extends BaseModel {
  private baseURL = 'https://api.deepseek.com/beta'

  constructor(apiKey: string, model = 'deepseek-v4-flash') {
    super(apiKey, model)
  }

  async chatStream(
    messages: ChatMessage[],
    callbacks: StreamChunkCallback,
    tools?: object[]
  ): Promise<void> {
    // 关键修复：把整个流程包进一个Promise，只有真正流结束(finalize)时才resolve
    // 这样 await adapter.chatStream(...) 才会真正等到数据完整返回
    return new Promise<void>((resolve) => {
      let isDone = false
      let leakDetected = false
      const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> = {}

      // 情绪标签总在回复最开头，流式chunk很可能把它切碎，
      // 开头这一小段先攒起来匹配完整标签，匹配到/放弃等待后，后续chunk恢复直通
      let emotionResolved = false
      let emotionBuffer = ''
      const EMOTION_BUFFER_MAX = 40

      const finalize = (): void => {
        if (isDone) return
        isDone = true
        if (!emotionResolved && emotionBuffer && !leakDetected) {
          callbacks.onChunk(emotionBuffer)
          emotionBuffer = ''
        }
        const calls = Object.values(toolCallsAccumulator).filter((c) => c.name)
        if (calls.length > 0 && callbacks.onToolCall) {
          callbacks.onToolCall(calls as ToolCall[])
        } else {
          callbacks.onDone()
        }
        resolve() // 真正完工的时刻才resolve
      }

      const emitText = (text: string): void => {
        if (emotionResolved) {
          callbacks.onChunk(text)
          return
        }
        emotionBuffer += text
        const match = emotionBuffer.match(/^\s*\[emotion:([a-zA-Z]+)\]/)
        if (match) {
          const validEmotions = ['normal', 'smug', 'teasing', 'caring', 'alert']
          const emotion = validEmotions.includes(match[1]) ? match[1] : 'normal'
          callbacks.onEmotion?.(emotion)
          emotionBuffer = emotionBuffer.slice(match[0].length)
          emotionResolved = true
          if (emotionBuffer) callbacks.onChunk(emotionBuffer)
          return
        }
        if (emotionBuffer.length >= EMOTION_BUFFER_MAX) {
          // 攒到上限还没等到完整标签，放弃等待，原样吐出去，别把真实内容吞了
          emotionResolved = true
          callbacks.onChunk(emotionBuffer)
        }
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

      // const strictTools = tools?.map((t) => {
      //   const tool = t as { type: string; function: Record<string, unknown> }
      //   return { ...tool, function: { ...tool.function, strict: true } }
      // })


      const run = async (): Promise<void> => {
        try {
          const body: Record<string, unknown> = {
            model: this.model,
            messages: apiMessages,
            stream: true
          }
          // if (strictTools && strictTools.length > 0) {
          //   body.tools = strictTools
          // }
          if (tools?.length) {
            body.tools = tools
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
                  const text = delta.content as string
                  if (text.includes('DSML') || text.includes('invoke name') || text.includes('tool_calls>')) {
                    leakDetected = true
                    console.warn('[DeepSeek] 检测到协议标签泄漏，已拦截，不展示给用户:', text.slice(0, 60))
                  } else if (!leakDetected) {
                    emitText(text)
                  }
                }

                if (delta?.tool_calls) {
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
                // 忽略解析失败的行
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