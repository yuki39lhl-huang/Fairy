<!-- 对话历史全列表：侧栏放不下时在主区域打开 -->
<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore, sessionInLane } from '../stores/chatStore'
import { useLlmStore } from '../stores/llmStore'

interface SessionRow {
  session: string
  title: string
  updatedAt: number
}

const router = useRouter()
const chatStore = useChatStore()
const llmStore = useLlmStore()
const workMode = inject<Ref<'chat' | 'code'>>('workMode', ref('chat'))
const sessions = ref<SessionRow[]>([])
const loading = ref(true)
const selected = ref<string[]>([])

function formatDay(sec: number): string {
  const d = new Date(sec * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

async function loadSessions(): Promise<void> {
  const list = window.api?.listChatSessions
  if (typeof list !== 'function') {
    sessions.value = []
    loading.value = false
    return
  }
  try {
    const lane = workMode.value
    sessions.value = (await list(lane)).filter((row) => sessionInLane(row.session, lane))
  } catch {
    sessions.value = []
  } finally {
    loading.value = false
  }
}

void loadSessions()
watch(workMode, () => {
  selected.value = []
  void loadSessions()
})

const allSelected = computed(
  () => sessions.value.length > 0 && selected.value.length === sessions.value.length
)

function isSelected(session: string): boolean {
  return selected.value.includes(session)
}

function toggleAll(): void {
  selected.value = allSelected.value ? [] : sessions.value.map((row) => row.session)
}

function toggleOne(session: string): void {
  selected.value = isSelected(session)
    ? selected.value.filter((id) => id !== session)
    : [...selected.value, session]
}

async function removeSelected(): Promise<void> {
  const ids = [...selected.value]
  if (ids.length === 0) return
  const dropCurrent = ids.includes(chatStore.sessionId)
  for (const id of ids) {
    await window.api?.deleteChatSession?.(id)
  }
  selected.value = []
  if (dropCurrent) chatStore.startNewSession()
  window.dispatchEvent(new Event('fairy-sessions-changed'))
  await loadSessions()
}

async function openSession(row: SessionRow): Promise<void> {
  if (llmStore.isGenerating) return
  try {
    const rows = (await window.api?.getChatMessages(row.session)) ?? []
    chatStore.loadSession(
      row.session,
      rows.map((item) => ({ role: item.role, content: item.content }))
    )
    await router.push('/chat')
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div class="history-page">
    <header class="head">
      <h1 class="title">{{ workMode === 'code' ? '会话' : '对话和任务' }}</h1>
      <div v-if="sessions.length" class="tools">
        <button type="button" class="tool" @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
        <button type="button" class="tool danger" :disabled="selected.length === 0" @click="removeSelected">
          删除
        </button>
      </div>
    </header>

    <p v-if="loading" class="empty">正在读取…</p>
    <p v-else-if="sessions.length === 0" class="empty">
      {{ workMode === 'code' ? '还没有会话。从侧栏的「新会话」开始即可。' : '还没有对话。从侧栏的「新对话」开始即可。' }}
    </p>

    <ul v-else class="list">
      <li v-for="row in sessions" :key="row.session" class="item" :class="{ picked: isSelected(row.session) }">
        <button
          type="button"
          class="check"
          :aria-pressed="isSelected(row.session)"
          :aria-label="isSelected(row.session) ? '取消选择' : '选择'"
          @click="toggleOne(row.session)"
        >
          <span class="mark" :class="{ on: isSelected(row.session) }" />
        </button>
        <button type="button" class="row" @click="openSession(row)">
          <span class="name">{{ row.title }}</span>
          <span class="day">{{ formatDay(row.updatedAt) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.history-page {
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px 48px;
  color: var(--agent-text);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tool {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--agent-surface);
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tool:hover:not(:disabled) {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.tool.danger {
  color: #f07178;
}

.tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.empty {
  margin: 24px 0 0;
  color: var(--agent-text-dim);
  font-size: 13px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  align-items: stretch;
  border-bottom: 0.5px solid var(--agent-border);
}

.item.picked {
  background: rgba(255, 255, 255, 0.035);
}

.check {
  width: 40px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 1;
  min-width: 0;
  padding: 14px 4px 14px 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.item:hover {
  background: rgba(255, 255, 255, 0.045);
}

.item.picked:hover {
  background: rgba(255, 255, 255, 0.06);
}

.mark {
  width: 15px;
  height: 15px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  background: transparent;
  display: grid;
  place-items: center;
}

.mark.on {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.06);
}

.mark.on::after {
  content: '';
  width: 4px;
  height: 7px;
  margin-top: -2px;
  border: solid #d0d0d4;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.day {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--agent-text-dim);
}
</style>
