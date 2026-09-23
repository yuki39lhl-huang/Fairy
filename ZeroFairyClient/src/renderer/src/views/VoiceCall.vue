<!-- src/renderer/src/views/VoiceCall.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useLlmStore } from '../stores/llmStore'
import { useVoiceCallStore } from '../stores/voiceCallStore'
import { startRecordingWithVad, abortVadRecording } from '../services/micRecorder'
import FairyEyeCanvas from '../components/FairyEyeCanvas/FairyEyeCanvas.vue'

const chatStore = useChatStore()
const llmStore = useLlmStore()
const voiceCallStore = useVoiceCallStore()

type CallState = 'muted' | 'listening' | 'processing' | 'waiting'

const callState = ref<CallState>('muted')
const callError = ref('')
const isMaximized = ref(true)
let unsubWindowState: (() => void) | null = null

const statusText = computed(() => {
  switch (callState.value) {
    case 'muted':
      return '已静音'
    case 'listening':
      return '倾听中…'
    case 'processing':
      return '识别中…'
    case 'waiting':
      return 'Fairy 回复中…'
  }
})

async function sendVoiceMessage(text: string): Promise<void> {
  if (!text.trim() || llmStore.isGenerating) return

  chatStore.addMessage('user', text)
  llmStore.setGenerating(true)
  callState.value = 'waiting'

  const history = chatStore.messages.slice(0, -1).map((msg) => ({
    role: msg.role,
    content: msg.content
  }))

  try {
    await window.api.sendMessage(text, history)
  } catch (error) {
    console.error('[VoiceCall] send error', error)
    llmStore.setGenerating(false)
    startListening()
  }
}

async function startListening() {
  callState.value = 'listening'
  callError.value = ''

  try {
    await startRecordingWithVad(
      async (audioData) => {
        callState.value = 'processing'
        const result = await window.api.transcribeRecording(audioData)

        if (result.success && result.text.trim()) {
          await sendVoiceMessage(result.text.trim())
        } else {
          callError.value = result.error || '没有识别到内容'
          startListening()
        }
      },
      {
        // 通话场景：容忍换气/短停顿；豆包等产品还会再叠语义完句，这里先用更稳的能量端点
        silenceDurationMs: 2200,
        minSpeechMs: 800,
        speechStartMs: 200,
        maxDurationMs: 60000
      }
    )
  } catch (error) {
    callError.value = error instanceof Error ? error.message : String(error)
  }
}

function toggleMute() {
  if (callState.value === 'muted') {
    startListening()
  } else {
    abortVadRecording()
    callState.value = 'muted'
  }
}

function minimizeCallWindow() {
  window.api.minimizeVoiceCallWindow()
}

async function toggleMaximizeCallWindow() {
  isMaximized.value = await window.api.toggleMaximizeVoiceCallWindow()
}

function closeCallWindow() {
  abortVadRecording()
  window.close()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeCallWindow()
  }
}

watch(
  () => voiceCallStore.isSpeaking,
  (speaking) => {
    if (!speaking && callState.value !== 'muted') {
      startListening()
    }
  }
)

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  isMaximized.value = await window.api.isVoiceCallWindowMaximized()
  unsubWindowState = window.api.onVoiceCallWindowState((state) => {
    isMaximized.value = state.maximized
  })
  startListening()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  unsubWindowState?.()
  abortVadRecording()
})
</script>

<template>
  <div class="call-window">
    <!-- 还原态：顶部透明拖拽区，无提示条 -->
    <div v-if="!isMaximized" class="drag-region"></div>

    <div class="window-controls">
      <button class="control-btn" title="最小化" @click="minimizeCallWindow">─</button>
      <button
        class="control-btn"
        :title="isMaximized ? '还原' : '最大化'"
        @click="toggleMaximizeCallWindow"
      >
        <span v-if="isMaximized" class="restore-icon"></span>
        <span v-else class="maximize-icon"></span>
      </button>
      <button class="control-btn close" title="关闭" @click="closeCallWindow">✕</button>
    </div>

    <div class="fairy-stage">
      <FairyEyeCanvas />
    </div>

    <p class="call-status">{{ statusText }}</p>
    <p v-if="callError" class="call-error">{{ callError }}</p>

    <button
      class="mute-btn"
      :class="{ muted: callState === 'muted', live: callState === 'listening' }"
      :title="callState === 'muted' ? '取消静音' : '静音'"
      @click="toggleMute"
    >
      <!-- 线框话筒，避免实心填充在按钮里像一块白斑 -->
      <svg class="mute-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          class="mic-body"
          x="9"
          y="2.5"
          width="6"
          height="10"
          rx="3"
          stroke-width="1.5"
        />
        <path
          class="mic-arc"
          d="M6 11.5a6 6 0 0 0 12 0"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path class="mic-stem" d="M12 17.5v3" stroke-width="1.5" stroke-linecap="round" />
        <path
          v-if="callState === 'muted'"
          class="mic-slash"
          d="M5 5 19 19"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.call-window {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #041428;
  color: #e2e8f0;
  z-index: 0;
}

.drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 120px; /* 留给右上角窗口按钮 */
  height: 40px;
  z-index: 90;
  -webkit-app-region: drag;
  app-region: drag;
}

.window-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 100;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.control-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 252, 0.22);
  background: rgba(4, 20, 40, 0.45);
  color: rgba(186, 230, 253, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.control-btn.close:hover {
  color: #f87171;
}

.maximize-icon,
.restore-icon {
  display: block;
  box-sizing: border-box;
}

.maximize-icon {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
}

.restore-icon {
  position: relative;
  width: 9px;
  height: 9px;
  border: 1.5px solid currentColor;
  margin-top: 2px;
  margin-right: 2px;
}

.restore-icon::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 2px;
  width: 9px;
  height: 9px;
  border: 1.5px solid currentColor;
  border-bottom: none;
  border-left: none;
}

.fairy-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
}

.call-status {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  z-index: 100;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgba(148, 163, 184, 0.7);
  text-shadow: 0 0 8px rgba(14, 165, 233, 0.25);
  pointer-events: none;
}

.call-error {
  position: absolute;
  bottom: 52px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  z-index: 100;
  color: #fca5a5;
  font-size: 12px;
  pointer-events: none;
}

.mute-btn {
  position: absolute;
  right: 28px;
  bottom: 28px;
  z-index: 100;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(125, 211, 252, 0.4);
  background: rgba(4, 24, 48, 0.42);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.mute-btn:hover {
  border-color: rgba(165, 243, 252, 0.7);
  box-shadow: 0 0 14px rgba(34, 211, 238, 0.22);
}

.mute-btn.live {
  border-color: rgba(34, 211, 238, 0.55);
  box-shadow: 0 0 16px rgba(34, 211, 238, 0.28);
}

.mute-btn.muted {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(40, 10, 16, 0.4);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.16);
}

.mute-icon {
  width: 18px;
  height: 18px;
  overflow: visible;
}

.mute-icon .mic-body,
.mute-icon .mic-arc,
.mute-icon .mic-stem {
  stroke: rgba(186, 230, 253, 0.9);
  fill: none;
}

.mute-btn.muted .mic-body,
.mute-btn.muted .mic-arc,
.mute-btn.muted .mic-stem,
.mute-btn.muted .mic-slash {
  stroke: rgba(254, 202, 202, 0.9);
  fill: none;
}
</style>
