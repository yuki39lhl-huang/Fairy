<!-- Fairy HDD 电子眼：背景 cover 铺满；眼睛固定尺寸居中（最大化只扩背景） -->
<template>
  <div ref="container" class="fairy-eye-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as PIXI from 'pixi.js'
import { useVoiceCallStore } from '../../stores/voiceCallStore'
import { IdleScanController } from '../../services/idleScanController'
import { GazeFocusController } from '../../services/gazeFocusController'

/** 与 image/build_fairy_layers.py 一致 */
const CANVAS_SIZE = 1254
const CENTER_X = 627
const CENTER_Y = 655

/** 眼睛相对窗口短边的占比；略留边，避免外圈贴满屏幕 */
const EYE_FIT = 0.78

const EYE_LAYERS = ['blue_glow', 'outer_ring', 'core', 'white_ring'] as const

const GAZE_OFFSET = {
  blue_glow: 10,
  outer_ring: 6,
  core: 22,
  white_ring: 26
} as const

type EmotionKey = 'normal' | 'caring' | 'smug' | 'teasing' | 'alert'

const EMOTION_BIAS: Record<EmotionKey, { x: number; y: number; pulse: number; spin: number }> = {
  normal: { x: 0, y: 0, pulse: 1, spin: 0 },
  caring: { x: 0, y: 0.12, pulse: 0.75, spin: 0 },
  smug: { x: 0.4, y: -0.08, pulse: 1.15, spin: 0.15 },
  teasing: { x: -0.35, y: 0.12, pulse: 1.25, spin: -0.2 },
  alert: { x: 0, y: -0.25, pulse: 1.55, spin: 0.8 }
}

const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const voiceCallStore = useVoiceCallStore()

let app: PIXI.Application | null = null
let bgSprite: PIXI.Sprite | null = null
let eyeRoot: PIXI.Container | null = null
const layers: Partial<Record<(typeof EYE_LAYERS)[number], PIXI.Sprite>> = {}
let mouthAmplitude = 0
let mouthSyncChannel: BroadcastChannel | null = null
let idleScan: IdleScanController | null = null
const gaze = new GazeFocusController()

let emotionBias = EMOTION_BIAS.normal
let emotionPunch = 0
let emotionUntil = 0
let baseOuterRotation = 0

function layoutScene(): void {
  if (!app || !bgSprite || !eyeRoot) return
  const w = app.screen.width
  const h = app.screen.height

  // 背景：cover 铺满（只扩背景）
  const bgScale = Math.max(w / CANVAS_SIZE, h / CANVAS_SIZE)
  bgSprite.scale.set(bgScale)
  bgSprite.x = w / 2
  bgSprite.y = h / 2

  // 眼睛：按短边固定比例，宽屏最大化时大小不变（相对高度）
  const eyeScale = (Math.min(w, h) * EYE_FIT) / CANVAS_SIZE
  eyeRoot.scale.set(eyeScale)
  eyeRoot.x = (w - CANVAS_SIZE * eyeScale) / 2
  eyeRoot.y = (h - CANVAS_SIZE * eyeScale) / 2
}

function applyEmotion(emotion: string): void {
  const key = (emotion in EMOTION_BIAS ? emotion : 'normal') as EmotionKey
  emotionBias = EMOTION_BIAS[key]
  emotionPunch = 1
  emotionUntil = performance.now() + 1200
  idleScan?.pause()
  gaze.focus(emotionBias.x, emotionBias.y)
  window.setTimeout(() => {
    if (performance.now() >= emotionUntil - 50) {
      emotionPunch = 0
      emotionBias = EMOTION_BIAS.normal
      if (!voiceCallStore.isSpeaking) idleScan?.resume()
    }
  }, 1200)
}

onMounted(async () => {
  if (!container.value || !canvas.value) return

  app = new PIXI.Application()
  await app.init({
    canvas: canvas.value,
    resizeTo: container.value,
    backgroundAlpha: 0,
    antialias: true,
    preference: 'webgl',
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  })

  const bgTexture = await PIXI.Assets.load('/fairy/layers/background.png?v=flatscan5')
  bgSprite = new PIXI.Sprite(bgTexture)
  bgSprite.anchor.set(0.5)
  app.stage.addChild(bgSprite)

  eyeRoot = new PIXI.Container()
  app.stage.addChild(eyeRoot)

  for (const name of EYE_LAYERS) {
    const texture = await PIXI.Assets.load(`/fairy/layers/${name}.png`)
    const sprite = new PIXI.Sprite(texture)
    sprite.anchor.set(CENTER_X / CANVAS_SIZE, CENTER_Y / CANVAS_SIZE)
    sprite.x = CENTER_X
    sprite.y = CENTER_Y
    sprite.roundPixels = true
    eyeRoot.addChild(sprite)
    layers[name] = sprite
  }

  layoutScene()
  idleScan = new IdleScanController(gaze, {
    idleDelayMs: 3000,
    scanIntervalMs: 4000,
    rangeX: 0.55,
    rangeY: 0.35
  })
  idleScan.resume()

  mouthSyncChannel = new BroadcastChannel('fairy-mouth-sync')
  mouthSyncChannel.onmessage = (e: MessageEvent) => {
    mouthAmplitude = typeof e.data === 'number' ? e.data : 0
  }

  watch(
    () => voiceCallStore.isSpeaking,
    (speaking) => {
      if (speaking) idleScan?.pause()
      else if (performance.now() >= emotionUntil) idleScan?.resume()
    }
  )

  watch(
    () => voiceCallStore.emotionTrigger,
    () => applyEmotion(voiceCallStore.currentEmotion)
  )

  app.ticker.add((ticker) => {
    layoutScene()
    const dt = ticker.deltaMS
    const now = performance.now()

    if (voiceCallStore.isSpeaking && now >= emotionUntil) {
      const t = now / 1000
      const amp = mouthAmplitude
      gaze.focus(Math.sin(t * 2.3) * 0.4 * amp, Math.sin(t * 1.7 + 1) * 0.22 * amp)
    }

    const look = gaze.update(dt)
    const amp = mouthAmplitude
    const punch = emotionPunch * Math.max(0, (emotionUntil - now) / 1200)
    const pulseMul = emotionBias.pulse
    const isAlert = emotionBias === EMOTION_BIAS.alert

    for (const name of EYE_LAYERS) {
      const sprite = layers[name]
      if (!sprite) continue
      const max = GAZE_OFFSET[name]
      sprite.x = CENTER_X + look.x * max
      sprite.y = CENTER_Y + look.y * max
      sprite.rotation = 0
      sprite.scale.set(1)
      sprite.alpha = 1
    }

    const white = layers.white_ring
    const glow = layers.blue_glow
    const outer = layers.outer_ring
    const core = layers.core

    if (white) {
      const s = 1 + amp * 0.045 * pulseMul + punch * 0.06
      white.scale.set(s)
      white.alpha = Math.min(1, 0.92 + amp * 0.08)
    }
    if (glow) {
      glow.alpha = Math.min(1, 0.85 + amp * 0.2 * pulseMul + punch * 0.15)
      glow.scale.set(1 + amp * 0.03 * pulseMul + punch * 0.04)
    }
    if (core) {
      core.scale.set(1 + amp * 0.02)
    }
    if (outer) {
      baseOuterRotation +=
        dt * 0.00015 * (voiceCallStore.isSpeaking ? 1.8 : 1) + emotionBias.spin * punch * 0.02
      outer.rotation = baseOuterRotation
      outer.alpha = Math.min(1, 0.9 + punch * 0.25)
      if (isAlert) outer.scale.set(1 + punch * 0.05)
    }
  })

  console.log('[FairyEye] 背景铺满 + 眼睛定尺寸已就绪')
})

onUnmounted(() => {
  idleScan?.destroy()
  idleScan = null
  mouthSyncChannel?.close()
  mouthSyncChannel = null
  app?.destroy(true, { children: true, texture: true })
  app = null
  bgSprite = null
  eyeRoot = null
})
</script>

<style scoped>
.fairy-eye-container {
  width: 100%;
  height: 100%;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
