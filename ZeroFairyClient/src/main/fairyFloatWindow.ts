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
const LEAVE_MS = 300

export type FairyFloatSpeakMode =
  /** ç­è¯­é³å°±ç»ªåå¼¹åºï¼éåå¯å¨é®åï¼é¿åæ å£°ç©ºçªï¼ */
  | 'wait'
  /** åå¼¹åºæå­ï¼è¯­é³åå°åæ­ï¼éåæéåç¹ï¼ */
  | 'defer'

export interface FairyFloatOptions {
  durationMs?: number
  speak?: boolean
  speakText?: string
  /** é¢åæå¥½çé³é¢ï¼æåå°ç¹ç´æ¥æ­ */
  audioBuffer?: Buffer | Uint8Array
  speakMode?: FairyFloatSpeakMode
  scene?: 'chat' | 'reminder' | 'idle' | 'generic'
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
      zoomFactor: 1
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

/**
 * å³ä¸è§å±ç¤ºæµ®çªã
 * - speakMode=waitï¼ç­ TTS åå¼¹åºï¼å¯å¨é®åï¼
 * - speakMode=deferï¼ååºå­ï¼è¯­é³åå°åæ­ï¼æéåç¹ï¼
 * - audioBufferï¼é¢åæç¼å­ï¼å°ç¹ç´æ¥åºå­+å£°
 */
export async function showFairyFloat(
  text: string,
  options: FairyFloatOptions | number = {}
): Promise<void> {
  const opts: FairyFloatOptions =
    typeof options === 'number'
      ? { durationMs: options, speak: true, speakMode: 'wait' }
      : {
          durationMs: options.durationMs ?? 0,
          speak: options.speak !== false,
          speakText: options.speakText,
          audioBuffer: options.audioBuffer,
          speakMode: options.speakMode ?? 'wait',
          scene: options.scene ?? 'generic'
        }

  const displayText = text
  const voiceText = (opts.speakText?.trim() || displayText).trim()
  const speakMode: FairyFloatSpeakMode = opts.speakMode ?? 'wait'

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

  // å·²æé¢åæï¼ç»é¢ä¸å£°é³ä¸èµ·åº
  if (opts.speak && opts.audioBuffer && opts.audioBuffer.byteLength > 0) {
    sendShow(win, displayText)
    sendAudio(win, opts.audioBuffer)
    scheduleHide(fallbackHideMs(voiceText))
    return
  }

  if (opts.speak && speakMode === 'defer') {
    sendShow(win, displayText)
    scheduleHide(opts.durationMs > 0 ? opts.durationMs : fallbackHideMs(voiceText))
    try {
      const { audioBuffer } = await synthesizeSpeech(voiceText, { scene: opts.scene })
      if (token !== speakToken || win.isDestroyed()) return
      sendAudio(win, audioBuffer)
      scheduleHide(fallbackHideMs(voiceText))
    } catch (err) {
      console.warn('[FairyFloat] å»¶å TTS å¤±è´¥ï¼ä»å±ç¤ºæå­:', err)
    }
    return
  }

  if (opts.speak) {
    try {
      const { audioBuffer } = await synthesizeSpeech(voiceText, { scene: opts.scene })
      if (token !== speakToken || win.isDestroyed()) return
      sendShow(win, displayText)
      sendAudio(win, audioBuffer)
      scheduleHide(fallbackHideMs(voiceText))
    } catch (err) {
      console.warn('[FairyFloat] TTS å¤±è´¥ï¼ä»å±ç¤ºæå­:', err)
      if (token !== speakToken || win.isDestroyed()) return
      sendShow(win, displayText)
      scheduleHide(opts.durationMs > 0 ? opts.durationMs : 5500)
    }
    return
  }

  sendShow(win, displayText)
  scheduleHide(opts.durationMs > 0 ? opts.durationMs : 5500)
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
