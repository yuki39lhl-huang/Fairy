<!-- src/renderer/src/App.vue -->
<!-- 职责：根组件，只负责渲染路由出口 + 初始化全局AG-UI事件监听 -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useChatStore } from './stores/chatStore'
import { useLlmStore } from './stores/llmStore'
import { useVoiceCallStore } from './stores/voiceCallStore'
import { playReplyAudio } from './services/audioPlayer'
import './services/micRecorder'  // 临时：只是为了让micRecorder.ts被加载执行，测完这行删掉

const chatStore = useChatStore()
const llmStore = useLlmStore()
const voiceCallStore = useVoiceCallStore()
const audioQueue: Uint8Array[] = []
let isPlayingQueue = false

function drainAudioQueue(): void {
  if (isPlayingQueue || audioQueue.length === 0) return
  isPlayingQueue = true
  voiceCallStore.setSpeaking(true)
  const next = audioQueue.shift()!
  playReplyAudio(next, () => {
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
  window.api.onAgUiEvent((event) => {
    switch (event.type) {
      case 'ai:text-chunk': {
        const payload = event.payload as { text: string }
        chatStore.appendStreamChunk(payload.text)
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
      case 'ai:audio-ready': {
        const payload = event.payload as { audioData: Uint8Array }
        audioQueue.push(payload.audioData)
        drainAudioQueue()
        break
      }
      case 'ai:done': {
        chatStore.commitStreamMessage()
        llmStore.setGenerating(false)
        break
      }
      case 'ai:error': {
        const payload = event.payload as { message: string }
        console.error('[AG-UI] 错误:', payload.message)
        llmStore.setGenerating(false)
        break
      }
    }
  })
})
</script>

<template>
  <!-- 路由出口：当前路由对应的页面组件渲染在这里 -->
  <RouterView />
</template>