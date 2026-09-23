// src/renderer/src/stores/chatStore.ts
// 职责：聊天消息列表的全局状态
// 每条消息的格式：{ role: 'user'|'assistant', content: string }

import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const streamingContent = ref('')  // 正在流式输出的内容（还没结束的那条）

  // 添加一条完整消息
  function addMessage(role: 'user' | 'assistant', content: string): void {
    messages.value.push({ role, content })
  }

  // 流式输出：累加文字片段
  function appendStreamChunk(chunk: string): void {
    streamingContent.value += chunk
  }

  // 流式输出结束：把累积内容存为完整消息，清空缓冲区
  function commitStreamMessage(): void {
    if (streamingContent.value) {
      messages.value.push({ role: 'assistant', content: streamingContent.value })
      streamingContent.value = ''
    }
  }

  // 清空所有消息
  function clearMessages(): void {
    messages.value = []
    streamingContent.value = ''
  }

  return { messages, streamingContent, addMessage, appendStreamChunk, commitStreamMessage, clearMessages }
})