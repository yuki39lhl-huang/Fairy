<!-- 定时任务：手动创建 + 展示 Fairy/用户设置的提醒 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface ReminderItem {
  id: string
  message: string
  createdAt: number
  fireAt: number
  status: 'pending' | 'fired' | 'cancelled'
}

type DelayUnit = 'seconds' | 'minutes' | 'hours'

const UNIT_OPTIONS: { value: DelayUnit; label: string }[] = [
  { value: 'seconds', label: '秒' },
  { value: 'minutes', label: '分钟' },
  { value: 'hours', label: '小时' }
]

const items = ref<ReminderItem[]>([])
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined

const draftMessage = ref('')
const delayAmount = ref('10')
const delayUnit = ref<DelayUnit>('minutes')
const unitOpen = ref(false)
const creating = ref(false)
const formError = ref('')

const presets = [
  { label: '1 分钟', seconds: 60 },
  { label: '5 分钟', seconds: 300 },
  { label: '10 分钟', seconds: 600 },
  { label: '30 分钟', seconds: 1800 },
  { label: '1 小时', seconds: 3600 }
] as const

const pending = computed(() => items.value.filter((r) => r.status === 'pending'))
const history = computed(() => items.value.filter((r) => r.status !== 'pending'))

const unitLabel = computed(
  () => UNIT_OPTIONS.find((o) => o.value === delayUnit.value)?.label ?? '分钟'
)

const delaySeconds = computed(() => {
  const n = Number(delayAmount.value)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (delayUnit.value === 'seconds') return Math.round(n)
  if (delayUnit.value === 'hours') return Math.round(n * 3600)
  return Math.round(n * 60)
})

async function refresh(): Promise<void> {
  items.value = await window.api.listReminders()
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function remainLabel(fireAt: number): string {
  const sec = Math.max(0, Math.round((fireAt - now.value) / 1000))
  if (sec < 60) return `${sec} 秒后`
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  if (min < 60) return rest > 0 ? `${min} 分 ${rest} 秒后` : `${min} 分钟后`
  const hour = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${hour} 小时 ${m} 分钟后` : `${hour} 小时后`
}

function statusLabel(status: ReminderItem['status']): string {
  if (status === 'pending') return '进行中'
  if (status === 'fired') return '已提醒'
  return '已取消'
}

function applyPreset(seconds: number): void {
  unitOpen.value = false
  if (seconds % 3600 === 0) {
    delayUnit.value = 'hours'
    delayAmount.value = String(seconds / 3600)
  } else if (seconds % 60 === 0) {
    delayUnit.value = 'minutes'
    delayAmount.value = String(seconds / 60)
  } else {
    delayUnit.value = 'seconds'
    delayAmount.value = String(seconds)
  }
}

function selectUnit(unit: DelayUnit): void {
  delayUnit.value = unit
  unitOpen.value = false
}

function onAmountInput(e: Event): void {
  const el = e.target as HTMLInputElement
  // 只保留数字
  const digits = el.value.replace(/\D/g, '')
  delayAmount.value = digits
  el.value = digits
}

async function onCreate(): Promise<void> {
  formError.value = ''
  unitOpen.value = false
  const message = draftMessage.value.trim()
  if (!message) {
    formError.value = '请填写提醒内容'
    return
  }
  if (delaySeconds.value <= 0) {
    formError.value = '延时必须大于 0'
    return
  }
  creating.value = true
  try {
    await window.api.createReminder({ message, delaySeconds: delaySeconds.value })
    draftMessage.value = ''
    await refresh()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    creating.value = false
  }
}

async function onCancel(id: string): Promise<void> {
  await window.api.cancelReminder(id)
  await refresh()
}

async function onClearFinished(): Promise<void> {
  await window.api.clearFinishedReminders()
  await refresh()
}

function onDocClick(e: MouseEvent): void {
  const t = e.target as HTMLElement | null
  if (!t?.closest('.unit-menu')) unitOpen.value = false
}

onMounted(() => {
  void refresh()
  document.addEventListener('click', onDocClick)
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  pollTimer = setInterval(() => {
    void refresh()
  }, 2000)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  if (tickTimer) clearInterval(tickTimer)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1 class="title">定时任务</h1>
        <p class="sub">可在此直接创建，也可在聊天里让 Fairy 设置；到点会在桌面右上角弹出 Fairy 提醒。</p>
      </div>
      <button
        v-if="history.length > 0"
        type="button"
        class="btn-ghost"
        @click="onClearFinished"
      >
        清除已结束
      </button>
    </header>

    <section class="composer section">
      <h2 class="section-title">新建提醒</h2>

      <label class="field">
        <span class="field-label">提醒内容</span>
        <input
          v-model="draftMessage"
          class="input"
          type="text"
          maxlength="200"
          placeholder="例如：该喝水了"
          @keydown.enter="onCreate"
        />
      </label>

      <div class="field">
        <span class="field-label">多久之后</span>
        <div class="delay-block">
          <div class="delay-controls">
            <input
              class="input amount"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              :value="delayAmount"
              placeholder="10"
              @input="onAmountInput"
            />

            <div class="unit-menu" @click.stop>
              <button
                type="button"
                class="unit-trigger"
                :aria-expanded="unitOpen"
                @click="unitOpen = !unitOpen"
              >
                <span>{{ unitLabel }}</span>
                <svg class="chev" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <ul v-if="unitOpen" class="unit-list" role="listbox">
                <li
                  v-for="opt in UNIT_OPTIONS"
                  :key="opt.value"
                  role="option"
                  class="unit-option"
                  :class="{ active: delayUnit === opt.value }"
                  @click="selectUnit(opt.value)"
                >
                  {{ opt.label }}
                </li>
              </ul>
            </div>
          </div>

          <div class="presets">
            <button
              v-for="p in presets"
              :key="p.seconds"
              type="button"
              class="chip"
              :class="{ active: delaySeconds === p.seconds }"
              @click="applyPreset(p.seconds)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="composer-foot">
        <p v-if="formError" class="error">{{ formError }}</p>
        <span v-else class="hint">到点会在桌面右上角弹出 Fairy 胶囊提醒</span>
        <button
          type="button"
          class="btn-primary"
          :disabled="creating"
          @click="onCreate"
        >
          {{ creating ? '创建中…' : '创建提醒' }}
        </button>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">进行中 · {{ pending.length }}</h2>
      <div v-if="pending.length === 0" class="empty-hint">暂无进行中的提醒</div>
      <ul v-else class="list">
        <li v-for="item in pending" :key="item.id" class="card pending">
          <div class="card-main">
            <div class="msg">{{ item.message }}</div>
            <div class="meta">
              <span class="badge">{{ statusLabel(item.status) }}</span>
              <span>{{ remainLabel(item.fireAt) }}</span>
              <span class="dim">预计 {{ formatTime(item.fireAt) }}</span>
            </div>
          </div>
          <button type="button" class="btn-cancel" @click="onCancel(item.id)">取消</button>
        </li>
      </ul>
    </section>

    <section class="section">
      <h2 class="section-title">历史 · {{ history.length }}</h2>
      <div v-if="history.length === 0" class="empty-hint">还没有历史记录</div>
      <ul v-else class="list">
        <li
          v-for="item in history"
          :key="item.id"
          class="card"
          :class="item.status"
        >
          <div class="card-main">
            <div class="msg">{{ item.message }}</div>
            <div class="meta">
              <span class="badge">{{ statusLabel(item.status) }}</span>
              <span class="dim">{{ formatTime(item.fireAt) }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.page {
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px 40px;
  background: var(--agent-bg);
  color: var(--agent-text);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  max-width: 560px;
}

.title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}

.sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--agent-text-dim);
}

.section {
  max-width: 560px;
  margin-bottom: 28px;
}

.composer {
  padding: 18px 18px 16px;
  border-radius: 14px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-soft);
}

.section-title {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-text-mid);
  letter-spacing: 0.02em;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.field-label {
  font-size: 12px;
  color: var(--agent-text-dim);
}

.input {
  height: 36px;
  padding: 0 12px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 8px;
  background: var(--agent-surface-2);
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.input:focus {
  border-color: var(--agent-accent);
}

.delay-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.delay-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.amount {
  width: 88px;
  flex-shrink: 0;
  text-align: center;
  /* 兜底：若仍被识别为 number，隐藏原生加减 */
  appearance: textfield;
  -moz-appearance: textfield;
}

.amount::-webkit-outer-spin-button,
.amount::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit-menu {
  position: relative;
  flex-shrink: 0;
}

.unit-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  min-width: 88px;
  padding: 0 10px 0 12px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 8px;
  background: var(--agent-surface-2);
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.unit-trigger:hover {
  border-color: rgba(255, 255, 255, 0.18);
}

.chev {
  width: 14px;
  height: 14px;
  color: var(--agent-text-dim);
  margin-left: auto;
}

.unit-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 100%;
  padding: 4px;
  margin: 0;
  list-style: none;
  border-radius: 10px;
  background: var(--agent-surface-2);
  box-shadow: var(--agent-elevation-panel);
  border: 0.5px solid var(--agent-border-strong);
}

.unit-option {
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--agent-text-mid);
  cursor: pointer;
  white-space: nowrap;
}

.unit-option:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.unit-option.active {
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  appearance: none;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 0.5px solid var(--agent-border-strong);
  background: transparent;
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chip:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.chip.active {
  border-color: transparent;
  background: var(--agent-accent-soft);
  color: var(--agent-accent);
}

.composer-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 0.5px solid var(--agent-border);
}

.hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--agent-text-dim);
}

.error {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--agent-danger);
}

.empty-hint {
  padding: 18px 0;
  font-size: 13px;
  color: var(--agent-text-dim);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-soft);
}

.card.pending {
  border-left: 3px solid var(--agent-accent);
}

.card.fired {
  opacity: 0.85;
}

.card.cancelled {
  opacity: 0.55;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.msg {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  margin-bottom: 6px;
  word-break: break-word;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 12px;
  color: var(--agent-text-mid);
}

.dim {
  color: var(--agent-text-dim);
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--agent-surface-2);
  font-size: 11px;
  font-weight: 600;
}

.card.pending .badge {
  color: var(--agent-accent);
  background: var(--agent-accent-soft);
}

.btn-ghost,
.btn-cancel,
.btn-primary {
  appearance: none;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-primary {
  height: 36px;
  padding: 0 16px;
  border: none;
  background: var(--agent-send);
  color: var(--agent-send-fg);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn-ghost {
  border: 0.5px solid var(--agent-border-strong);
  background: transparent;
  color: var(--agent-text-mid);
}

.btn-ghost:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.btn-cancel {
  border: 0.5px solid var(--agent-border-strong);
  background: transparent;
  color: var(--agent-text-mid);
}

.btn-cancel:hover {
  border-color: var(--agent-danger);
  color: var(--agent-danger);
}
</style>
