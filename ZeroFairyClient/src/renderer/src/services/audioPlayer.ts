// src/renderer/src/services/audioPlayer.ts
import { Howl, Howler } from 'howler'

let currentSound: Howl | null = null
let currentObjectUrl: string | null = null

let analyser: AnalyserNode | null = null
let freqData: Uint8Array | null = null
let mouthSyncRafId: number | null = null

// 不管这段代码实际跑在哪个窗口，只管往外广播，谁关心谁自己订阅
const mouthSyncChannel = new BroadcastChannel('fairy-mouth-sync')

function ensureAnalyser(): AnalyserNode {
  if (!analyser) {
    analyser = Howler.ctx.createAnalyser()
    analyser.fftSize = 256
    freqData = new Uint8Array(analyser.frequencyBinCount)
    Howler.masterGain.connect(analyser)
  }
  return analyser
}

function getVolume(): number {
  if (!analyser || !freqData) return 0
  analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>)
  let sum = 0
  for (let i = 0; i < freqData.length; i++) sum += freqData[i]
  const normalized = Math.min(1, sum / freqData.length / 180)
  let smoothed = Math.pow(normalized, 0.8)
  if (smoothed < 0.05) smoothed = 0
  return smoothed
}

function startMouthSync(): void {
  ensureAnalyser()
  const loop = (): void => {
    mouthSyncChannel.postMessage(getVolume())
    mouthSyncRafId = requestAnimationFrame(loop)
  }
  loop()
}

function stopMouthSync(): void {
  if (mouthSyncRafId !== null) {
    cancelAnimationFrame(mouthSyncRafId)
    mouthSyncRafId = null
  }
  mouthSyncChannel.postMessage(0)
}

/** 立刻停掉当前播放（新一轮对话打断旧语音时用） */
export function stopReplyAudio(): void {
  if (currentSound) {
    currentSound.stop()
    currentSound.unload()
    currentSound = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
  stopMouthSync()
}

/**
 * 播放主进程推来的音频二进制数据。
 * onEnd：播放真正结束时触发（正常播完、或者播放失败都会触发，保证调用方不会因为播放失败就永远等不到"结束"信号）。
 */
export function playReplyAudio(audioData: Uint8Array, onEnd?: () => void): void {
  stopReplyAudio()

  if (Howler.ctx && Howler.ctx.state !== 'running') {
    Howler.ctx.resume()
  }

  const blob = new Blob([audioData as unknown as BlobPart], { type: 'audio/wav' })
  currentObjectUrl = URL.createObjectURL(blob)

  currentSound = new Howl({
    src: [currentObjectUrl],
    format: ['wav'],
    onplay: () => startMouthSync(),
    onend: () => {
      stopMouthSync()
      onEnd?.()
    },
    onloaderror: (_id, err) => {
      console.error('[audioPlayer] 音频加载失败:', err)
      stopMouthSync()
      onEnd?.()
    },
    onplayerror: (_id, err) => {
      console.error('[audioPlayer] 音频播放失败:', err)
      stopMouthSync()
      onEnd?.()
    }
  })

  currentSound.play()
}