// 背景音乐：主进程读文件 → decodeAudioData 播放（保证出声）+ Analyser 频谱

export type BgmPlayMode = 'loop-one' | 'loop-all' | 'shuffle'

export interface BgmTrack {
  id: string
  fileName: string
  title: string
  artist: string
}

type SpectrumListener = (bins: number[]) => void
type StateListener = () => void

const SPECTRUM_BARS = 32

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let gainNode: GainNode | null = null
let sourceNode: AudioBufferSourceNode | null = null
let freqData: Uint8Array | null = null
let rafId: number | null = null

let decodedCache = new Map<string, AudioBuffer>()
let tracks: BgmTrack[] = []
let currentId: string | null = null
let playMode: BgmPlayMode = 'loop-all'
let enabled = false
let baseVolume = 0.35
let playing = false
let pausedAt = 0
let startedAtCtx = 0
let activeBuffer: AudioBuffer | null = null

const spectrumListeners = new Set<SpectrumListener>()
const stateListeners = new Set<StateListener>()

function emitState(): void {
  for (const fn of stateListeners) fn()
}

function emitSpectrum(bins: number[]): void {
  for (const fn of spectrumListeners) fn(bins)
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctx()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.45
    analyser.minDecibels = -85
    analyser.maxDecibels = -18
    freqData = new Uint8Array(analyser.frequencyBinCount)
    gainNode = audioCtx.createGain()
    gainNode.gain.value = baseVolume
    analyser.connect(gainNode)
    gainNode.connect(audioCtx.destination)
  }
  return audioCtx
}

function applyVolume(): void {
  if (gainNode && audioCtx) {
    gainNode.gain.setTargetAtTime(
      Math.min(1, Math.max(0, baseVolume)),
      audioCtx.currentTime,
      0.02
    )
  }
}

function stopSpectrumLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  emitSpectrum(new Array(SPECTRUM_BARS).fill(0))
}

function startSpectrumLoop(): void {
  stopSpectrumLoop()
  const tick = (): void => {
    if (!analyser || !freqData || !playing) {
      emitSpectrum(new Array(SPECTRUM_BARS).fill(0))
      rafId = null
      return
    }
    analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>)
    const bins: number[] = []
    const len = freqData.length
    // 对数取频段：低音更宽、更跳；高频更细
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const t0 = i / SPECTRUM_BARS
      const t1 = (i + 1) / SPECTRUM_BARS
      const start = Math.floor(Math.pow(t0, 1.7) * len * 0.85)
      const end = Math.max(start + 1, Math.floor(Math.pow(t1, 1.7) * len * 0.85))
      let sum = 0
      for (let j = start; j < end && j < len; j++) sum += freqData[j]
      const avg = sum / (end - start)
      // 压低整体增益，避免一响就全部顶满、脉冲分不出高低
      let v = Math.pow(avg / 255, 1.35)
      v = Math.min(1, v * 1.05)
      if (v < 0.03) v = 0
      bins.push(v)
    }
    emitSpectrum(bins)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function stopSource(resetOffset: boolean): void {
  if (sourceNode) {
    try {
      sourceNode.onended = null
      sourceNode.stop()
    } catch {
      /* already stopped */
    }
    sourceNode.disconnect()
    sourceNode = null
  }
  if (resetOffset) pausedAt = 0
  playing = false
  stopSpectrumLoop()
}

function findIndex(id: string | null): number {
  if (!id) return -1
  return tracks.findIndex((t) => t.id === id)
}

function pickNextId(fromId: string | null): string | null {
  if (tracks.length === 0) return null
  const idx = findIndex(fromId)
  if (playMode === 'loop-one') {
    return fromId && findIndex(fromId) >= 0 ? fromId : tracks[0].id
  }
  if (playMode === 'shuffle') {
    if (tracks.length === 1) return tracks[0].id
    let next = Math.floor(Math.random() * tracks.length)
    if (idx >= 0 && next === idx) next = (next + 1) % tracks.length
    return tracks[next].id
  }
  const nextIdx = idx < 0 ? 0 : (idx + 1) % tracks.length
  return tracks[nextIdx].id
}

async function handleEnded(): Promise<void> {
  if (!enabled) {
    playing = false
    stopSpectrumLoop()
    emitState()
    return
  }
  pausedAt = 0
  const next = pickNextId(currentId)
  if (next) await playTrack(next)
}

async function decodeTrack(fileName: string): Promise<AudioBuffer> {
  const cached = decodedCache.get(fileName)
  if (cached) return cached

  const payload = await window.api.readBgmTrack(fileName)
  const bytes = payload.data instanceof Uint8Array ? payload.data : new Uint8Array(payload.data)
  // decodeAudioData 需要独占的 ArrayBuffer（不能把 SharedArrayBuffer 传进去）
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const ctx = getCtx()
  const buffer = await ctx.decodeAudioData(ab)
  decodedCache.set(fileName, buffer)
  return buffer
}

function startBuffer(buffer: AudioBuffer, offsetSec: number): void {
  const ctx = getCtx()
  stopSource(false)
  activeBuffer = buffer
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(analyser!)
  src.onended = () => {
    // 只有自然播完才切下一首；pause/stop 会清掉 onended
    if (!enabled) return
    if (sourceNode !== src) return
    sourceNode = null
    playing = false
    void handleEnded()
  }
  const offset = Math.min(Math.max(0, offsetSec), Math.max(0, buffer.duration - 0.05))
  src.start(0, offset)
  sourceNode = src
  startedAtCtx = ctx.currentTime
  pausedAt = offset
  playing = true
  applyVolume()
  startSpectrumLoop()
  emitState()
}

export function onBgmSpectrum(fn: SpectrumListener): () => void {
  spectrumListeners.add(fn)
  return () => spectrumListeners.delete(fn)
}

export function onBgmState(fn: StateListener): () => void {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

export function getBgmSnapshot(): {
  tracks: BgmTrack[]
  currentId: string | null
  playMode: BgmPlayMode
  enabled: boolean
  volume: number
  playing: boolean
} {
  return {
    tracks: [...tracks],
    currentId,
    playMode,
    enabled,
    volume: baseVolume,
    playing
  }
}

export function setBgmTrackList(next: BgmTrack[]): void {
  tracks = next
  emitState()
}

export function setBgmPlayMode(mode: BgmPlayMode): void {
  playMode = mode
  emitState()
}

export function setBgmVolume(v: number): void {
  baseVolume = Math.min(1, Math.max(0, v))
  applyVolume()
  emitState()
}

export async function playTrack(id: string): Promise<void> {
  const track = tracks.find((t) => t.id === id)
  if (!track) return

  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const same = currentId === id && activeBuffer
    currentId = id
    const buffer = same ? activeBuffer! : await decodeTrack(track.fileName)
    // 切歌从头播；同曲再次点选也从头
    startBuffer(buffer, 0)
    console.log('[bgm] 正在播放:', track.title, 'vol=', baseVolume)
  } catch (err) {
    console.error('[bgm] 播放失败:', err)
    stopSource(true)
    emitState()
  }
}

export async function pauseBgm(): Promise<void> {
  if (!playing || !audioCtx || !sourceNode) {
    playing = false
    stopSpectrumLoop()
    emitState()
    return
  }
  pausedAt = pausedAt + (audioCtx.currentTime - startedAtCtx)
  const src = sourceNode
  src.onended = null
  try {
    src.stop()
  } catch {
    /* ignore */
  }
  src.disconnect()
  sourceNode = null
  playing = false
  stopSpectrumLoop()
  emitState()
}

export async function setBgmEnabled(next: boolean): Promise<void> {
  enabled = next
  if (!next) {
    await pauseBgm()
    pausedAt = 0
    emitState()
    return
  }
  const prefer =
    (currentId && tracks.some((t) => t.id === currentId) && currentId) ||
    tracks[0]?.id ||
    null
  if (prefer) await playTrack(prefer)
  emitState()
}

export function getCurrentTrack(): BgmTrack | null {
  return tracks.find((t) => t.id === currentId) ?? null
}

/** 当前播放进度（秒） */
export function getBgmCurrentTime(): number {
  if (!activeBuffer) return 0
  if (playing && audioCtx && sourceNode) {
    return Math.min(
      activeBuffer.duration,
      Math.max(0, pausedAt + (audioCtx.currentTime - startedAtCtx))
    )
  }
  return Math.min(activeBuffer.duration, Math.max(0, pausedAt))
}

export function getBgmDuration(): number {
  return activeBuffer?.duration ?? 0
}

/** 跳转到指定秒数（拖动 / 方向键） */
export async function seekBgm(seconds: number): Promise<void> {
  if (!activeBuffer || !currentId) return
  const duration = activeBuffer.duration
  const target = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.05))
  const wasPlaying = playing
  if (wasPlaying) {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    startBuffer(activeBuffer, target)
  } else {
    pausedAt = target
    emitState()
  }
}

export async function seekBgmBy(deltaSec: number): Promise<void> {
  await seekBgm(getBgmCurrentTime() + deltaSec)
}
