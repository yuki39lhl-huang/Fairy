// src/renderer/src/services/micRecorder.ts

export interface MicAudioStats {
  durationSec: number
  wavBytes: number
  sampleRate: number
  channels: number
  peak: number
  rms: number
  rawBytes: number
  mimeType: string
}

export interface RecordOnceOptions {
  seconds?: number
  debugSave?: boolean
  minRms?: number
}

export interface RecordingResult {
  audioData: Uint8Array
  stats: MicAudioStats
}

export interface TranscribeRecordingResult {
  success: boolean
  text: string
  error?: string
  stats?: MicAudioStats
  debugPath?: string
}

let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let mediaStream: MediaStream | null = null
let recordingStartedAt = 0
let lastMimeType = ''

const TARGET_SAMPLE_RATE = 16000
const DEFAULT_RECORD_SECONDS = 5
const DEFAULT_MIN_RMS = 0.003

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getSupportedMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ]

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

function stopMediaTracks(): void {
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
}

export async function startRecording(): Promise<void> {

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    throw new Error('麦克风正在录音中，请先停止当前录音')
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    }
  })

  recordedChunks = []
  recordingStartedAt = performance.now()

  const mimeType = getSupportedMimeType()
  const recorderOptions = mimeType ? { mimeType } : undefined
  mediaRecorder = new MediaRecorder(mediaStream, recorderOptions)
  lastMimeType = mediaRecorder.mimeType || mimeType || 'browser-default'

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data)
  }

  mediaRecorder.start(250)



}

export async function stopRecording(): Promise<Uint8Array> {
  const { audioData } = await stopRecordingWithStats()
  return audioData
}

async function stopRecordingWithStats(): Promise<RecordingResult> {
  if (!mediaRecorder) throw new Error('还没开始录音')
  if (mediaRecorder.state === 'inactive') throw new Error('录音已经停止')

  const activeRecorder = mediaRecorder
  const actualMimeType = activeRecorder.mimeType || lastMimeType

  const rawBlob = await new Promise<Blob>((resolve, reject) => {
    activeRecorder.onerror = (event) => {
      reject(new Error(`麦克风录音失败：${event.error?.message ?? '未知错误'}`))
    }
    activeRecorder.onstop = () => {
      resolve(new Blob(recordedChunks, { type: actualMimeType }))
    }
    activeRecorder.stop()
  })

  stopMediaTracks()
  mediaRecorder = null

  if (rawBlob.size === 0) {
    throw new Error('录音数据为空，请确认开始和停止之间真的说了几秒钟')
  }

  const converted = await convertToWav16kMono(rawBlob, actualMimeType)
  const measuredDurationSec = (performance.now() - recordingStartedAt) / 1000

  return {
    audioData: converted.audioData,
    stats: {
      ...converted.stats,
      durationSec: Number(Math.max(converted.stats.durationSec, measuredDurationSec).toFixed(3))
    }
  }
}

export async function recordOnce(options: RecordOnceOptions = {}): Promise<TranscribeRecordingResult> {
  const seconds = Math.max(1, options.seconds ?? DEFAULT_RECORD_SECONDS)
  const minRms = options.minRms ?? DEFAULT_MIN_RMS

  try {
    await startRecording()
    console.log(`[testMic] 开始录音 ${seconds} 秒，请现在说话...`)
    await delay(seconds * 1000)

    const { audioData, stats } = await stopRecordingWithStats()
    console.log('[testMic] 录音统计:', stats)

    if (stats.rms < minRms) {
      let debugPath: string | undefined
      if (options.debugSave) {
        const saveResult = await window.api.transcribeRecording(audioData, {
          debugSave: true,
          stats
        })
        debugPath = saveResult.debugPath
      }

      return {
        success: false,
        text: '',
        error: `麦克风音量太低,RMS=${stats.rms}，请确认输入设备、系统权限和麦克风音量`,
        stats,
        debugPath
      }
    }

    const result = await window.api.transcribeRecording(audioData, {
      debugSave: options.debugSave,
      stats
    })

    console.log('[testMic] Whisper 识别结果:', result)
    return result
  } catch (error) {
    stopMediaTracks()
    mediaRecorder = null
    const message = error instanceof Error ? error.message : String(error)
    console.error('[testMic] 录音测试失败:', message)
    return { success: false, text: '', error: message }
  }
}

async function convertToWav16kMono(
  recordingBlob: Blob,
  mimeType: string
): Promise<RecordingResult> {
  const arrayBuffer = await recordingBlob.arrayBuffer()
  const audioContext = new AudioContext()

  try {
    const decodedAudio = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const offlineContext = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(decodedAudio.duration * TARGET_SAMPLE_RATE)),
      TARGET_SAMPLE_RATE
    )

    const source = offlineContext.createBufferSource()
    source.buffer = decodedAudio
    source.connect(offlineContext.destination)
    source.start()

    const resampled = await offlineContext.startRendering()
    const pcmData = resampled.getChannelData(0)
    const audioData = encodeWav16Mono(pcmData, TARGET_SAMPLE_RATE)

    return {
      audioData,
      stats: {
        ...calculateStats(pcmData),
        durationSec: Number((pcmData.length / TARGET_SAMPLE_RATE).toFixed(3)),
        wavBytes: audioData.byteLength,
        sampleRate: TARGET_SAMPLE_RATE,
        channels: 1,
        rawBytes: recordingBlob.size,
        mimeType
      }
    }
  } finally {
    await audioContext.close().catch(() => { })
  }
}

function calculateStats(pcmData: Float32Array): Pick<MicAudioStats, 'peak' | 'rms'> {
  let peak = 0
  let squareSum = 0

  for (let i = 0; i < pcmData.length; i++) {
    const abs = Math.abs(pcmData[i])
    if (abs > peak) peak = abs
    squareSum += pcmData[i] * pcmData[i]
  }

  const rms = pcmData.length > 0 ? Math.sqrt(squareSum / pcmData.length) : 0

  return {
    peak: Number(peak.toFixed(6)),
    rms: Number(rms.toFixed(6))
  }
}

function encodeWav16Mono(pcmData: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + pcmData.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + pcmData.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, pcmData.length * 2, true)

  let offset = 44
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, pcmData[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return new Uint8Array(buffer)
}

; (window as any).testMic = { startRecording, stopRecording, recordOnce, startRecordingWithVad, abortVadRecording }

export interface VadOptions {
  /** RMS 高于此视为有声音，默认 0.02 */
  silenceThreshold?: number
  /**
   * 判定「说完」所需的连续静音时长。
   * 换气/顿挫通常 <1.2s；句末停顿更长。默认 2000ms，避免一喘气就截断。
   */
  silenceDurationMs?: number
  /**
   * 累计有效发声时长达到此值后，才允许用静音结束本轮。
   * 防止刚开口一个字、短促杂音就进入「可结束」状态。默认 700ms。
   */
  minSpeechMs?: number
  /**
   * 连续发声达到此值才算「真的开始说话」（过滤咳嗽/碰麦）。默认 180ms。
   */
  speechStartMs?: number
  /** 最长录音，超时强制结束。默认 45000ms */
  maxDurationMs?: number
}

let vadAudioContext: AudioContext | null = null
let vadAnalyser: AnalyserNode | null = null
let vadIntervalId: number | null = null
let vadActive = false

/**
 * 开始录音，同时实时监听音量。
 * 规则：确认开过口 → 累计发声够长 → 再连续静音一段时间 → 才自动截断并回调。
 * （纯能量 VAD，不是语义端点；豆包那类会再叠流式 ASR/语义完句判断。）
 */
export async function startRecordingWithVad(
  onSilenceDetected: (audioData: Uint8Array) => void,
  options: VadOptions = {}
): Promise<void> {
  const silenceThreshold = options.silenceThreshold ?? 0.02
  const silenceDurationMs = options.silenceDurationMs ?? 2000
  const minSpeechMs = options.minSpeechMs ?? 700
  const speechStartMs = options.speechStartMs ?? 180
  const maxDurationMs = options.maxDurationMs ?? 45000
  const pollMs = 100

  await startRecording()
  vadActive = true

  vadAudioContext = new AudioContext()
  const source = vadAudioContext.createMediaStreamSource(mediaStream!)
  vadAnalyser = vadAudioContext.createAnalyser()
  vadAnalyser.fftSize = 2048
  source.connect(vadAnalyser)

  const dataArray = new Float32Array(vadAnalyser.fftSize)
  let hasSpokenYet = false
  let continuousSpeechMs = 0
  let voicedTotalMs = 0
  let silenceStartedAt = 0
  const recordingStartedAt = performance.now()

  async function finishRecording(): Promise<void> {
    if (!vadActive) return // 已经被abortVadRecording手动中止，不再触发回调
    vadActive = false

    vadAudioContext?.close().catch(() => { })
    vadAudioContext = null
    vadAnalyser = null

    const audioData = await stopRecording() // 同模块内部直接调用，调用方不用管这一步
    onSilenceDetected(audioData)
  }

  vadIntervalId = window.setInterval(() => {
    if (!vadAnalyser || vadIntervalId === null) return
    vadAnalyser.getFloatTimeDomainData(dataArray)

    let squareSum = 0
    for (let i = 0; i < dataArray.length; i++) {
      squareSum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(squareSum / dataArray.length)
    const now = performance.now()
    const speaking = rms >= silenceThreshold

    if (speaking) {
      continuousSpeechMs += pollMs
      voicedTotalMs += pollMs
      silenceStartedAt = 0
      if (!hasSpokenYet && continuousSpeechMs >= speechStartMs) {
        hasSpokenYet = true
      }
    } else {
      continuousSpeechMs = 0
      if (hasSpokenYet && voicedTotalMs >= minSpeechMs) {
        if (silenceStartedAt === 0) silenceStartedAt = now
        // 说得越久，句末静音可略收紧（仍不低于 1.4s），兼顾长句与自然停顿
        const adaptiveSilence = Math.max(
          1400,
          silenceDurationMs - Math.min(600, Math.floor(voicedTotalMs / 20))
        )
        if (now - silenceStartedAt >= adaptiveSilence) {
          window.clearInterval(vadIntervalId!)
          vadIntervalId = null
          void finishRecording()
          return
        }
      }
    }

    if (now - recordingStartedAt >= maxDurationMs) {
      console.warn('[VAD] 超过最长时长仍未检测到有效停顿，强制触发')
      window.clearInterval(vadIntervalId!)
      vadIntervalId = null
      void finishRecording()
    }
  }, pollMs)
}
/**
 * 手动中止正在进行的VAD监听（用户点了静音）。
 * 不会触发onSilenceDetected回调，真正停止MediaRecorder、释放麦克风占用。
 */
export function abortVadRecording(): void {
  if (!vadActive) return
  vadActive = false

  if (vadIntervalId !== null) {
    window.clearInterval(vadIntervalId)
    vadIntervalId = null
  }
  vadAudioContext?.close().catch(() => { })
  vadAudioContext = null
  vadAnalyser = null

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  stopMediaTracks()
  mediaRecorder = null
}
