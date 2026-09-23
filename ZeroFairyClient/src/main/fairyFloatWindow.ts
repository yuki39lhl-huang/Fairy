// src/main/fairyFloatWindow.ts
// Fairy 桌面右上角胶囊浮窗（提醒 / 状态）+ 可选 TTS

import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { synthesizeSpeech } from './voice/ttsClient'

let floatWindow: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null
let speakToken = 0
let rendererReady = false
let pendingText: string | null = null

const BASE_H = 80
const MARGIN = 10
const FLOAT_W = 360
/** 与 FairyFloat.vue leave 动画时长对齐 */
const LEAVE_MS = 300

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

function flushPending(win: BrowserWindow): void {
  if (!pendingText || win.isDestroyed()) return
  const text = pendingText
  pendingText = null
  sendShow(win, text)
}

/** 渲染进程 FairyFloat 已挂上监听 */
export function onFairyFloatReady(): void {
  rendererReady = true
  if (floatWindow && !floatWindow.isDestroyed()) {
    flushPending(floatWindow)
  }
}

/**
 * 右上角展示浮窗。
 * text = 展示文案；options.speakText 可单独指定朗读文案（默认与 text 相同）。
 */
export async function showFairyFloat(
  text: string,
  options: { durationMs?: number; speak?: boolean; speakText?: string } | number = {}
): Promise<void> {
  const opts =
    typeof options === 'number'
      ? { durationMs: options, speak: true, speakText: undefined as string | undefined }
      : {
          durationMs: options.durationMs ?? 0,
          speak: options.speak !== false,
          speakText: options.speakText
        }

  const displayText = text
  const voiceText = (opts.speakText?.trim() || displayText).trim()

  const win = ensureWindow()
  const width = estimateWidth(displayText)
  const height = BASE_H
  const token = ++speakToken

  clearHideTimer()
  placeTopRight(win, width, height)

  const pushText = (): void => {
    if (win.isDestroyed()) return
    if (rendererReady) {
      pendingText = null
      sendShow(win, displayText)
    } else {
      pendingText = displayText
      if (!win.isVisible()) win.showInactive()
      setTimeout(() => {
        if (token !== speakToken || win.isDestroyed()) return
        if (pendingText === displayText) {
          rendererReady = true
          flushPending(win)
        } else if (win.isVisible()) {
          sendShow(win, displayText)
        }
      }, 400)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => setTimeout(pushText, 50))
  } else {
    pushText()
  }

  if (opts.speak) {
    try {
      const { audioBuffer } = await synthesizeSpeech(voiceText)
      if (token !== speakToken || win.isDestroyed()) return
      sendShow(win, displayText)
      win.webContents.send('fairy-float:audio', {
        audioData: new Uint8Array(audioBuffer)
      })
      const fallbackMs = Math.max(8000, Math.ceil(voiceText.length * 280))
      scheduleHide(fallbackMs)
    } catch (err) {
      console.warn('[FairyFloat] TTS 失败，仅展示文字:', err)
      sendShow(win, displayText)
      scheduleHide(opts.durationMs > 0 ? opts.durationMs : 5500)
    }
    return
  }

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

/** 音频播完后关闭浮窗 */
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
