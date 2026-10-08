<!-- 背景音乐：开关 / 模式 / 音量 / 曲目列表 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBgmStore } from '../stores/bgmStore'
import type { BgmPlayMode } from '../services/bgmPlayer'

defineProps<{ embedded?: boolean }>()

const bgm = useBgmStore()
const {
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
  progress
} = storeToRefs(bgm)

const modes: { id: BgmPlayMode; label: string; hint: string }[] = [
  { id: 'loop-one', label: '单曲循环', hint: '当前曲目循环' },
  { id: 'loop-all', label: '列表循环', hint: '播完下一首' },
  { id: 'shuffle', label: '随机播放', hint: '随机下一首' }
]

const dragging = ref(false)
const dragRatio = ref(0)
const SEEK_STEP = 5

const displayProgress = computed(() => (dragging.value ? dragRatio.value : progress.value))

onMounted(() => {
  void bgm.bootstrap()
  window.addEventListener('keydown', onKeySeek)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeySeek)
})

function onBgmVolume(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  void bgm.changeBgmVolume(v)
}

function onFairyVolume(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  void bgm.changeFairyVoiceVolume(v)
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

function onKeySeek(e: KeyboardEvent): void {
  if (isTypingTarget(e.target)) return
  if (!currentId.value || duration.value <= 0) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    void bgm.seekBy(-SEEK_STEP)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    void bgm.seekBy(SEEK_STEP)
  }
}

function ratioFromEvent(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

function onSeekPointerDown(e: PointerEvent): void {
  if (!currentId.value || duration.value <= 0) return
  e.preventDefault()
  e.stopPropagation()
  const el = e.currentTarget as HTMLElement
  dragging.value = true
  dragRatio.value = ratioFromEvent(el, e.clientX)
  el.setPointerCapture(e.pointerId)

  const onMove = (ev: PointerEvent): void => {
    dragRatio.value = ratioFromEvent(el, ev.clientX)
  }
  const onUp = (ev: PointerEvent): void => {
    dragging.value = false
    const ratio = ratioFromEvent(el, ev.clientX)
    dragRatio.value = ratio
    void bgm.seekTo(ratio * duration.value)
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

function onTrackRowClick(id: string): void {
  void bgm.selectTrack(id)
}
</script>

<template>
  <div class="page" :class="{ embedded }">
    <header v-if="!embedded" class="head">
      <h1 class="title">背景音乐</h1>
      <p class="desc">绝区零 OST 本地曲库 · 首次默认关闭，之后记住你的习惯</p>
    </header>

    <section class="block">
      <div class="row between">
        <div>
          <div class="label">音乐设置</div>
          <p class="hint">{{ enabled ? (playing ? '正在播放' : '已开启，待播放') : '已关闭' }}</p>
        </div>
        <button
          type="button"
          class="toggle"
          :class="{ on: enabled }"
          :aria-pressed="enabled"
          @click="bgm.toggleEnabled()"
        >
          {{ enabled ? '开' : '关' }}
        </button>
      </div>
    </section>

    <section class="block">
      <div class="label">播放模式</div>
      <div class="modes">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="mode"
          :class="{ active: playMode === m.id }"
          @click="bgm.changePlayMode(m.id)"
        >
          <span class="mode-name">{{ m.label }}</span>
          <span class="mode-hint">{{ m.hint }}</span>
        </button>
      </div>
    </section>

    <section class="block">
      <div class="label">音量</div>
      <label class="slider-row">
        <span class="slider-label">背景音乐</span>
        <input
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="bgmVolume"
          @input="onBgmVolume"
        />
        <span class="slider-val">{{ pct(bgmVolume) }}</span>
      </label>
      <label class="slider-row">
        <span class="slider-label">Fairy 语音</span>
        <input
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="fairyVoiceVolume"
          @input="onFairyVolume"
        />
        <span class="slider-val">{{ pct(fairyVoiceVolume) }}</span>
      </label>
    </section>

    <section class="block">
      <div class="row between">
        <div class="label">曲目 · {{ tracks.length }}</div>
        <button type="button" class="link" @click="bgm.refreshTracks()">刷新列表</button>
      </div>
      <p class="path">{{ libraryDir || '…' }}</p>

      <ul v-if="tracks.length" class="list">
        <li
          v-for="(track, index) in tracks"
          :key="track.id"
          class="track"
          :class="{ active: track.id === currentId, playing: track.id === currentId && playing }"
          @click="onTrackRowClick(track.id)"
        >
          <span class="idx">{{ index + 1 }}</span>
          <div class="meta" :class="{ 'with-seek': track.id === currentId }">
            <span class="song">{{ track.title }}</span>
            <div
              v-if="track.id === currentId && duration > 0"
              class="seek"
              role="slider"
              tabindex="0"
              :aria-valuemin="0"
              :aria-valuemax="Math.floor(duration)"
              :aria-valuenow="Math.floor(currentTime)"
              :aria-label="`进度 ${formatTime(currentTime)} / ${formatTime(duration)}，左右方向键微调`"
              @pointerdown="onSeekPointerDown"
              @click.stop
              @keydown.left.prevent="bgm.seekBy(-SEEK_STEP)"
              @keydown.right.prevent="bgm.seekBy(SEEK_STEP)"
            >
              <div class="seek-track">
                <div class="seek-fill" :style="{ width: `${displayProgress * 100}%` }" />
                <div class="seek-thumb" :style="{ left: `${displayProgress * 100}%` }" />
              </div>
              <span class="seek-time"
                >{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span
              >
            </div>
            <span class="artist">{{ track.artist }}</span>
          </div>
          <span v-if="track.id === currentId && playing" class="now">播放中</span>
        </li>
      </ul>
      <p v-else class="empty">曲库为空。把 mp3 放到上述目录后点「刷新列表」。</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px 48px;
  color: var(--agent-text);
}

.page.embedded {
  height: auto;
  overflow: visible;
  padding: 0;
}

.head {
  margin-bottom: 22px;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--agent-text-dim);
}

.block {
  margin-bottom: 22px;
  padding: 16px 18px;
  border: 0.5px solid var(--agent-border);
  border-radius: 14px;
  background: var(--agent-surface);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row.between {
  justify-content: space-between;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-text);
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--agent-text-dim);
}

.path {
  margin: 8px 0 14px;
  font-size: 11px;
  color: var(--agent-text-dim);
  word-break: break-all;
  opacity: 0.85;
}

.toggle {
  min-width: 52px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--agent-surface-2);
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.toggle.on {
  background: #e8eef8;
  color: #1a2332;
}

.modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border: 0.5px solid var(--agent-border);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mode:hover {
  background: var(--agent-sidebar-hover);
}

.mode.active {
  border-color: #7aa2d6;
  background: rgba(122, 162, 214, 0.12);
}

.mode-name {
  font-size: 13px;
  font-weight: 600;
}

.mode-hint {
  font-size: 11px;
  color: var(--agent-text-dim);
}

.slider-row {
  display: grid;
  grid-template-columns: 88px 1fr 44px;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.slider-label {
  font-size: 12px;
  color: var(--agent-text-mid);
}

.slider {
  width: 100%;
  accent-color: #8eb4e0;
}

.slider-val {
  font-size: 12px;
  color: var(--agent-text-dim);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.link {
  border: none;
  background: transparent;
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.track:hover {
  background: var(--agent-sidebar-hover);
}

.track.active {
  background: var(--agent-sidebar-active);
}

.idx {
  font-size: 12px;
  color: var(--agent-text-dim);
  font-variant-numeric: tabular-nums;
}

.meta {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.meta.with-seek {
  display: grid;
  grid-template-columns: minmax(72px, 0.9fr) minmax(120px, 1.4fr) minmax(72px, 0.9fr);
  align-items: center;
  gap: 10px;
}

.song {
  font-size: 13px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--agent-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.seek {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
  cursor: pointer;
  touch-action: none;
  outline: none;
}

.seek:focus-visible .seek-track {
  box-shadow: 0 0 0 1px rgba(158, 192, 234, 0.7);
}

.seek-track {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.seek-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #6f9fd4, #b7d4f2);
  pointer-events: none;
}

.seek-thumb {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e8f0fa;
  border: 1px solid rgba(120, 160, 210, 0.8);
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.2);
}

.seek-time {
  font-size: 10px;
  color: var(--agent-text-dim);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.now {
  font-size: 11px;
  color: #9ec0ea;
}

.empty {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--agent-text-dim);
}

@media (max-width: 720px) {
  .modes {
    grid-template-columns: 1fr;
  }

  .meta.with-seek {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .artist {
    text-align: left;
  }
}
</style>
