// src/main/reminderSystem/index.ts
// 定时提醒登记中心：列表展示 + 到点通知（应用运行期间有效，并持久化待执行项）
// 到点前预合成语音，避免本地 GPT-SoVITS 缓冲拖慢「响铃」体感

import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { agentEventBus } from '../agentEventBus'
import { showFairyFloat } from '../fairyFloatWindow'
import { synthesizeSpeech } from '../voice/ttsClient'
import { fallbackReminderLine, predictReminderPromptSkill } from '../skills'

export type ReminderStatus = 'pending' | 'fired' | 'cancelled'

/** manual=侧栏人工创建；fairy=对话里 Fairy 工具设置 */
export type ReminderSource = 'manual' | 'fairy'

export interface ReminderRecord {
  id: string
  message: string
  createdAt: number
  fireAt: number
  status: ReminderStatus
  source: ReminderSource
  /** 根据事项预测的到点台词，聊天和手动创建共用 */
  spoken?: string
}

const MAX_HISTORY = 40
/** 到点前提前合成的时间（毫秒） */
const PREFETCH_MS = 12_000

const fireTimers = new Map<string, NodeJS.Timeout>()
const prefetchTimers = new Map<string, NodeJS.Timeout>()
const audioCache = new Map<string, Buffer>()
const prefetchInFlight = new Set<string>()
const spokenJobs = new Map<string, Promise<void>>()

let reminders: ReminderRecord[] = []

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'reminders.json')
}

function persist(): void {
  try {
    writeFileSync(storePath(), JSON.stringify(reminders, null, 2), 'utf8')
  } catch (err) {
    console.warn('[Reminder] 持久化失败:', err)
  }
}

function trimHistory(): void {
  const pending = reminders.filter((r) => r.status === 'pending')
  const done = reminders
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.fireAt - a.fireAt)
    .slice(0, MAX_HISTORY)
  reminders = [...pending, ...done]
}

function notifyChange(): void {
  agentEventBus.emit('reminder:changed', { reminders: listReminders() })
}

function fairyLine(item: ReminderRecord): string {
  return item.spoken?.trim() || fallbackReminderLine(item.message)
}

function ensureSpoken(id: string): Promise<void> {
  const existing = spokenJobs.get(id)
  if (existing) return existing
  const job = predictSpoken(id).finally(() => {
    spokenJobs.delete(id)
  })
  spokenJobs.set(id, job)
  return job
}

async function predictSpoken(id: string): Promise<void> {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending' || item.spoken?.trim()) return
  try {
    const line = await Promise.race([
      predictReminderPromptSkill.execute({ message: item.message }),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 8000))
    ])
    const latest = reminders.find((r) => r.id === id && r.status === 'pending')
    if (!latest || !line) return
    latest.spoken = line
    audioCache.delete(id)
    persist()
    notifyChange()
  } catch (err) {
    console.warn('[Reminder] 提示词预测失败，到点改用事项本身:', err)
  }
}

function buildSpeakText(item: ReminderRecord): string {
  return fairyLine(item)
}

function clearPrefetch(id: string): void {
  const t = prefetchTimers.get(id)
  if (t) clearTimeout(t)
  prefetchTimers.delete(id)
  prefetchInFlight.delete(id)
  audioCache.delete(id)
}

function clearFireTimer(id: string): void {
  const t = fireTimers.get(id)
  if (t) clearTimeout(t)
  fireTimers.delete(id)
}

async function prefetchAudio(id: string): Promise<void> {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending') return
  if (!item.spoken?.trim()) await ensureSpoken(id)
  if (audioCache.has(id) || prefetchInFlight.has(id)) return

  prefetchInFlight.add(id)
  try {
    const speakText = buildSpeakText(item)
    const { audioBuffer } = await synthesizeSpeech(speakText, { scene: 'reminder' })
    // 文案若已改过，丢掉旧合成，避免错误提醒被读出来
    const latest = reminders.find((r) => r.id === id)
    if (latest && latest.status === 'pending' && buildSpeakText(latest) === speakText) {
      audioCache.set(id, audioBuffer)
      console.log('[Reminder] 语音预合成完成:', id)
    }
  } catch (err) {
    console.warn('[Reminder] 语音预合成失败，将到点后再合成:', err)
  } finally {
    prefetchInFlight.delete(id)
  }
}

function armPrefetch(item: ReminderRecord): void {
  if (item.status !== 'pending') return
  clearTimeout(prefetchTimers.get(item.id))
  prefetchTimers.delete(item.id)

  const delay = item.fireAt - Date.now() - PREFETCH_MS
  if (delay <= 0) {
    void prefetchAudio(item.id)
    return
  }
  prefetchTimers.set(
    item.id,
    setTimeout(() => {
      void prefetchAudio(item.id)
    }, delay)
  )
}

function fireReminder(id: string): void {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending') return

  item.status = 'fired'
  clearFireTimer(id)
  const cached = audioCache.get(id)
  clearPrefetch(id)
  trimHistory()
  persist()

  try {
    const content = fairyLine(item)
    const speakText = buildSpeakText(item)
    void showFairyFloat(content, {
      speak: true,
      speakText,
      scene: 'reminder',
      // 有缓存：准点出字+声；无缓存：先出字，语音后到再播（不拖画面）
      audioBuffer: cached,
      speakMode: cached ? 'wait' : 'defer'
    })
  } catch (err) {
    console.warn('[Reminder] 浮窗提示失败:', err)
  }

  notifyChange()
}

function armTimer(item: ReminderRecord): void {
  if (item.status !== 'pending') return
  clearFireTimer(item.id)
  const delay = Math.max(0, item.fireAt - Date.now())
  fireTimers.set(
    item.id,
    setTimeout(() => fireReminder(item.id), delay)
  )
  armPrefetch(item)
}

export function listReminders(): ReminderRecord[] {
  return [...reminders].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return a.fireAt - b.fireAt
  })
}

export function scheduleReminder(
  message: string,
  delaySeconds: number,
  source: ReminderSource = 'fairy'
): ReminderRecord {
  const now = Date.now()
  const record: ReminderRecord = {
    id: randomUUID(),
    message: message.trim(),
    createdAt: now,
    fireAt: now + Math.round(delaySeconds * 1000),
    status: 'pending',
    source
  }
  reminders.push(record)
  trimHistory()
  persist()
  armTimer(record)
  notifyChange()
  void ensureSpoken(record.id)
  return record
}

function formatRemain(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds))
  if (sec < 60) return `${sec} 秒`
  const minutes = Math.floor(sec / 60)
  const rest = sec % 60
  if (minutes < 60) return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin ? `${hours} 小时 ${remMin} 分钟` : `${hours} 小时`
}

export function pendingReminders(): ReminderRecord[] {
  return reminders
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.fireAt - b.fireAt)
}

/** 供系统提示使用：让模型在同一轮就能按 id 修改或取消，而不是再新建一条 */
export function formatPendingRemindersForPrompt(): string {
  const pending = pendingReminders()
  if (pending.length === 0) {
    return `\n\n[进行中的定时提醒]\n当前没有。新建调用 reminder 技能，action=create。`
  }
  const now = Date.now()
  const lines = pending.map((r) => {
    const remain = formatRemain((r.fireAt - now) / 1000)
    return `- id=${r.id} | 约 ${remain} 后 | ${r.message}`
  })
  return `\n\n[进行中的定时提醒·以本段为准]\n${lines.join('\n')}\n主人要修改、纠正或取消其中某一条时，调用 reminder 技能：action=update 或 action=delete，并带上对应 id。只改文案时不要传 delaySeconds，到点时间保持不变。禁止 action=create 另建一条把错误的留着，也禁止只在回复里声称已删除、已更正或已合并。`
}

export function resolvePendingReminder(opts: {
  id?: string
  match?: string
  latest?: boolean
}): ReminderRecord | undefined {
  const pending = pendingReminders()
  const id = opts.id?.trim()
  if (id) return pending.find((r) => r.id === id)
  const match = opts.match?.trim()
  if (match) {
    const hits = pending.filter((r) => r.message.includes(match))
    return hits.sort((a, b) => b.createdAt - a.createdAt)[0]
  }
  if (opts.latest) {
    return [...pending].sort((a, b) => b.createdAt - a.createdAt)[0]
  }
  return undefined
}

export function updateReminder(
  id: string,
  patch: { message?: string; delaySeconds?: number }
): { ok: true; record: ReminderRecord; keptTime: boolean } | { ok: false; error: string } {
  const item = reminders.find((r) => r.id === id && r.status === 'pending')
  if (!item) return { ok: false, error: '没有找到这条进行中的提醒，可能已经响过或被取消。' }

  const nextMessage = patch.message?.trim()
  const hasDelay = patch.delaySeconds != null && Number.isFinite(patch.delaySeconds)
  if (!nextMessage && !hasDelay) {
    return { ok: false, error: '没有要修改的内容或时间。' }
  }
  if (hasDelay && (patch.delaySeconds as number) <= 0) {
    return { ok: false, error: '新的延迟时间必须大于 0。' }
  }

  if (nextMessage) {
    item.message = nextMessage
    item.spoken = undefined
    audioCache.delete(id)
    void ensureSpoken(id)
  }
  let keptTime = true
  if (hasDelay) {
    item.fireAt = Date.now() + Math.round((patch.delaySeconds as number) * 1000)
    keptTime = false
  }

  clearPrefetch(id)
  persist()
  armTimer(item)
  notifyChange()
  return { ok: true, record: item, keptTime }
}

export function cancelReminder(id: string): boolean {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending') return false
  item.status = 'cancelled'
  clearFireTimer(id)
  clearPrefetch(id)
  trimHistory()
  persist()
  notifyChange()
  return true
}

export function clearFinishedReminders(): number {
  const before = reminders.length
  reminders = reminders.filter((r) => r.status === 'pending')
  const removed = before - reminders.length
  if (removed > 0) {
    persist()
    notifyChange()
  }
  return removed
}

/** 应用启动时恢复未到期提醒；已过期的直接标为 fired */
export function hydrateReminders(): void {
  try {
    const path = storePath()
    if (!existsSync(path)) return
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ReminderRecord[]
    if (!Array.isArray(raw)) return
    reminders = raw.map((r) => {
      const msg = String(r.message ?? '').trim()
      const source: ReminderSource =
        r.source === 'manual' || r.source === 'fairy'
          ? r.source
          : /^主人/.test(msg)
            ? 'fairy'
            : 'manual'
      return {
        ...r,
        message: msg || r.message,
        source,
        spoken: typeof r.spoken === 'string' ? r.spoken : undefined
      }
    })
  } catch (err) {
    console.warn('[Reminder] 读取失败，从空列表开始:', err)
    reminders = []
  }

  const now = Date.now()
  for (const item of reminders) {
    if (item.status !== 'pending') continue
    if (item.fireAt <= now) {
      item.status = 'fired'
    } else {
      armTimer(item)
      if (!item.spoken?.includes('主人')) {
        item.spoken = undefined
        audioCache.delete(item.id)
        void ensureSpoken(item.id)
      }
    }
  }
  trimHistory()
  persist()
}
