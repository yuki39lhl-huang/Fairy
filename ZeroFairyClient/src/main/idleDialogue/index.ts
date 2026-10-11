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

interface IdleLine {
  beats: string[]
}

let lines: IdleLine[] = []
let deck: IdleLine[] = []
let lastLine: IdleLine | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let started = false
let speaking = false
let shouldDefer: () => boolean = () => false
let inMutedCall: () => boolean = () => false
let playInCall: ((beats: string[]) => Promise<boolean>) | null = null

function closeBeat(line: string): string {
  const text = line.trim()
  if (!text) return ''
  if (/[。！？…?!：:~～%」』]$/.test(text) || text.endsWith('——') || text.endsWith('—')) return text
  return `${text}。`
}

function parseIdleMarkdown(markdown: string): IdleLine[] {
  const items: IdleLine[] = []
  let beats: string[] = []
  const flush = (): void => {
    if (!beats.length) return
    items.push({ beats })
    beats = []
  }
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) {
      flush()
      continue
    }
    const beat = closeBeat(line)
    if (beat) beats.push(beat)
  }
  flush()
  return items
}

function loadLines(): IdleLine[] {
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
  return FALLBACK_LINES.map((text) => ({
    beats: text
      .split('\n')
      .map((part) => closeBeat(part))
      .filter(Boolean)
  }))
}

function reshuffle(): void {
  const source = lines.slice()
  for (let i = source.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = source[i]
    source[i] = source[j]
    source[j] = swap
  }
  if (source.length > 1 && source[source.length - 1] === lastLine) {
    const j = Math.floor(Math.random() * (source.length - 1))
    const swap = source[source.length - 1]
    source[source.length - 1] = source[j]
    source[j] = swap
  }
  deck = source
}

function pickLine(): IdleLine {
  if (!deck.length) reshuffle()
  const next = deck.pop()
  if (!next) return lines[0]
  lastLine = next
  return next
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
  const line = pickLine()
  try {
    console.log('[idle] 通话待机台词:', line.beats[0])
    if (playInCall) await playInCall(line.beats)
  } catch (err) {
    console.warn('[idle] 待机台词播放失败:', err)
  } finally {
    speaking = false
    if (inMutedCall()) arm(Math.max(8000, line.beats.join('').length * 280) + QUIET_MS)
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
  playOnCall?: (beats: string[]) => Promise<boolean>
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
