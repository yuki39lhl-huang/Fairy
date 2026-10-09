// Pinia：背景音乐偏好与播放状态
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getBgmCurrentTime,
  getBgmDuration,
  getBgmSnapshot,
  onBgmState,
  playTrack,
  seekBgm,
  seekBgmBy,
  setBgmCurrentId,
  setBgmEnabled,
  setBgmPlayMode,
  setBgmTrackList,
  setBgmVolume,
  type BgmPlayMode,
  type BgmTrack
} from '../services/bgmPlayer'
import { setFairyVoiceVolume } from '../services/audioPlayer'

function applyTrackOrder(list: BgmTrack[], order: string[]): BgmTrack[] {
  if (!order.length) return list
  const byId = new Map(list.map((track) => [track.id, track]))
  const next: BgmTrack[] = []
  for (const id of order) {
    const track = byId.get(id)
    if (!track) continue
    next.push(track)
    byId.delete(id)
  }
  for (const track of list) {
    if (byId.has(track.id)) next.push(track)
  }
  return next
}

export const useBgmStore = defineStore('bgm', () => {
  const tracks = ref<BgmTrack[]>([])
  const libraryDir = ref('')
  const enabled = ref(false)
  const playMode = ref<BgmPlayMode>('loop-all')
  const bgmVolume = ref(0.35)
  const fairyVoiceVolume = ref(1)
  const currentId = ref<string | null>(null)
  const playing = ref(false)
  const ready = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  let unsubState: (() => void) | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let progressTimer: ReturnType<typeof setInterval> | null = null
  let hideBound = false

  const progress = computed(() => {
    if (duration.value <= 0) return 0
    return Math.min(1, Math.max(0, currentTime.value / duration.value))
  })

  function settingsPayload(): {
    enabled: boolean
    playMode: BgmPlayMode
    bgmVolume: number
    fairyVoiceVolume: number
    lastTrackId?: string | null
    trackOrder?: string[]
  } {
    const payload: {
      enabled: boolean
      playMode: BgmPlayMode
      bgmVolume: number
      fairyVoiceVolume: number
      lastTrackId?: string | null
      trackOrder?: string[]
    } = {
      enabled: enabled.value,
      playMode: playMode.value,
      bgmVolume: bgmVolume.value,
      fairyVoiceVolume: fairyVoiceVolume.value
    }
    if (tracks.value.length || currentId.value) {
      payload.lastTrackId = currentId.value
    }
    if (tracks.value.length) payload.trackOrder = tracks.value.map((track) => track.id)
    return payload
  }

  function persistNow(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void window.api?.setBgmSettings(settingsPayload())
  }

  function bindHideFlush(): void {
    if (hideBound) return
    hideBound = true
    window.addEventListener('pagehide', () => {
      window.api?.flushBgmSettings?.(settingsPayload())
    })
  }

  function syncProgress(): void {
    currentTime.value = getBgmCurrentTime()
    duration.value = getBgmDuration()
  }

  function ensureProgressTimer(): void {
    if (progressTimer) return
    progressTimer = setInterval(() => {
      syncProgress()
    }, 200)
  }

  function syncFromPlayer(): void {
    const snap = getBgmSnapshot()
    tracks.value = snap.tracks
    currentId.value = snap.currentId
    playMode.value = snap.playMode
    enabled.value = snap.enabled
    bgmVolume.value = snap.volume
    playing.value = snap.playing
    syncProgress()
  }

  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistNow()
    }, 200)
  }

  async function bootstrap(): Promise<void> {
    if (ready.value) return
    const [listRes, settings] = await Promise.all([
      window.api.listBgmTracks(),
      window.api.getBgmSettings()
    ])
    libraryDir.value = listRes.dir
    const ordered = applyTrackOrder(listRes.tracks, settings.trackOrder ?? [])
    setBgmTrackList(ordered)

    enabled.value = settings.enabled
    playMode.value = settings.playMode
    bgmVolume.value = settings.bgmVolume
    fairyVoiceVolume.value = settings.fairyVoiceVolume

    const resumeId =
      settings.lastTrackId && ordered.some((track) => track.id === settings.lastTrackId)
        ? settings.lastTrackId
        : (ordered[0]?.id ?? null)
    currentId.value = resumeId
    setBgmCurrentId(resumeId)

    setBgmPlayMode(settings.playMode)
    setBgmVolume(settings.bgmVolume)
    setFairyVoiceVolume(settings.fairyVoiceVolume)

    unsubState?.()
    unsubState = onBgmState(() => {
      syncFromPlayer()
      schedulePersist()
    })
    ensureProgressTimer()
    bindHideFlush()

    if (settings.enabled && resumeId) {
      await setBgmEnabled(true)
    } else {
      await setBgmEnabled(false)
    }

    syncFromPlayer()
    currentId.value = resumeId && tracks.value.some((track) => track.id === resumeId) ? resumeId : currentId.value
    ready.value = true
    persistNow()
  }

  async function refreshTracks(): Promise<void> {
    const listRes = await window.api.listBgmTracks()
    libraryDir.value = listRes.dir
    const ordered = applyTrackOrder(
      listRes.tracks,
      tracks.value.map((track) => track.id)
    )
    setBgmTrackList(ordered)
    persistNow()
  }

  function moveTrack(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= tracks.value.length || to >= tracks.value.length) {
      return
    }
    const next = tracks.value.slice()
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    setBgmTrackList(next)
  }

  function commitTrackOrder(): void {
    persistNow()
  }

  async function toggleEnabled(next?: boolean): Promise<void> {
    const value = typeof next === 'boolean' ? next : !enabled.value
    enabled.value = value
    await setBgmEnabled(value)
    schedulePersist()
  }

  async function changePlayMode(mode: BgmPlayMode): Promise<void> {
    playMode.value = mode
    setBgmPlayMode(mode)
    schedulePersist()
  }

  async function changeBgmVolume(v: number): Promise<void> {
    bgmVolume.value = v
    setBgmVolume(v)
    schedulePersist()
  }

  async function changeFairyVoiceVolume(v: number): Promise<void> {
    fairyVoiceVolume.value = v
    setFairyVoiceVolume(v)
    schedulePersist()
  }

  async function selectTrack(id: string): Promise<void> {
    currentId.value = id
    setBgmCurrentId(id)
    if (!enabled.value) {
      enabled.value = true
      await setBgmEnabled(true)
    } else {
      await playTrack(id)
    }
    persistNow()
  }

  async function seekTo(seconds: number): Promise<void> {
    await seekBgm(seconds)
    syncProgress()
  }

  async function seekBy(deltaSec: number): Promise<void> {
    await seekBgmBy(deltaSec)
    syncProgress()
  }

  return {
    tracks,
    libraryDir,
    enabled,
    playMode,
    bgmVolume,
    fairyVoiceVolume,
    currentId,
    playing,
    currentTime,
    duration,
    progress,
    bootstrap,
    refreshTracks,
    moveTrack,
    commitTrackOrder,
    toggleEnabled,
    changePlayMode,
    changeBgmVolume,
    changeFairyVoiceVolume,
    selectTrack,
    seekTo,
    seekBy
  }
})
