// 桌面宠物 Fairy：无背景透明窗，可拖拽 / 四角缩放 / 右键隐藏与固定

import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { storeManager } from './store'

const DEFAULT_SIZE = 220
const MIN_SIZE = 120
const MAX_SIZE = 480

let petWindow: BrowserWindow | null = null
let ipcRegistered = false

function clampSize(n: number): number {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)))
}

function defaultBounds(): { x: number; y: number; width: number; height: number } {
  const area = screen.getPrimaryDisplay().workArea
  const size = DEFAULT_SIZE
  return {
    x: Math.round(area.x + area.width - size - 24),
    y: Math.round(area.y + area.height - size - 24),
    width: size,
    height: size
  }
}

function resolveBounds(): { x: number; y: number; width: number; height: number } {
  const saved = storeManager.getDesktopPetBounds()
  if (!saved) return defaultBounds()
  const area = screen.getPrimaryDisplay().workArea
  const width = clampSize(saved.width)
  const height = clampSize(saved.height)
  const x = Math.min(Math.max(area.x, saved.x), area.x + area.width - width)
  const y = Math.min(Math.max(area.y, saved.y), area.y + area.height - height)
  return { x: Math.round(x), y: Math.round(y), width, height }
}

function persistBounds(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const b = win.getBounds()
  storeManager.setDesktopPetBounds({
    x: b.x,
    y: b.y,
    width: clampSize(b.width),
    height: clampSize(b.height)
  })
}

function applyPinned(win: BrowserWindow, pinned: boolean): void {
  win.setMovable(!pinned)
  win.setIgnoreMouseEvents(false)
  if (!win.isDestroyed()) {
    win.webContents.send('fairy-pet:state', getPetState())
  }
}

function broadcastPetState(): void {
  const state = getPetState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('fairy-pet:state', state)
    }
  }
}

export function getPetState(): {
  enabled: boolean
  visible: boolean
  pinned: boolean
  bounds: { x: number; y: number; width: number; height: number } | null
} {
  const visible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
  return {
    enabled: storeManager.getDesktopPetEnabled(),
    visible,
    pinned: storeManager.getDesktopPetPinned(),
    bounds: storeManager.getDesktopPetBounds()
  }
}

export function showFairyPet(): BrowserWindow {
  storeManager.setDesktopPetEnabled(true)

  if (petWindow && !petWindow.isDestroyed()) {
    if (!petWindow.isVisible()) petWindow.showInactive()
    petWindow.setAlwaysOnTop(true, 'screen-saver')
    applyPinned(petWindow, storeManager.getDesktopPetPinned())
    return petWindow
  }

  const bounds = resolveBounds()
  petWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: !storeManager.getDesktopPetPinned(),
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      zoomFactor: 1
    }
  })

  petWindow.setAlwaysOnTop(true, 'screen-saver')
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 禁用系统默认右键菜单，改由渲染层自定义
  petWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })
  applyPinned(petWindow, storeManager.getDesktopPetPinned())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void petWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/fairy-pet`)
  } else {
    void petWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'fairy-pet' })
  }

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
  })

  petWindow.on('moved', () => {
    if (petWindow && !petWindow.isDestroyed()) persistBounds(petWindow)
  })

  petWindow.on('resized', () => {
    if (petWindow && !petWindow.isDestroyed()) persistBounds(petWindow)
  })

  petWindow.on('closed', () => {
    petWindow = null
  })

  return petWindow
}

export function hideFairyPet(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    persistBounds(petWindow)
    petWindow.hide()
  }
}

export function closeFairyPet(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    persistBounds(petWindow)
    petWindow.close()
  }
  petWindow = null
}

export function setFairyPetEnabled(enabled: boolean): void {
  storeManager.setDesktopPetEnabled(enabled)
  if (enabled) showFairyPet()
  else closeFairyPet()
  broadcastPetState()
}

export function setFairyPetPinned(pinned: boolean): void {
  storeManager.setDesktopPetPinned(pinned)
  if (petWindow && !petWindow.isDestroyed()) {
    applyPinned(petWindow, pinned)
  }
  broadcastPetState()
}

export function setFairyPetBounds(partial: {
  x?: number
  y?: number
  width?: number
  height?: number
}): void {
  if (!petWindow || petWindow.isDestroyed()) return
  const cur = petWindow.getBounds()
  const next = {
    x: Math.round(partial.x ?? cur.x),
    y: Math.round(partial.y ?? cur.y),
    width: clampSize(partial.width ?? cur.width),
    height: clampSize(partial.height ?? cur.height)
  }
  // 保持正方形
  const size = Math.max(next.width, next.height)
  next.width = size
  next.height = size
  petWindow.setBounds(next)
  persistBounds(petWindow)
}

export function registerFairyPetIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('fairy-pet:get-state', () => getPetState())
  ipcMain.handle('fairy-pet:set-enabled', (_e, enabled: boolean) => {
    setFairyPetEnabled(Boolean(enabled))
    return getPetState()
  })
  ipcMain.handle('fairy-pet:show', () => {
    showFairyPet()
    return getPetState()
  })
  ipcMain.handle('fairy-pet:hide', () => {
    // 隐藏与设置「桌面 Fairy」关闭同步
    setFairyPetEnabled(false)
    return getPetState()
  })
  ipcMain.handle('fairy-pet:set-pinned', (_e, pinned: boolean) => {
    setFairyPetPinned(Boolean(pinned))
    return getPetState()
  })
  ipcMain.handle('fairy-pet:set-bounds', (_e, bounds: {
    x?: number
    y?: number
    width?: number
    height?: number
  }) => {
    setFairyPetBounds(bounds ?? {})
    return getPetState()
  })
  ipcMain.handle('fairy-pet:open-settings', () => {
    const wins = BrowserWindow.getAllWindows()
    const main = wins.find((w) => {
      if (w.isDestroyed()) return false
      const url = w.webContents.getURL()
      return (
        !url.includes('fairy-pet') &&
        !url.includes('fairy-float') &&
        !url.includes('voice-call')
      )
    })
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
      main.webContents.send('navigate', '/config')
    }
  })
}

/** 启动时：设置开启则拉起桌宠 */
export function bootstrapFairyPet(): void {
  if (storeManager.getDesktopPetEnabled()) {
    showFairyPet()
  }
}
