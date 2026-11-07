<!-- src/renderer/src/App.vue -->
<!-- 职责：根组件，只负责渲染路由出口 + 初始化全局AG-UI事件监听 -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from './stores/chatStore'
import { useLlmStore } from './stores/llmStore'
import { useVoiceCallStore } from './stores/voiceCallStore'
import { playReplyAudio, setFairyVoiceVolume, stopReplyAudio } from './services/audioPlayer'

const router = useRouter()
const chatStore = useChatStore()
const llmStore = useLlmStore()
const voiceCallStore = useVoiceCallStore()
const audioQueue: Uint8Array[] = []
let isPlayingQueue = false
let playEpoch = 0
let unsubNavigate: (() => void) | null = null

function clearAudioPlayback(): void {
  playEpoch += 1
  audioQueue.length = 0
  isPlayingQueue = false
  stopReplyAudio()
  voiceCallStore.setSpeaking(false)
}

function drainAudioQueue(): void {
  if (isPlayingQueue || audioQueue.length === 0) return
  isPlayingQueue = true
  const epoch = playEpoch
  voiceCallStore.setSpeaking(true)
  const next = audioQueue.shift()!
  playReplyAudio(next, () => {
    if (epoch !== playEpoch) return
    isPlayingQueue = false
    if (audioQueue.length > 0) {
      drainAudioQueue()
    } else {
      voiceCallStore.setSpeaking(false)
    }
  })
}

// 全局监听 AG-UI 事件总线（只注册一次，放在根组件）
onMounted(() => {
  void window.api
    .getBgmSettings()
    .then((settings) => setFairyVoiceVolume(settings.fairyVoiceVolume))
    .catch((err) => console.warn('[App] 读取 Fairy 语音音量失败:', err))

  unsubNavigate = window.api.onNavigate((path) => {
    void router.push(path)
  })

  window.api.onAgUiEvent((event) => {
    const sessionId =
      event.payload && typeof event.payload === 'object' && 'sessionId' in event.payload
        ? String((event.payload as { sessionId?: string }).sessionId ?? '')
        : ''

    switch (event.type) {
      case 'ai:text-chunk': {
        if (!llmStore.acceptsSession(sessionId)) break
        const payload = event.payload as { text: string }
        llmStore.setStreaming()
        chatStore.appendStreamChunk(payload.text, sessionId || undefined)
        break
      }
      case 'ai:tool-call': {
        if (!llmStore.acceptsSession(sessionId)) break
        const payload = event.payload as { tools?: string[] }
        llmStore.setTools(payload.tools ?? [])
        break
      }
      case 'ai:status': {
        if (!llmStore.acceptsSession(sessionId)) break
        const payload = event.payload as { phase?: string; tools?: string[] }
        if (payload.phase === 'thinking') llmStore.setThinking()
        else if (payload.phase === 'tools') llmStore.setTools(payload.tools ?? [])
        else if (payload.phase === 'streaming') llmStore.setStreaming()
        break
      }
      case 'ai:emotion': {
        const payload = event.payload as { emotion: string } | undefined
        console.log('[AG-UI] ai:emotion 收到的payload:', payload)
        if (payload?.emotion) {
          voiceCallStore.setEmotion(payload.emotion)
        }
        break
      }
      case 'ai:audio-reset': {
        clearAudioPlayback()
        break
      }
      case 'ai:audio-ready': {
        const payload = event.payload as { audioData: Uint8Array }
        audioQueue.push(payload.audioData)
        drainAudioQueue()
        break
      }
      case 'ai:done': {
        chatStore.commitStreamMessage(sessionId || undefined)
        llmStore.endGenerationForSession(sessionId || undefined)
        break
      }
      case 'ai:error': {
        const payload = event.payload as { message: string }
        console.error('[AG-UI] 错误:', payload.message)
        llmStore.endGenerationForSession(sessionId || undefined)
        break
      }
    }
  })
})

onUnmounted(() => {
  unsubNavigate?.()
})
</script>

<template>
  <!-- 路由出口：当前路由对应的页面组件渲染在这里 -->
  <RouterView />
</template>