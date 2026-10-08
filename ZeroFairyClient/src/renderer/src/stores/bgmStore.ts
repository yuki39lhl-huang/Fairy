// Pinia：背景音乐偏好与播放状态
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getBgmCurrentTime,
  getBgmDuration,
  getBgmSnapshot,
  getCurrentTrack,
  onBgmState,
  playTrack,
  seekBgm,
  seekBgmBy,
  setBgmEnabled,
  setBgmPlayMode,
  setBgmTrackList,
  setBgmVolume,
  type BgmPlayMode,
  type BgmTrack
} from '../services/bgmPlayer'
import { setFairyVoiceVolume } from '../services/audioPlayer'

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

  const currentTrack = computed(() => getCurrentTrack())
  const progress = computed(() => {
    if (duration.value <= 0) return 0
    return Math.min(1, Math.max(0, currentTime.value / duration.value))
  })

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
      void window.api.setBgmSettings({
        enabled: enabled.value,
        playMode: playMode.value,
        bgmVolume: bgmVolume.value,
        fairyVoiceVolume: fairyVoiceVolume.value,
        lastTrackId: currentId.value
      })
    }, 200)
  }

  async function bootstrap(): Promise<void> {
    if (ready.value) return
    const [listRes, settings] = await Promise.all([
      window.api.listBgmTracks(),
      window.api.getBgmSettings()
    ])
    libraryDir.value = listRes.dir
    setBgmTrackList(listRes.tracks)
    tracks.value = listRes.tracks

    enabled.value = settings.enabled
    playMode.value = settings.playMode
    bgmVolume.value = settings.bgmVolume
    fairyVoiceVolume.value = settings.fairyVoiceVolume
    currentId.value = settings.lastTrackId

    setBgmPlayMode(settings.playMode)
    setBgmVolume(settings.bgmVolume)
    setFairyVoiceVolume(settings.fairyVoiceVolume)

    if (settings.lastTrackId && listRes.tracks.some((t) => t.id === settings.lastTrackId)) {
      currentId.value = settings.lastTrackId
    } else {
      currentId.value = listRes.tracks[0]?.id ?? null
    }

    unsubState?.()
    unsubState = onBgmState(() => {
      syncFromPlayer()
      schedulePersist()
    })
    ensureProgressTimer()

    // 首次默认关闭；若用户曾打开则恢复播放
    if (settings.enabled && currentId.value) {
      await setBgmEnabled(true)
      await playTrack(currentId.value)
    } else {
      await setBgmEnabled(false)
    }

    syncFromPlayer()
    ready.value = true
  }

  async function refreshTracks(): Promise<void> {
    const listRes = await window.api.listBgmTracks()
    libraryDir.value = listRes.dir
    setBgmTrackList(listRes.tracks)
    tracks.value = listRes.tracks
    syncFromPlayer()
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
    if (!enabled.value) {
      enabled.value = true
      await setBgmEnabled(true)
    }
    currentId.value = id
    await playTrack(id)
    schedulePersist()
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
    ready,
    currentTrack,
    currentTime,
    duration,
    progress,
    bootstrap,
    refreshTracks,
    toggleEnabled,
    changePlayMode,
    changeBgmVolume,
    changeFairyVoiceVolume,
    selectTrack,
    seekTo,
    seekBy
  }
})
