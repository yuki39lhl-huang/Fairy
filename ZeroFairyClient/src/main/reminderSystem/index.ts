// src/main/reminderSystem/index.ts
// 定时提醒登记中心：列表展示 + 到点通知（应用运行期间有效，并持久化待执行项）

import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { agentEventBus } from '../agentEventBus'
import { showFairyFloat } from '../fairyFloatWindow'

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
}

const MAX_HISTORY = 40
const timers = new Map<string, NodeJS.Timeout>()
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

function fireReminder(id: string): void {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending') return

  item.status = 'fired'
  timers.delete(id)
  trimHistory()
  persist()

  try {
    const content = (item.message || '').trim() || '提醒'
    // 人工创建：朗读加前缀；Fairy 创建：文案里通常已有「主人」称呼，不再叠加
    const speakText =
      item.source === 'manual' ? `主人，提醒时间到了——${content}` : content
    void showFairyFloat(content, {
      speak: true,
      speakText
    })
  } catch (err) {
    console.warn('[Reminder] 浮窗提示失败:', err)
  }

  notifyChange()
}

function armTimer(item: ReminderRecord): void {
  if (item.status !== 'pending') return
  const delay = Math.max(0, item.fireAt - Date.now())
  const existing = timers.get(item.id)
  if (existing) clearTimeout(existing)
  timers.set(
    item.id,
    setTimeout(() => fireReminder(item.id), delay)
  )
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
  return record
}

export function cancelReminder(id: string): boolean {
  const item = reminders.find((r) => r.id === id)
  if (!item || item.status !== 'pending') return false
  item.status = 'cancelled'
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
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
      // 旧数据无 source：文案已带「主人」视为 Fairy；否则按人工处理
      const source: ReminderSource =
        r.source === 'manual' || r.source === 'fairy'
          ? r.source
          : /^主人/.test(msg)
            ? 'fairy'
            : 'manual'
      return { ...r, message: msg || r.message, source }
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
    }
  }
  trimHistory()
  persist()
}
