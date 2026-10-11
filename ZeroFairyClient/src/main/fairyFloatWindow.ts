// src/main/fairyFloatWindow.ts
// Fairy æ¡é¢å³ä¸è§è¶åæµ®çªï¼æé / ç¶æï¼+ å¯é TTS

import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { synthesizeSpeech } from './voice/ttsClient'

let floatWindow: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null
let speakToken = 0
let rendererReady = false
let pendingText: string | null = null
let readyWaiters: Array<() => void> = []

const BASE_H = 80
const MARGIN = 10
const FLOAT_W = 360
/** 与浮窗收回动画对齐：先收回文字条，再缩徽章，窗口留到动画结束。 */
const LEAVE_MS = 540

export interface FairyFloatOptions {
  durationMs?: number
  speak?: boolean
  speakText?: string
  /** 已经合成好的音频。有的话和文字一起交出，由浮窗在文字条滑到位时播放。 */
  audioBuffer?: Buffer | Uint8Array
}

function estimateWidth(text: string): number {
  const chars = [...text].length
  return Math.min(FLOAT_W, Math.max(260, 90 + chars * 14))
}

function ensureWindow(): BrowserWindow {
  if (floatWindow && !floatWindow.isDestroyed()) return floatWindow

  rendererReady = false
  floatWindow = new BrowserWindow({
    width: FLOAT_W,
    height: BASE_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      zoomFactor: 1,
      backgroundThrottling: false
    }
  })

  floatWindow.setAlwaysOnTop(true, 'screen-saver')
  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  floatWindow.webContents.on('did-finish-load', () => {
    rendererReady = false
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void floatWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/fairy-float`)
  } else {
    void floatWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'fairy-float'
    })
  }

  floatWindow.on('closed', () => {
    floatWindow = null
    rendererReady = false
    pendingText = null
    readyWaiters = []
  })

  return floatWindow
}

function placeTopRight(win: BrowserWindow, width: number, height: number): void {
  const area = screen.getPrimaryDisplay().workArea
  const x = Math.round(area.x + area.width - width - MARGIN)
  const y = Math.round(area.y + MARGIN)
  win.setBounds({ x, y, width, height })
}

function clearHideTimer(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide(ms: number): void {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    hideFairyFloat()
  }, ms)
}

function sendShow(win: BrowserWindow, text: string): void {
  if (win.isDestroyed()) return
  if (!win.isVisible()) win.showInactive()
  win.webContents.send('fairy-float:show', { text })
}

function sendAudio(win: BrowserWindow, audioBuffer: Buffer | Uint8Array): void {
  if (win.isDestroyed()) return
  const audioData =
    audioBuffer instanceof Uint8Array ? audioBuffer : new Uint8Array(audioBuffer)
  win.webContents.send('fairy-float:audio', { audioData })
}

function flushPending(win: BrowserWindow): void {
  if (!pendingText || win.isDestroyed()) return
  const text = pendingText
  pendingText = null
  sendShow(win, text)
}

function resolveReadyWaiters(): void {
  const waiters = readyWaiters
  readyWaiters = []
  for (const resolve of waiters) resolve()
}

function waitForRendererReady(win: BrowserWindow, token: number, timeoutMs = 5000): Promise<void> {
  if (rendererReady) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      rendererReady = true
      resolve()
    }, timeoutMs)
    readyWaiters.push(() => {
      clearTimeout(timer)
      if (token === speakToken) resolve()
    })
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (!rendererReady && token === speakToken) {
            rendererReady = true
            resolveReadyWaiters()
          }
        }, 200)
      })
    }
  })
}

export function onFairyFloatReady(): void {
  rendererReady = true
  resolveReadyWaiters()
  if (floatWindow && !floatWindow.isDestroyed()) {
    flushPending(floatWindow)
  }
}

/** 右上角浮窗。文字先出现，语音能提前合成就一起带上，否则和开窗同时合成。 */
export async function showFairyFloat(
  text: string,
  options: FairyFloatOptions | number = {}
): Promise<void> {
  const opts: FairyFloatOptions =
    typeof options === 'number'
      ? { durationMs: options, speak: true }
      : {
          durationMs: options.durationMs ?? 0,
          speak: options.speak !== false,
          speakText: options.speakText,
          audioBuffer: options.audioBuffer
        }

  const displayText = text
  const voiceText = (opts.speakText?.trim() || displayText).trim()
  const readyBuffer =
    opts.speak && opts.audioBuffer && opts.audioBuffer.byteLength > 0 ? opts.audioBuffer : null
  // 合成和开窗同时进行，文字条滑到位时语音尽量已经在手里。
  const synthPromise =
    opts.speak && !readyBuffer
      ? synthesizeSpeech(voiceText)
          .then((result) => result.audioBuffer)
          .catch((err) => {
            console.warn('[FairyFloat] TTS 失败，仅展示文字:', err)
            return null
          })
      : null

  const win = ensureWindow()
  const width = estimateWidth(displayText)
  const height = BASE_H
  const token = ++speakToken

  clearHideTimer()
  pendingText = null
  placeTopRight(win, width, height)

  await waitForRendererReady(win, token)
  if (token !== speakToken || win.isDestroyed()) return

  const fallbackHideMs = (spoken: string): number =>
    Math.max(8000, Math.ceil(spoken.length * 280))

  sendShow(win, displayText)

  if (!opts.speak) {
    scheduleHide(opts.durationMs > 0 ? opts.durationMs : 5500)
    return
  }

  scheduleHide(fallbackHideMs(voiceText))
  const buffer = readyBuffer ?? (await synthPromise)
  if (token !== speakToken || win.isDestroyed()) return
  if (!buffer || buffer.byteLength === 0) {
    scheduleHide(opts.durationMs > 0 ? opts.durationMs : 5500)
    return
  }
  sendAudio(win, buffer)
  scheduleHide(fallbackHideMs(voiceText))
}

export function isFairyFloatShowing(): boolean {
  return Boolean(floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible())
}

export function hideFairyFloat(): void {
  speakToken += 1
  clearHideTimer()
  pendingText = null
  if (!floatWindow || floatWindow.isDestroyed()) return
  const win = floatWindow
  win.webContents.send('fairy-float:hide')
  setTimeout(() => {
    if (floatWindow === win && !win.isDestroyed()) win.hide()
  }, LEAVE_MS)
}

export function onFairyFloatSpeechEnded(): void {
  scheduleHide(450)
}

let readyHandlerBound = false

export function registerFairyFloatIpc(): void {
  if (readyHandlerBound) return
  readyHandlerBound = true
  ipcMain.handle('fairy-float:ready', () => {
    onFairyFloatReady()
  })
}
