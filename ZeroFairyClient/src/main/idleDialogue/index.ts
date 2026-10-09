// 待机台词只在语音通话、并且 Fairy 被静音时说。平时不开口。
// 视线扫视仍是 3 秒一次，和台词无关。

import { readFileSync } from 'fs'
import { join } from 'path'
import { app, ipcMain } from 'electron'
import { isFairyFloatShowing } from '../fairyFloatWindow'

const QUIET_MS = 45_000
const RETRY_MS = 20_000

const FALLBACK_LINES = [
  '主人，我正处在空闲中。\n挂机的时候，双倍耗电哦。',
  '主人，我正在待机。\n感谢您赐予了我偷懒的机会。',
  '主人，您已经放弃了思考吗？',
  '如果您想小憩，请允许我挑选曲目。\n我会用轻音乐和白噪声，编制您的梦。'
]

let lines: string[] = []
let lastLine = ''
let timer: ReturnType<typeof setTimeout> | null = null
let started = false
let speaking = false
let shouldDefer: () => boolean = () => false
let inMutedCall: () => boolean = () => false
let playInCall: ((spoken: string) => Promise<boolean>) | null = null

function parseIdleMarkdown(markdown: string): string[] {
  const items: string[] = []
  let current: string[] | null = null
  const flush = (): void => {
    if (!current?.length) return
    const text = current.join('\n').trim()
    if (text) items.push(text)
    current = null
  }
  for (const raw of markdown.split(/\r?\n/)) {
    if (raw.startsWith('- ')) {
      flush()
      current = [raw.slice(2).trim()]
      continue
    }
    if (current && /^\s+\S/.test(raw)) {
      current.push(raw.trim())
      continue
    }
    if (raw.trim() === '') flush()
  }
  flush()
  return items
}

function loadLines(): string[] {
  const file = join(app.getAppPath(), 'docs', 'idle-dialogues', 'hdd-idle.md')
  try {
    const parsed = parseIdleMarkdown(readFileSync(file, 'utf8'))
    if (parsed.length > 0) {
      console.log('[idle] 已载入待机台词:', parsed.length, '条')
      return parsed
    }
  } catch (err) {
    console.warn('[idle] 读不到待机台词稿，改用内置短句:', err)
  }
  return FALLBACK_LINES
}

function pickLine(): string {
  const pool = lines.length > 1 ? lines.filter((line) => line !== lastLine) : lines
  const next = pool[Math.floor(Math.random() * pool.length)] || FALLBACK_LINES[0]
  lastLine = next
  return next
}

function displayLine(full: string): string {
  return full.split('\n')[0].trim()
}

function speechLine(full: string): string {
  return full
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('。')
    .replace(/。{2,}/g, '。')
}

function clearTimer(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

function arm(delayMs: number): void {
  clearTimer()
  timer = setTimeout(() => {
    void speakNext()
  }, delayMs)
}

async function speakNext(): Promise<void> {
  if (speaking) return
  if (!inMutedCall()) {
    clearTimer()
    return
  }
  if (shouldDefer() || isFairyFloatShowing()) {
    arm(RETRY_MS)
    return
  }
  speaking = true
  const full = pickLine()
  const spoken = speechLine(full)
  try {
    console.log('[idle] 通话待机台词:', displayLine(full))
    if (playInCall) await playInCall(spoken)
  } catch (err) {
    console.warn('[idle] 待机台词播放失败:', err)
  } finally {
    speaking = false
    if (inMutedCall()) arm(Math.max(8000, spoken.length * 280) + QUIET_MS)
  }
}

export function noteIdleActivity(): void {
  if (!started || speaking || !inMutedCall()) return
  arm(QUIET_MS)
}

/** 通话里静音后才开始倒计时；取消静音或关掉通话就停。 */
export function setCallIdleEnabled(enabled: boolean): void {
  if (!started) return
  if (!enabled) {
    clearTimer()
    return
  }
  if (!speaking) arm(QUIET_MS)
}

export function startIdleDialogues(
  defer: () => boolean,
  mutedCall: () => boolean,
  playOnCall?: (spoken: string) => Promise<boolean>
): void {
  shouldDefer = defer
  inMutedCall = mutedCall
  playInCall = playOnCall ?? null
  if (!lines.length) lines = loadLines()
  started = true
}

export function registerIdleDialogueIpc(): void {
  ipcMain.on('idle:activity', () => noteIdleActivity())
}
