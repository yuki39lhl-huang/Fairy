import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { agentEventBus } from './agentEventBus'
import { storeManager } from './store'
import { importWorldBookFromDocs } from './db/importWorldBook'
import { worldBookDb } from './db/gameWorldBook'
import { createLLMAdapter } from './llmAdapter'
import { buildPromptMessages } from './llmAdapter/promptCore'
import { ChatMessage, ToolCall } from './llmAdapter/baseModel'
import { getDb } from './db'
import { retrieveMemories, saveDailogHistory, maybeExtractMemory } from './memorySystem'
import { allTools, getToolByName } from './toolSystem'
import { toolsToOpenAIFormat } from './llmAdapter/functionCall'
import { initAccountingTable } from './db/accounting'
import { synthesizeSpeech } from './voice/ttsClient'
import { transcribeSpeech } from './voice/whisperClient'
import { createSentenceSegmenter } from './voice/sentenceSegmenter'

interface MicAudioStats {
  durationSec: number
  wavBytes: number
  sampleRate: number
  channels: number
  peak: number
  rms: number
  rawBytes: number
  mimeType: string
}

interface TranscribeRecordingOptions {
  debugSave?: boolean
  stats?: MicAudioStats
}

function toAudioBuffer(audioData: Uint8Array | ArrayBuffer | number[] | Buffer): Buffer {
  if (Buffer.isBuffer(audioData)) return audioData
  if (audioData instanceof ArrayBuffer) return Buffer.from(audioData)
  if (ArrayBuffer.isView(audioData)) {
    return Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
  }
  if (Array.isArray(audioData)) return Buffer.from(audioData)
  throw new Error('麦克风数据格式不正确，无法写入 WAV')
}

function assertWavBuffer(audioBuffer: Buffer): void {
  const isWav =
    audioBuffer.length >= 44 &&
    audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE'

  if (!isWav) {
    throw new Error('麦克风数据不是有效 WAV 文件，请检查前端录音转换是否成功')
  }
}

async function saveMicDebugFile(audioBuffer: Buffer): Promise<string> {
  const fs = await import('fs')
  const outputDir = join(app.getPath('documents'), 'ZeroFairyClient', '麦克风调试')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filePath = join(outputDir, `mic-${timestamp}.wav`)
  await fs.promises.writeFile(filePath, audioBuffer)
  return filePath
}

let voiceCallWindow: BrowserWindow | null = null

/**
 * 一轮对话真正结束时的收尾逻辑：推事件、存历史、提炼记忆、合成语音。
 * 两处onDone（直接回复 / 工具调用后回复）共用这一个函数，避免重复代码。
 */
/* function finalizeAssistantTurn(userText: string, fullReply: string): void {
  agentEventBus.emit('ai:done', {})
  const session = new Date().toDateString()
  saveDailogHistory(session, userText, fullReply)
  maybeExtractMemory(userText, fullReply)

  // 开关1：关了的话这轮不合成语音，直接结束
  if (!storeManager.getVoiceEnabled()) return

  synthesizeSpeech(fullReply)
    .then(async ({ audioBuffer }) => {
      // 通话窗口开着时，语音只推给它，主窗口不再重复播放同一段声音
      if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
        voiceCallWindow.webContents.send('ag-ui-event', {
          type: 'ai:audio-ready',
          payload: { audioData: audioBuffer }
        })
      } else {
        agentEventBus.emit('ai:audio-ready', { audioData: audioBuffer })
      }

      if (storeManager.getVoiceSaveToFile()) {
        const fs = await import('fs')
        const outputDir = join(app.getPath('documents'), 'ZeroFairyClient', '语音')
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filePath = join(outputDir, `fairy-${timestamp}.wav`)
        await fs.promises.writeFile(filePath, audioBuffer)
        console.log('[voice] 已额外保存音频文件:', filePath)
      }
    })
    .catch((err) => {
      console.error('[voice] 语音合成失败:', err instanceof Error ? err.message : String(err))
    })
} */
function finalizeAssistantTurn(
  userText: string,
  fullReply: string,
  segmenter: ReturnType<typeof createSentenceSegmenter> | null,
  ttsQueue: ReturnType<typeof createStreamingTtsQueue> | null
): void {
  agentEventBus.emit('ai:done', {})
  const session = new Date().toDateString()
  saveDailogHistory(session, userText, fullReply)
  maybeExtractMemory(userText, fullReply)

  if (segmenter && ttsQueue) {
    // 分句流式模式：把最后没被终结符切到的尾巴补发出去
    const trailing = segmenter.flush()
    if (trailing) ttsQueue.pushSentence(trailing)
    return
  }

  // segmenter/ttsQueue为null有两种情况：语音整体关闭，或者"存文件到本地"开着、这轮改走整段合成
  if (!storeManager.getVoiceEnabled()) return
  synthesizeSpeech(fullReply)
    .then(({ audioBuffer }) => sendSynthesizedAudio(audioBuffer))
    .catch((err) => {
      console.error('[voice] 整段语音合成失败:', err instanceof Error ? err.message : String(err))
    })
}

async function sendSynthesizedAudio(audioBuffer: Buffer): Promise<void> {
  if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
    voiceCallWindow.webContents.send('ag-ui-event', {
      type: 'ai:audio-ready',
      payload: { audioData: audioBuffer }
    })
  } else {
    agentEventBus.emit('ai:audio-ready', { audioData: audioBuffer })
  }

  if (storeManager.getVoiceSaveToFile()) {
    const fs = await import('fs')
    const outputDir = join(app.getPath('documents'), 'ZeroFairyClient', '语音')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filePath = join(outputDir, `fairy-${timestamp}-${Math.random().toString(36).slice(2, 6)}.wav`)
    await fs.promises.writeFile(filePath, audioBuffer)
    console.log('[voice] 已额外保存音频文件:', filePath)
  }
}

function createStreamingTtsQueue(): { pushSentence: (sentence: string) => void } {
  const queue: string[] = []
  let synthesizing = false

  function processNext(): void {
    if (synthesizing || queue.length === 0) return
    const sentence = queue.shift()!
    synthesizing = true
    synthesizeSpeech(sentence)
      .then(({ audioBuffer }) => sendSynthesizedAudio(audioBuffer))
      .catch((err) => {
        console.error('[voice] 分句语音合成失败:', err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        synthesizing = false
        processNext()
      })
  }

  function pushSentence(sentence: string): void {
    if (!sentence.trim()) return
    queue.push(sentence)
    processNext()
  }

  return { pushSentence }
}


function forwardEmotionToRenderer(emotion: string): void {
  console.log('[emotion] 检测到情绪标签:', emotion)
  const eventPayload = { type: 'ai:emotion' as const, payload: { emotion } }
  console.log('[emotion] 即将发送的完整事件对象:', JSON.stringify(eventPayload))
  if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
    voiceCallWindow.webContents.send('ag-ui-event', eventPayload)
  } else {
    agentEventBus.emit('ai:emotion', { emotion })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    agentEventBus.register(mainWindow.webContents)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createVoiceCallWindow(): void {
  if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
    voiceCallWindow.focus()
    return
  }

  voiceCallWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#041428',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    voiceCallWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/voice-call`)
  } else {
    voiceCallWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'voice-call' })
  }

  voiceCallWindow.once('ready-to-show', () => {
    voiceCallWindow?.show()
    voiceCallWindow?.maximize()
    if (voiceCallWindow) {
      agentEventBus.register(voiceCallWindow.webContents)
    }
    if (is.dev) {
      voiceCallWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  voiceCallWindow.on('maximize', () => {
    if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
      voiceCallWindow.webContents.send('voice-call-window-state', { maximized: true })
    }
  })

  voiceCallWindow.on('unmaximize', () => {
    if (voiceCallWindow && !voiceCallWindow.isDestroyed()) {
      voiceCallWindow.webContents.send('voice-call-window-state', { maximized: false })
    }
  })

  voiceCallWindow.on('closed', () => {
    voiceCallWindow = null
  })
}

app.whenReady().then(() => {
  //明确批准麦克风等媒体权限请求,不依赖Electron未文档化的默认权限行为
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  getDb()
  initAccountingTable() // 初始化会计表
  importWorldBookFromDocs()
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(
    'send-message',
    async (_event, text: string, history: ChatMessage[]) => {
      console.log('[Main 1] 收到 send-message:', text)

      try {
        const adapter = createLLMAdapter()

        if (!adapter.hasApiKey()) {
          agentEventBus.emit('ai:error', { message: '请先在设置页配置 API Key' })
          return 'no-key'
        }

        const memories = retrieveMemories()

        const ragResults = worldBookDb.search(text, 2)
        console.log('[RAG] 检索到的条目数:', ragResults.length, '命中:', ragResults.map(r => r.title))
        const ragContext = ragResults.length > 0
          ? ragResults.map(r => `[${r.title}]\n${r.content}`).join('\n\n')
          : undefined

        const messages = buildPromptMessages(text, history, memories, ragContext)

        // 把已注册的所有工具转换成模型能理解的格式
        const toolsForModel = toolsToOpenAIFormat(allTools)
        console.log('[Tool] 本次可用工具:', allTools.map(t => t.definition.name))

        let fullReply = ''
        const voiceOn = storeManager.getVoiceEnabled()
        const saveToFile = storeManager.getVoiceSaveToFile()
        const useStreaming = voiceOn && !saveToFile   // 存文件开着的时候，这轮强制走整段合成
        const segmenter = useStreaming ? createSentenceSegmenter() : null
        const ttsQueue = useStreaming ? createStreamingTtsQueue() : null

        const handleChunk = (chunk: string): void => {
          fullReply += chunk
          agentEventBus.emit('ai:text-chunk', { text: chunk })
          if (segmenter && ttsQueue) {
            for (const sentence of segmenter.feed(chunk)) {
              ttsQueue.pushSentence(sentence)
            }
          }
        }

        await adapter.chatStream(
          messages,
          {
            onChunk: handleChunk,
            onEmotion: forwardEmotionToRenderer,
            onToolCall: async (toolCalls: ToolCall[]) => {
              try {
                console.log('[Tool] 模型请求调用工具:', toolCalls.map(t => t.name))
                agentEventBus.emit('ai:tool-call', { tools: toolCalls.map(t => t.name) })

                const toolResultMessages: ChatMessage[] = []
                for (const call of toolCalls) {
                  const tool = getToolByName(call.name)
                  let resultText = '工具未找到'
                  if (tool) {
                    try {
                      const args = call.arguments ? JSON.parse(call.arguments) : {}
                      resultText = await tool.execute(args)
                      console.log('[Tool] 执行结果:', call.name, '->', resultText)
                    } catch (err) {
                      resultText = `工具执行出错: ${err instanceof Error ? err.message : String(err)}`
                    }
                  }
                  toolResultMessages.push({
                    role: 'tool',
                    content: resultText,
                    tool_call_id: call.id
                  })
                }

                // 组装第二轮消息：原对话 + 模型的工具调用请求 + 工具执行结果
                const followUpMessages: ChatMessage[] = [
                  ...messages,
                  { role: 'assistant', content: '', tool_calls: toolCalls },
                  ...toolResultMessages
                ]

                // 第二次请求模型：这次它会依据真实工具结果生成自然语言回复
                await adapter.chatStream(followUpMessages, {
                  onChunk: handleChunk,
                  onEmotion: forwardEmotionToRenderer,
                  onDone: () => {
                    finalizeAssistantTurn(text, fullReply, segmenter, ttsQueue)
                  },
                  onError: (err) => agentEventBus.emit('ai:error', { message: err.message })
                })
              } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err))
                console.error('[Tool] 处理工具调用时出错:', error)
                agentEventBus.emit('ai:error', { message: error.message })
              }
            },
            onDone: () => {
              finalizeAssistantTurn(text, fullReply, segmenter, ttsQueue)
            },
            onError: (err) => {
              agentEventBus.emit('ai:error', { message: err.message })
            }
          },
          toolsForModel
        )

        return 'ok'
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        agentEventBus.emit('ai:error', { message: err.message })
        return 'error'
      }
    }
  )

  ipcMain.handle('save-api-key', (_event, provider: string, key: string) => {
    storeManager.setApiKey(provider, key)
  })

  ipcMain.handle('get-api-key', (_event, provider: string) => {
    const key = storeManager.getApiKey(provider) ?? ''
    if (!key) return ''
    return key.substring(0, 4) + '****'
  })

  ipcMain.handle('get-voice-enabled', () => {
    return storeManager.getVoiceEnabled()
  })

  ipcMain.handle('open-voice-call-window', () => {
    createVoiceCallWindow()
  })

  ipcMain.handle('minimize-voice-call-window', () => {
    voiceCallWindow?.minimize()
  })

  ipcMain.handle('toggle-maximize-voice-call-window', () => {
    if (!voiceCallWindow || voiceCallWindow.isDestroyed()) return false
    if (voiceCallWindow.isFullScreen()) {
      voiceCallWindow.setFullScreen(false)
    }
    if (voiceCallWindow.isMaximized()) {
      voiceCallWindow.unmaximize()
      return false
    }
    voiceCallWindow.maximize()
    return true
  })

  ipcMain.handle('is-voice-call-window-maximized', () => {
    return Boolean(voiceCallWindow && !voiceCallWindow.isDestroyed() && voiceCallWindow.isMaximized())
  })

  ipcMain.handle('set-voice-enabled', (_event, enabled: boolean) => {
    storeManager.setVoiceEnabled(enabled)
  })

  ipcMain.handle('get-voice-save-to-file', () => {
    return storeManager.getVoiceSaveToFile()
  })

  ipcMain.handle('set-voice-save-to-file', (_event, enabled: boolean) => {
    storeManager.setVoiceSaveToFile(enabled)
  })

  ipcMain.handle('whisper:transcribe', async (_event, audioPath: string) => {
    try {
      console.log('[whisper] 开始识别:', audioPath)

      const text = await transcribeSpeech(audioPath)

      console.log('[whisper] 识别完成:', text)
      return { success: true, text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[whisper] 识别失败:', message)
      return { success: false, text: '', error: message }
    }
  })

  ipcMain.handle(
    'whisper:transcribe-recording',
    async (_event, audioData: Uint8Array, options: TranscribeRecordingOptions = {}) => {
      const fs = await import('fs')
      const { tmpdir } = await import('os')
      const { randomUUID } = await import('crypto')
      const tempPath = join(tmpdir(), `zerofairy-mic-${randomUUID()}.wav`)
      let debugPath: string | undefined

      try {
        const audioBuffer = toAudioBuffer(audioData)
        assertWavBuffer(audioBuffer)

        if (options.debugSave) {
          debugPath = await saveMicDebugFile(audioBuffer)
          console.log('[whisper] 麦克风调试音频已保存:', debugPath)
        }

        await fs.promises.writeFile(tempPath, audioBuffer)
        const text = await transcribeSpeech(tempPath)

        if (!text.trim()) {
          return {
            success: false,
            text: '',
            error: 'Whisper 没有识别出文字，请先播放 debugPath 对应的 WAV 确认录音里有人声',
            stats: options.stats,
            debugPath
          }
        }

        console.log('[whisper] 麦克风识别完成:', text)
        return { success: true, text, stats: options.stats, debugPath }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[whisper] 麦克风识别失败:', message)
        return { success: false, text: '', error: message, stats: options.stats, debugPath }
      } finally {
        await fs.promises.unlink(tempPath).catch(() => { })
      }
    }
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})