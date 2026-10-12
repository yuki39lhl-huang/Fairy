// 聊天关键词彩蛋：在 Fairy 顶栏播蜘蛛侠帧动画（素材来自项目 mj/）
import { Howl } from 'howler'

interface KeywordEffect {
  base: string
  first: number
  count: number
  fps: number
  cellW: number
  cellH: number
  wav: string
}

const EFFECTS: KeywordEffect[] = [
  {
    base: '/mj/frames',
    first: 12,
    count: 166,
    fps: 60,
    cellW: 434,
    cellH: 720,
    wav: '/mj/audio.wav'
  },
  {
    base: '/mj/frames2',
    first: 4,
    count: 80,
    fps: 30,
    cellW: 720,
    cellH: 720,
    wav: '/mj/audio2.wav'
  }
]

/** 素材左右被裁齐时会留下硬边黑条，加载时把边缘 alpha 收掉。 */
const EDGE_FEATHER_PX = 18

let host: HTMLElement | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let sound: Howl | null = null
let rafId = 0
let playToken = 0

function frameUrl(effect: KeywordEffect, index: number): string {
  const n = effect.first + index
  return `${effect.base}/f${String(n).padStart(4, '0')}.png`
}

function stopSound(): void {
  if (!sound) return
  sound.stop()
  sound.unload()
  sound = null
}

function clearCanvas(): void {
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function stopPlayback(): void {
  playToken += 1
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  stopSound()
  clearCanvas()
}

function ensureCanvas(): HTMLCanvasElement | null {
  if (!host) return null
  if (canvas && canvas.parentElement === host && ctx) return canvas
  host.replaceChildren()
  canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.margin = '0 auto'
  canvas.style.background = 'transparent'
  canvas.style.maxWidth = '100%'
  host.appendChild(canvas)
  ctx = canvas.getContext('2d', { alpha: true })
  return canvas
}

function featherEdges(img: HTMLImageElement): HTMLCanvasElement {
  const soft = document.createElement('canvas')
  soft.width = img.naturalWidth || img.width
  soft.height = img.naturalHeight || img.height
  const softCtx = soft.getContext('2d', { alpha: true })
  if (!softCtx || soft.width < 2 || soft.height < 2) return soft
  softCtx.drawImage(img, 0, 0)
  const image = softCtx.getImageData(0, 0, soft.width, soft.height)
  const { data } = image
  const feather = Math.min(EDGE_FEATHER_PX, Math.floor(soft.width / 6))
  for (let y = 0; y < soft.height; y += 1) {
    for (let x = 0; x < feather; x += 1) {
      const factor = x / feather
      const left = (y * soft.width + x) * 4 + 3
      const right = (y * soft.width + (soft.width - 1 - x)) * 4 + 3
      data[left] = Math.round(data[left] * factor)
      data[right] = Math.round(data[right] * factor)
    }
  }
  softCtx.putImageData(image, 0, 0)
  return soft
}

function loadImage(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(featherEdges(img))
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function playEffect(effect: KeywordEffect): Promise<void> {
  const token = ++playToken
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  stopSound()

  const view = ensureCanvas()
  if (!view || !ctx || !host) return

  const hostH = Math.max(1, host.clientHeight)
  const hostW = Math.max(1, host.clientWidth)
  const scale = Math.min(1, hostH / effect.cellH, hostW / effect.cellW)
  const drawW = Math.max(1, Math.round(effect.cellW * scale))
  const drawH = Math.max(1, Math.round(effect.cellH * scale))
  const dpr = window.devicePixelRatio || 1
  view.width = Math.round(drawW * dpr)
  view.height = Math.round(drawH * dpr)
  view.style.width = `${drawW}px`
  view.style.height = `${drawH}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, drawW, drawH)

  const frames = await Promise.all(
    Array.from({ length: effect.count }, (_, i) => loadImage(frameUrl(effect, i)))
  )
  if (token !== playToken || !ctx) return

  sound = new Howl({
    src: [effect.wav],
    format: ['wav'],
    volume: 1
  })
  sound.play()

  const started = performance.now()
  let lastIndex = -1

  const step = (now: number): void => {
    if (token !== playToken || !ctx) return
    const index = Math.floor(((now - started) / 1000) * effect.fps)
    if (index >= effect.count) {
      clearCanvas()
      rafId = 0
      return
    }
    if (index !== lastIndex) {
      lastIndex = index
      const frame = frames[index]
      ctx.clearRect(0, 0, drawW, drawH)
      if (frame) ctx.drawImage(frame, 0, 0, drawW, drawH)
    }
    rafId = requestAnimationFrame(step)
  }

  rafId = requestAnimationFrame(step)
}

/** AppShell 挂上顶栏宿主；卸载时传 null。 */
export function bindKeywordFxHost(el: HTMLElement | null): void {
  if (!el) {
    stopPlayback()
    host = null
    canvas = null
    ctx = null
    return
  }
  host = el
  ensureCanvas()
}

/** 聊天命中关键词后调用；播放中再触发会从头重播。 */
export function playKeywordEffect(): void {
  if (!host) {
    const el = document.querySelector('.keyword-fx')
    if (el instanceof HTMLElement) bindKeywordFxHost(el)
  }
  if (!host) return
  const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)]
  void playEffect(effect)
}
