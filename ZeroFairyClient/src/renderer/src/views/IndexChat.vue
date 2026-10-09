<!-- Main chat: clean agent conversation surface (no decorative background). -->
<script setup lang="ts">
import { ref, nextTick, computed, watch, inject, type Ref } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useLlmStore } from '../stores/llmStore'
import { startRecording, stopRecording } from '../services/micRecorder'
import fairyMark from '../assets/fairy-mark.png'
import FairyEyeCanvas from '../components/FairyEyeCanvas/FairyEyeCanvas.vue'

const chatStore = useChatStore()
const llmStore = useLlmStore()
const workMode = inject<Ref<'chat' | 'code'>>('workMode', ref('chat'))
const codeProjectName = inject<Ref<string>>('codeProjectName', ref(''))
const codeProjectFocus = inject<Ref<boolean>>('codeProjectFocus', ref(false))

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
  chatStore.armStream()
  chatStore.addMessage('user', text)
  llmStore.setGenerating(true)
  await scrollToBottom()

  const history = chatStore.messages.slice(0, -1).map((msg) => ({
    role: msg.role,
    content: msg.content
  }))

  try {
    await window.api.sendMessage(text, history, chatStore.sessionId)
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

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineMarkdown(raw: string): string {
  return linkify(raw)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

/** 整段网址收成站点名，避免在句子中间折行。 */
function linkify(escaped: string): string {
  return escaped.replace(/(?:（|\()?https?:\/\/[^\s<）)]+(?:）|\))?/g, (token) => {
    const url = token.replace(/^[（(]+|[）)]+$/g, '').replace(/[.,，。；;]+$/g, '')
    let label = '来源'
    try {
      label = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      label = '来源'
    }
    return `<a class="src" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+\S/.test(line) ||
    /^\d+\.\s+\S/.test(line) ||
    /^[-*]\s+\S/.test(line) ||
    /^\*\*[^*]+\*\*$/.test(line)
  )
}

/** 标题、加粗、有序/无序列表和段落，接近 Claude 的正文节奏 */
function formatMessageHtml(raw: string): string {
  const lines = escapeHtml(raw.replace(/\[emotion:[^\]]*\]/gi, ''))
    .replace(/\r\n/g, '\n')
    .split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push(`<p class="md-h">${inlineMarkdown(heading[2])}</p>`)
      index += 1
      continue
    }

    const solo = line.match(/^\*\*(.+)\*\*$/)
    if (solo) {
      blocks.push(`<p class="md-h">${inlineMarkdown(solo[1])}</p>`)
      index += 1
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^\d+\.\s+/, ''))}</li>`)
        index += 1
      }
      blocks.push(`<ol class="md-ol">${items.join('')}</ol>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^[-*]\s+/, ''))}</li>`)
        index += 1
      }
      blocks.push(`<ul class="md-ul">${items.join('')}</ul>`)
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join('<br />'))}</p>`)
  }

  return blocks.join('')
}

</script>

<template>
  <div class="chat" :class="{ idle: isEmpty && (workMode === 'chat' || codeProjectFocus) }">
    <div ref="messagesEl" class="thread">
      <div v-if="workMode === 'code' && isEmpty && codeProjectFocus" class="hero">
        <h1 class="hero-title">你想让我们在 {{ codeProjectName }} 中做什么？</h1>
      </div>

      <div v-else-if="workMode === 'code' && isEmpty" class="hero">
        <div class="hero-row">
          <img class="hero-mark" :src="fairyMark" alt="" />
          <h1 class="hero-title">Code</h1>
        </div>
        <p class="hero-sub">这个模式先占位，还不能写代码。切回 Chat 就能继续和 Fairy 说话。</p>
      </div>

      <div v-else-if="isEmpty" class="hero">
        <div class="hero-row">
          <div class="hero-eye" aria-hidden="true">
            <FairyEyeCanvas hide-background :eye-fit="0.92" />
          </div>
          <h1 class="hero-title">今天想聊点什么？</h1>
        </div>
      </div>

      <div v-else class="thread-inner">
        <div
          v-for="(msg, index) in displayMessages"
          :key="index"
          :class="['row', msg.role === 'user' ? 'row-user' : 'row-assistant']"
        >
          <div :class="['bubble', msg.role === 'user' ? 'bubble-user' : 'bubble-assistant']">
            <p v-if="msg.role === 'user'" class="bubble-text">{{ msg.content }}</p>
            <div v-else class="bubble-text md" v-html="formatMessageHtml(msg.content)" />
            <span
              v-if="msg.role === 'assistant' && llmStore.isGenerating && index === displayMessages.length - 1"
              class="cursor"
              >▍</span
            >
          </div>
        </div>

        <div v-if="llmStore.isGenerating && !chatStore.streamingContent" class="status-row">
          <span class="status-dot" />
          <span class="status-text">{{ llmStore.statusText || 'Fairy 思考中…' }}</span>
        </div>
      </div>
    </div>

    <div v-if="workMode !== 'code' || codeProjectFocus" class="composer-wrap">
      <div class="composer">
        <textarea
          v-model="inputText"
          class="composer-input"
          rows="1"
          :placeholder="codeProjectFocus ? '描述想在这个文件夹里做的事' : '给 Fairy 发消息'"
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
      <p v-else-if="!isEmpty" class="footnote">Fairy虽为新艾利都最强ai管家,可能也会犯错,请仔细核对回复内容</p>
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

.chat.idle {
  justify-content: center;
  padding-bottom: 8vh;
}

.thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 24px 16px;
}

.chat.idle .thread {
  flex: 0 0 auto;
  overflow: visible;
  padding: 0 24px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.hero-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.hero-mark {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.hero-eye {
  width: 128px;
  height: 128px;
  flex-shrink: 0;
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
  width: min(736px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 8px 0 28px;
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

.bubble {
  max-width: 100%;
  user-select: text;
}

.bubble-user {
  max-width: min(520px, 86%);
  padding: 10px 16px;
  border-radius: 18px;
  background: #303033;
}

.bubble-assistant {
  width: 100%;
  padding: 0;
}

.bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 16px;
  line-height: 1.7;
  color: #ececee;
}

.bubble-text.md {
  white-space: normal;
}

.bubble-text.md :deep(p) {
  margin: 0 0 0.85em;
  overflow-wrap: break-word;
}

.bubble-text.md :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble-text.md :deep(.md-h) {
  margin: 1.25em 0 0.45em;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.45;
  color: #f4f4f5;
}

.bubble-text.md :deep(.md-h:first-child) {
  margin-top: 0;
}

.bubble-text.md :deep(strong) {
  font-weight: 650;
  color: #f7f7f8;
}

.bubble-text.md :deep(.md-ol),
.bubble-text.md :deep(.md-ul) {
  margin: 0.2em 0 0.95em;
  padding-left: 1.45em;
}

.bubble-text.md :deep(.md-ol) {
  list-style: decimal;
}

.bubble-text.md :deep(.md-ul) {
  list-style: disc;
}

.bubble-text.md :deep(li) {
  margin: 0.4em 0;
  padding-left: 0.2em;
}

.bubble-text.md :deep(li)::marker {
  color: #b8bcc2;
}

.bubble-text.md :deep(code) {
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 0.92em;
  padding: 0.08em 0.35em;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
}

.bubble-text.md :deep(a.src) {
  color: #c9d4ff;
  text-decoration: none;
  border-bottom: 1px solid rgba(201, 212, 255, 0.45);
  overflow-wrap: normal;
}

.cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--agent-text-dim);
  animation: blink 1s step-end infinite;
}

.composer-wrap {
  width: min(736px, calc(100% - 48px));
  margin: 0 auto;
  padding: 0 0 14px;
  flex-shrink: 0;
}

.chat.idle .composer-wrap {
  margin-top: 22px;
  padding-bottom: 0;
}

.composer {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 18px;
  border: 0;
  border-radius: 22px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-soft);
}

.composer-input {
  flex: 1;
  min-height: 34px;
  max-height: 160px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--agent-text);
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
  padding: 7px 10px 7px 2px;
  box-sizing: border-box;
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
  width: 100%;
  margin: 10px auto 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.45;
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
