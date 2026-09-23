<!-- src/renderer/src/views/IndexChat.vue -->
<!-- 主聊天页面：消息列表 + 底部输入框 -->
<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useLlmStore } from '../stores/llmStore'
import { useRouter } from 'vue-router'
import { startRecording, stopRecording } from '../services/micRecorder'


const chatStore = useChatStore()
const llmStore = useLlmStore()
const router = useRouter()

const inputText = ref('')
const messagesEl = ref<HTMLElement>()

// 麦克风状态机：idle待机 -> recording录音中 -> transcribing识别中 -> 回到idle
const micState = ref<'idle' | 'recording' | 'transcribing'>('idle')
const micError = ref('')

const micButtonTitle = computed(() => {
  if (micState.value === 'recording') return '点击结束录音'
  if (micState.value === 'transcribing') return '识别中，请稍候'
  return '点击开始说话'
})

// 合并消息列表：已完成的消息 + 正在流式输出的消息
const displayMessages = computed(() => {
  const msgs = [...chatStore.messages]
  if (chatStore.streamingContent) {
    msgs.push({ role: 'assistant', content: chatStore.streamingContent })
  }
  return msgs
})

// 滚动到底部
async function scrollToBottom(): Promise<void> {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

// 发送消息 --这里会导致界面卡在"生成中"
async function sendMessage(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || llmStore.isGenerating) return

  inputText.value = ''
  chatStore.addMessage('user', text)
  llmStore.setGenerating(true)

  await scrollToBottom()

  const history = chatStore.messages
    .slice(0, -1)
    .map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

  try {
    await window.api.sendMessage(text, history)
  } catch (error) {
    console.error('[Chat] 发送失败:', error)
    llmStore.setGenerating(false)
  }
  await scrollToBottom()
}

// 麦克风按钮：idle时开始录音，recording时结束录音并触发识别
async function handleMicClick(): Promise<void> {
  if (micState.value === 'idle') {
    micError.value = ''
    try {
      await startRecording()
      micState.value = 'recording'
    } catch (error) {
      micError.value = error instanceof Error ? error.message : String(error)
    }
    return
  }

  if (micState.value === 'recording') {
    micState.value = 'transcribing'
    try {
      const audioData = await stopRecording()
      const result = await window.api.transcribeRecording(audioData)

      if (result.success && result.text.trim()) {
        inputText.value = result.text.trim()
        await sendMessage() // 识别成功后，走跟手动打字完全一样的发送路径
      } else {
        micError.value = result.error || '没有识别到内容，请靠近麦克风再说一次'
      }
    } catch (error) {
      micError.value = error instanceof Error ? error.message : String(error)
    } finally {
      micState.value = 'idle'
    }
  }
}

// 按 Enter 发送（Shift+Enter 换行）
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function handleOpenVoiceCall(): void {
  window.api.openVoiceCallWindow()
}
</script>

<template>
  <div class="chat-page">
    <!-- 顶部导航栏 -->
    <div class="top-bar">
      <div class="top-bar-title">
        <span class="fairy-dot"></span>
        <span>Fairy</span>
        <span class="fairy-sub">· 新艾利都最强智能管家 </span>
      </div>
      <button class="config-btn" @click="router.push('/config')">
        ⚙ 设置
      </button>
      <button class="config-btn" @click="handleOpenVoiceCall">📞 通话</button>
    </div>

    <!-- 消息列表区域 -->
    <div ref="messagesEl" class="messages-area">
      <!-- 空状态：没有消息时显示 Fairy logo -->
      <div v-if="displayMessages.length === 0" class="empty-state">
        <div class="fairy-logo">
          <div class="logo-ring ring-1"></div>
          <div class="logo-ring ring-2"></div>
          <div class="logo-ring ring-3"></div>
          <div class="logo-core"></div>
        </div>
        <p class="empty-tip">主人，有什么需要我帮忙的吗？</p>
      </div>

      <!-- 消息列表 -->
      <div v-for="(msg, index) in displayMessages" :key="index"
        :class="['message-row', msg.role === 'user' ? 'user-row' : 'fairy-row']">
        <!-- Fairy 头像 -->
        <div v-if="msg.role === 'assistant'" class="avatar fairy-avatar">
          <div class="avatar-inner"></div>
        </div>

        <!-- 消息气泡 -->
        <div :class="['bubble', msg.role === 'user' ? 'user-bubble' : 'fairy-bubble']">
          {{ msg.content }}
          <!-- 流式输出光标 -->
          <span v-if="msg.role === 'assistant' && llmStore.isGenerating && index === displayMessages.length - 1"
            class="cursor-blink">▋</span>
        </div>

        <!-- 用户头像 -->
        <div v-if="msg.role === 'user'" class="avatar user-avatar">法厄同</div>
      </div>
    </div>

    <!-- 底部输入区域 -->
    <!-- 底部输入区域 -->
    <div class="input-area">
      <textarea v-model="inputText" class="chat-input" placeholder="和 Fairy 说点什么… (Enter 发送，Shift+Enter 换行)" rows="1"
        :disabled="llmStore.isGenerating || micState !== 'idle'" @keydown="handleKeydown"></textarea>
      <button class="mic-btn"
        :class="{ 'mic-recording': micState === 'recording', 'mic-busy': micState === 'transcribing' }"
        :disabled="llmStore.isGenerating || micState === 'transcribing'" :title="micButtonTitle"
        @click="handleMicClick">
        <span v-if="micState === 'recording'">● 录音中</span>
        <span v-else-if="micState === 'transcribing'">识别中…</span>
        <span v-else>🎤</span>
      </button>
      <button class="send-btn" :disabled="llmStore.isGenerating || !inputText.trim() || micState !== 'idle'"
        @click="sendMessage">
        <span v-if="llmStore.isGenerating">生成中…</span>
        <span v-else>发送</span>
      </button>
    </div>
    <p v-if="micError" class="mic-error">{{ micError }}</p>
  </div>
</template>

<style scoped>
/* 页面整体：深色赛博背景 */
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0a0e1a;
  color: #e2e8f0;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

/* 顶部导航栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(15, 23, 42, 0.9);
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
  backdrop-filter: blur(12px);
  -webkit-app-region: drag;
  /* 允许拖动窗口 */
}

.top-bar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #7dd3fc;
}

.fairy-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
  animation: pulse 2s infinite;
}

.fairy-sub {
  font-size: 12px;
  color: #475569;
  font-weight: 400;
}

.config-btn {
  -webkit-app-region: no-drag;
  padding: 4px 12px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 6px;
  color: #7dd3fc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.config-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
}

/* 消息列表区域 */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(56, 189, 248, 0.3) transparent;
}

/* 空状态 Fairy logo（仿绝区零同心圆光效） */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 32px;
  position: relative;
}

/* 蓝色光晕背景 */
.empty-state::before {
  content: '';
  position: absolute;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(56, 189, 248, 0.05) 40%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.fairy-logo {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-ring {
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid rgba(180, 220, 255, 0.5);
}

.ring-1 {
  width: 200px;
  height: 200px;
  border-color: rgba(100, 180, 255, 0.25);
  animation: spin-slow 12s linear infinite;
}

.ring-2 {
  width: 155px;
  height: 155px;
  border-color: rgba(150, 210, 255, 0.45);
  animation: spin-slow 8s linear infinite reverse;
}

.ring-3 {
  width: 110px;
  height: 110px;
  border-color: rgba(200, 235, 255, 0.65);
  animation: spin-slow 5s linear infinite;
}

/* 内部螺旋效果（用伪元素模拟） */
.ring-3::before {
  content: '';
  position: absolute;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 1.5px solid rgba(220, 240, 255, 0.8);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.logo-core {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffffff, #7dd3fc);
  box-shadow:
    0 0 15px #ffffff,
    0 0 30px #38bdf8,
    0 0 60px rgba(56, 189, 248, 0.4);
  z-index: 1;
}

.empty-tip {
  color: #64748b;
  font-size: 14px;
  letter-spacing: 2px;
  z-index: 1;
}

/* 消息行 */
.message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.user-row {
  flex-direction: row-reverse;
}

.fairy-row {
  flex-direction: row;
}

/* 头像 */
.avatar {
  width: 40px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.fairy-avatar {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.5);
}

.avatar-inner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: radial-gradient(circle, #7dd3fc, #0369a1);
  box-shadow: 0 0 8px #38bdf8;
}

.user-avatar {
  background: rgba(99, 102, 241, 0.3);
  border: 1px solid rgba(99, 102, 241, 0.5);
  color: #a5b4fc;
}

/* 消息气泡 */
.bubble {
  max-width: 65%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.fairy-bubble {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #cbd5e1;
  border-radius: 2px 12px 12px 12px;
  backdrop-filter: blur(8px);
}

.user-bubble {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #e2e8f0;
  border-radius: 12px 2px 12px 12px;
}

/* 流式输出光标 */
.cursor-blink {
  color: #38bdf8;
  animation: blink 1s infinite;
}

/* 底部输入区 */
.input-area {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.9);
  border-top: 1px solid rgba(56, 189, 248, 0.15);
  backdrop-filter: blur(12px);
}

.chat-input {
  flex: 1;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 14px;
  padding: 10px 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
  max-height: 120px;
  overflow-y: auto;
}

.chat-input:focus {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.1);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input::placeholder {
  color: #334155;
}

.send-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #0369a1, #0284c7);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 10px;
  color: #e0f2fe;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 动画 */
@keyframes pulse {

  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 8px #38bdf8;
  }

  50% {
    opacity: 0.5;
    box-shadow: 0 0 4px #38bdf8;
  }
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

.mic-btn {
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px;
  color: #7dd3fc;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.mic-btn:hover:not(:disabled) {
  border-color: rgba(56, 189, 248, 0.5);
}

.mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mic-btn.mic-recording {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  font-size: 13px;
  animation: mic-pulse 1.5s infinite;
}

.mic-btn.mic-busy {
  font-size: 13px;
  opacity: 0.6;
  cursor: wait;
}

.mic-error {
  margin: 0;
  padding: 4px 16px 0;
  font-size: 12px;
  color: #fca5a5;
  text-align: center;
}

@keyframes mic-pulse {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
  }
}
</style>