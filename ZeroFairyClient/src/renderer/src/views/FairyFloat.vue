<!-- Fairy 桌面右上角浮窗：徽章先弹出，文字条再从徽章后面滑出 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Howler } from 'howler'
import { playReplyAudio } from '../services/audioPlayer'
import badge2x from '../assets/float/fairy-badge-2x.png'
import badge3x from '../assets/float/fairy-badge-3x.png'

const IDLE_TEXT = '主人，我正处在空闲中。'

/** 与下面 CSS 的时长保持一致：徽章落定后，文字条从徽章里滑出。 */
const BAR_DELAY_MS = 280
const BAR_MS = 360
const SPEAK_AT_MS = BAR_DELAY_MS + BAR_MS
/** 文字条收回后徽章再缩回去。 */
const LEAVE_MS = 520

const visible = ref(false)
const text = ref(IDLE_TEXT)
const motion = ref<'in' | 'out' | ''>('')
const dpr = ref(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
let cleanup: (() => void) | undefined
let showSeq = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null
let speakTimer: ReturnType<typeof setTimeout> | null = null
let shownAt = 0
let pendingAudio: Uint8Array | null = null

const badgeUrl = computed(() => (dpr.value >= 2.5 ? badge3x : badge2x))
const badgeSrcset = `${badge2x} 2x, ${badge3x} 3x`

function warmVoice(): void {
  const ctx = Howler.ctx
  if (ctx && ctx.state !== 'running') void ctx.resume()
}

function clearSpeech(): void {
  if (speakTimer) {
    clearTimeout(speakTimer)
    speakTimer = null
  }
  pendingAudio = null
}

function deliverSpeech(): void {
  speakTimer = null
  const data = pendingAudio
  pendingAudio = null
  if (!data || motion.value !== 'in') return
  warmVoice()
  playReplyAudio(data, () => {
    void window.api.notifyFairyFloatSpeechEnded()
  })
}

function scheduleSpeech(): void {
  if (!pendingAudio || motion.value !== 'in') return
  if (speakTimer) {
    clearTimeout(speakTimer)
    speakTimer = null
  }
  const wait = Math.max(0, SPEAK_AT_MS - (performance.now() - shownAt))
  if (wait === 0) {
    deliverSpeech()
    return
  }
  speakTimer = setTimeout(deliverSpeech, wait)
}

async function show(next: string): Promise<void> {
  const seq = ++showSeq
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  clearSpeech()
  text.value = (next || IDLE_TEXT).trim()
  motion.value = ''
  visible.value = false
  await nextTick()
  if (seq !== showSeq) return
  visible.value = true
  await nextTick()
  if (seq !== showSeq) return
  shownAt = performance.now()
  motion.value = 'in'
  scheduleSpeech()
}

function hide(): void {
  const seq = ++showSeq
  clearSpeech()
  if (!visible.value) return
  motion.value = 'out'
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (seq !== showSeq) return
    visible.value = false
    motion.value = ''
    hideTimer = null
  }, LEAVE_MS)
}

function playAudio(audioData: Uint8Array): void {
  if (motion.value === 'out') return
  pendingAudio = audioData
  scheduleSpeech()
}

onMounted(() => {
  dpr.value = window.devicePixelRatio || 1
  Howler.autoSuspend = false
  if (!Howler.ctx) Howler.volume(1)
  warmVoice()
  const offShow = window.api.onFairyFloatShow((payload) => {
    void show(payload?.text ?? '')
  })
  const offHide = window.api.onFairyFloatHide(() => hide())
  const offAudio = window.api.onFairyFloatAudio((payload) => {
    if (payload?.audioData) playAudio(payload.audioData)
  })
  cleanup = () => {
    offShow()
    offHide()
    offAudio()
  }
  void window.api.notifyFairyFloatReady()
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  clearSpeech()
  cleanup?.()
})
</script>

<template>
  <div class="stage">
    <div v-if="visible" class="bubble" :class="motion ? `play-${motion}` : ''" role="status">
      <div class="track">
        <div class="bar">
          <div class="bar-mesh" aria-hidden="true" />
          <p class="text">{{ text }}</p>
        </div>
      </div>
      <div class="anchor" aria-hidden="true">
        <img
          class="badge"
          :src="badgeUrl"
          :srcset="badgeSrcset"
          sizes="64px"
          width="64"
          height="58"
          alt=""
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent !important;
  overflow: hidden !important;
}
</style>

<style scoped>
.stage {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
  user-select: none;
  pointer-events: none;
}

.bubble {
  position: absolute;
  right: 6px;
  top: 50%;
  display: flex;
  align-items: center;
  height: 64px;
  transform: translate3d(0, -50%, 0);
  pointer-events: auto;
}

/* 裁切槽贴在徽章左侧，文字条只从这里滑出来 */
.track {
  overflow: hidden;
  z-index: 1;
  display: flex;
  align-items: center;
  margin-right: -30px;
}

.bar {
  position: relative;
  height: 44px;
  padding: 0 42px 0 18px;
  display: flex;
  align-items: center;
  border-radius: 999px 0 0 999px;
  border: 3px solid #0a0b0d;
  border-right: none;
  overflow: hidden;
  background: linear-gradient(180deg, #262a30 0%, #14161a 55%, #0e0f12 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -2px 3px rgba(0, 0, 0, 0.4);
  transform: translate3d(100%, 0, 0);
  will-change: transform;
}

.bar::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 28px;
  background: linear-gradient(90deg, transparent, rgba(8, 9, 11, 0.35));
  pointer-events: none;
}

.bar-mesh {
  position: absolute;
  inset: 0;
  opacity: 0.55;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.06) 0.55px, transparent 1px),
    repeating-linear-gradient(
      60deg,
      rgba(255, 255, 255, 0.06) 0 1px,
      transparent 1px 9px
    ),
    repeating-linear-gradient(
      -60deg,
      rgba(255, 255, 255, 0.04) 0 1px,
      transparent 1px 9px
    );
  background-size:
    9px 9px,
    auto,
    auto;
  mix-blend-mode: soft-light;
  pointer-events: none;
}

.text {
  position: relative;
  z-index: 1;
  margin: 0;
  max-width: 260px;
  color: #f4f5f7;
  font-size: 13px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: 0.03em;
  line-height: 1.2;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-font-smoothing: antialiased;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.anchor {
  position: relative;
  z-index: 2;
  width: 64px;
  height: 58px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}

.badge {
  display: block;
  width: 64px;
  height: 58px;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
  user-select: none;
  background: transparent;
  transform: scale(0.15);
  transform-origin: center center;
  will-change: transform;
}

.play-in .badge {
  animation: jelly-in 0.34s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

.play-in .bar {
  animation: bar-out 0.36s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both;
}

.play-out .bar {
  animation: bar-back 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.play-out .badge {
  animation: jelly-out 0.26s cubic-bezier(0.4, 0, 0.2, 1) 0.22s both;
}

@keyframes jelly-in {
  0% {
    transform: scale(0.15);
  }
  42% {
    transform: scale(1.16, 0.84);
  }
  68% {
    transform: scale(0.94, 1.08);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes jelly-out {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.08, 0.9);
  }
  100% {
    transform: scale(0.12);
  }
}

@keyframes bar-out {
  from {
    transform: translate3d(100%, 0, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes bar-back {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(100%, 0, 0);
  }
}
</style>
