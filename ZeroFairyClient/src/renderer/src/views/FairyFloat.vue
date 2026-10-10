<!-- Fairy 桌面右上角浮窗：先果冻弹出徽章，再向左推出文字条 -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { playReplyAudio } from '../services/audioPlayer'
import FairyEyeCanvas from '../components/FairyEyeCanvas/FairyEyeCanvas.vue'

const IDLE_TEXT = '主人，我正处在空闲中。'

const visible = ref(false)
const text = ref(IDLE_TEXT)
const motion = ref<'in' | 'out' | ''>('')
let cleanup: (() => void) | undefined
let showSeq = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null

const LEAVE_MS = 560

async function show(next: string): Promise<void> {
  const seq = ++showSeq
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  text.value = (next || IDLE_TEXT).trim()
  motion.value = ''
  visible.value = false
  await nextTick()
  if (seq !== showSeq) return
  visible.value = true
  await nextTick()
  if (seq !== showSeq) return
  motion.value = 'in'
}

function hide(): void {
  const seq = ++showSeq
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
  playReplyAudio(audioData, () => {
    void window.api.notifyFairyFloatSpeechEnded()
  })
}

onMounted(() => {
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
  cleanup?.()
})
</script>

<template>
  <div class="stage">
    <div v-if="visible" class="bubble" :class="motion ? `play-${motion}` : ''" role="status">
        <div class="bar">
          <div class="bar-mesh" aria-hidden="true" />
          <p class="text">{{ text }}</p>
        </div>
        <div class="anchor" aria-hidden="true">
          <div class="badge">
            <FairyEyeCanvas hide-background :eye-fit="1.28" />
          </div>
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
  will-change: transform;
}

/* 文字条：左圆右切，嵌进圆形徽章 */
.bar {
  position: relative;
  z-index: 1;
  height: 44px;
  margin-right: -30px;
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
  transform-origin: right center;
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
  overflow: visible;
}

.badge {
  width: 64px;
  height: 58px;
  pointer-events: none;
  user-select: none;
  transform-origin: center center;
}

.bubble:not(.play-in):not(.play-out) .badge {
  transform: scale(0.2);
}

.bubble:not(.play-in):not(.play-out) .bar {
  transform: translate3d(100%, 0, 0);
  opacity: 0;
}

.play-in .badge {
  animation: jelly-in 0.36s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

.play-in .bar {
  animation: bar-out 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.32s both;
}

.play-out .bar {
  transform: none;
  opacity: 1;
  animation: bar-out 0.26s cubic-bezier(0.4, 0, 1, 1) reverse both;
}

.play-out .badge {
  transform: none;
  animation: jelly-out 0.28s cubic-bezier(0.4, 0, 0.7, 1.3) 0.22s both;
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
    transform: scale(1.12, 0.86);
  }
  100% {
    transform: scale(0.12);
  }
}

@keyframes bar-out {
  from {
    transform: translate3d(100%, 0, 0);
    opacity: 0;
  }
  to {
    transform: translate3d(0, 0, 0);
    opacity: 1;
  }
}
</style>
