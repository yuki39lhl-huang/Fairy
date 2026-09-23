<!-- Fairy 桌面右上角浮窗：参考「最小化浮窗文字显示」，从右向左推出 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { playReplyAudio } from '../services/audioPlayer'
import badge2x from '../assets/float/fairy-badge-2x.png'
import badge3x from '../assets/float/fairy-badge-3x.png'

const IDLE_TEXT = '主人，我正处在空闲中。'

const visible = ref(false)
const text = ref(IDLE_TEXT)
const dpr = ref(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
let cleanup: (() => void) | undefined
let showSeq = 0

const badgeUrl = computed(() => (dpr.value >= 2.5 ? badge3x : badge2x))
const badgeSrcset = `${badge2x} 2x, ${badge3x} 3x`

async function show(next: string): Promise<void> {
  const seq = ++showSeq
  text.value = (next || IDLE_TEXT).trim()
  visible.value = false
  await nextTick()
  if (seq !== showSeq) return
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (seq !== showSeq) return
  visible.value = true
}

function hide(): void {
  showSeq += 1
  visible.value = false
}

function playAudio(audioData: Uint8Array): void {
  playReplyAudio(audioData, () => {
    void window.api.notifyFairyFloatSpeechEnded()
  })
}

onMounted(() => {
  dpr.value = window.devicePixelRatio || 1
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
  cleanup?.()
})
</script>

<template>
  <div class="stage">
    <Transition name="slide">
      <div v-if="visible" class="bubble" role="status">
        <div class="bar">
          <div class="bar-mesh" aria-hidden="true" />
          <p class="text">{{ text }}</p>
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
    </Transition>
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
  display: block;
  width: 64px;
  height: 58px;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
  user-select: none;
  background: transparent;
}

.slide-enter-active {
  transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1);
}

.slide-enter-from {
  transform: translate3d(112%, -50%, 0);
}

.slide-enter-to,
.slide-leave-from {
  transform: translate3d(0, -50%, 0);
}

.slide-leave-to {
  transform: translate3d(112%, -50%, 0);
}
</style>
