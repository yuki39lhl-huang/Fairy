<!-- Main chat: clean agent conversation surface (no decorative background). -->
<script setup lang="ts">
import { ref, nextTick, computed, watch } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useLlmStore } from '../stores/llmStore'
import { startRecording, stopRecording } from '../services/micRecorder'

const chatStore = useChatStore()
const llmStore = useLlmStore()

const inputText = ref('')
const messagesEl = ref<HTMLElement>()
const micState = ref<'idle' | 'recording' | 'transcribing'>('idle')
const micError = ref('')

const micButtonTitle = computed(() => {
  if (micState.value === 'recording') return '点击结束录音'
  if (micState.value === 'transcribing') return '识别中，请稍候'
  return '语音输入'
})

const displayMessages = computed(() => {
  const msgs = [...chatStore.messages]
  if (chatStore.streamingContent) {
    msgs.push({ role: 'assistant' as const, content: chatStore.streamingContent })
  }
  return msgs
})

const isEmpty = computed(() => displayMessages.value.length === 0)

async function scrollToBottom(): Promise<void> {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

watch(displayMessages, () => {
  void scrollToBottom()
})

watch(
  () => llmStore.statusText,
  () => {
    if (llmStore.isGenerating) void scrollToBottom()
  }
)

async function sendMessage(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || llmStore.isGenerating) return

  inputText.value = ''
  chatStore.addMessage('user', text)
  llmStore.setGenerating(true)
  await scrollToBottom()

  const history = chatStore.messages.slice(0, -1).map((msg) => ({
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
        await sendMessage()
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

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendMessage()
  }
}

/** 轻量 Markdown：加粗 / 列表感 / 换行，避免裸 ** 与挤成一团 */
function formatMessageHtml(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<span class="md-li">$1</span>')
    .replace(/\n{2,}/g, '<br /><br />')
    .replace(/\n/g, '<br />')
}

</script>

<template>
  <div class="chat">
    <header class="top">
      <div class="top-hint">新艾利都智能管家</div>
    </header>

    <div ref="messagesEl" class="thread">
      <div v-if="isEmpty" class="hero">
        <h1 class="hero-title">今天想聊点什么？</h1>
        <p class="hero-sub">直接提问，或用下方输入框开始新对话。</p>
      </div>

      <div v-else class="thread-inner">
        <div
          v-for="(msg, index) in displayMessages"
          :key="index"
          :class="['row', msg.role === 'user' ? 'row-user' : 'row-assistant']"
        >
          <div v-if="msg.role === 'assistant'" class="role">Fairy</div>
          <div :class="['bubble', msg.role === 'user' ? 'bubble-user' : 'bubble-assistant']">
            <p
              v-if="msg.role === 'user'"
              class="bubble-text"
            >{{ msg.content }}</p>
            <div
              v-else
              class="bubble-text md"
              v-html="formatMessageHtml(msg.content)"
            />
            <span
              v-if="msg.role === 'assistant' && llmStore.isGenerating && index === displayMessages.length - 1"
              class="cursor"
              >▍</span
            >
          </div>
        </div>

        <div
          v-if="llmStore.isGenerating && !chatStore.streamingContent"
          class="status-row"
        >
          <span class="status-dot" />
          <span class="status-text">{{ llmStore.statusText || 'Fairy 思考中…' }}</span>
        </div>
      </div>
    </div>

    <div class="composer-wrap">
      <div class="composer">
        <textarea
          v-model="inputText"
          class="composer-input"
          rows="1"
          placeholder="给 Fairy 发消息"
          :disabled="llmStore.isGenerating || micState !== 'idle'"
          @keydown="handleKeydown"
        />
        <div class="composer-actions">
          <button
            type="button"
            class="icon-btn"
            :class="{ live: micState === 'recording', busy: micState === 'transcribing' }"
            :disabled="llmStore.isGenerating || micState === 'transcribing'"
            :title="micButtonTitle"
            @click="handleMicClick"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path d="M6 12a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              <path d="M12 18v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
          <button
            type="button"
            class="send-btn"
            :disabled="llmStore.isGenerating || !inputText.trim() || micState !== 'idle'"
            @click="sendMessage"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <p v-if="micError" class="error">{{ micError }}</p>
      <p v-else class="footnote">Enter 发送 · Shift+Enter 换行</p>
    </div>
  </div>
</template>

<style scoped>
.chat {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--agent-bg);
}

.top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 28px 8px;
  min-height: 40px;
}

.top-hint {
  font-size: 12px;
  color: var(--agent-text-dim);
}

.thread {
  flex: 1;
  overflow-y: auto;
  padding: 8px 24px 12px;
}

.hero {
  min-height: 58%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.hero-title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--agent-text);
}

.hero-sub {
  font-size: 14px;
  color: var(--agent-text-dim);
}

.thread-inner {
  width: min(920px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 0 24px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-user {
  align-items: flex-end;
}

.row-assistant {
  align-items: flex-start;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 8px;
  color: var(--agent-text-dim);
  font-size: 13px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--agent-accent);
  animation: status-pulse 1.1s ease-in-out infinite;
}

.status-text {
  letter-spacing: 0.01em;
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.role {
  font-size: 12px;
  color: var(--agent-text-dim);
  padding-left: 2px;
}

.bubble {
  max-width: min(820px, 100%);
  user-select: text;
}

.bubble-user {
  padding: 10px 14px;
  border-radius: 18px;
  background: var(--agent-user-bubble);
}

.bubble-assistant {
  padding: 2px 0;
}

.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.65;
  color: var(--agent-text);
}

.bubble-text.md {
  white-space: normal;
}

.bubble-text.md :deep(strong) {
  font-weight: 650;
  color: var(--agent-text);
}

.bubble-text.md :deep(.md-li) {
  display: block;
  padding-left: 0.9em;
  position: relative;
  margin: 0.2em 0;
}

.bubble-text.md :deep(.md-li)::before {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--agent-text-dim);
}

.cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--agent-text-dim);
  animation: blink 1s step-end infinite;
}

.composer-wrap {
  padding: 8px 24px 18px;
}

.composer {
  width: min(920px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 10px 10px 16px;
  border: 0;
  border-radius: 22px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-soft);
}

.composer-input {
  flex: 1;
  min-height: 24px;
  max-height: 160px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--agent-text);
  font: inherit;
  font-size: 15px;
  line-height: 1.5;
  user-select: text;
}

.composer-input::placeholder {
  color: var(--agent-text-dim);
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn,
.send-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.icon-btn {
  background: transparent;
  color: var(--agent-text-mid);
}

.icon-btn:hover:not(:disabled) {
  background: var(--agent-surface-2);
  color: var(--agent-text);
}

.icon-btn.live {
  color: #ff6b6b;
}

.icon-btn.busy {
  opacity: 0.55;
}

.icon-btn svg,
.send-btn svg {
  width: 16px;
  height: 16px;
}

.send-btn {
  background: var(--agent-send);
  color: var(--agent-send-fg);
}

.send-btn:hover:not(:disabled) {
  filter: brightness(0.92);
}

.send-btn:disabled,
.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.footnote,
.error {
  width: min(920px, 100%);
  margin: 8px auto 0;
  text-align: center;
  font-size: 12px;
}

.footnote {
  color: var(--agent-text-dim);
}

.error {
  color: #f87171;
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
</style>
