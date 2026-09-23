<!-- Fairy HDD eye: deterministic seven-layer composition, not a human Live2D model. -->
<template>
  <div ref="container" class="fairy-eye-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, type WatchStopHandle } from 'vue'
import * as PIXI from 'pixi.js'
import { useVoiceCallStore } from '../../stores/voiceCallStore'
import { IdleScanController } from '../../services/idleScanController'
import { GazeFocusController } from '../../services/gazeFocusController'

const props = withDefaults(
  defineProps<{
    /** 桌面宠物：不绘制背景图，只保留眼部圆环 */
    hideBackground?: boolean
    /** 眼睛相对窗口的适配比例，桌宠可略放大 */
    eyeFit?: number
  }>(),
  {
    hideBackground: false,
    eyeFit: 0.62
  }
)

/** Geometry is generated and verified by live2d-fairy/build_fairy_layers_v4.py. */
const CANVAS_W = 873
const CANVAS_H = 940
const CENTER_X = 449.6
const CENTER_Y = 507.3
const PUPIL_X = 491.0
const PUPIL_Y = 618.0
const PUPIL_ANGLE = Math.atan2(PUPIL_Y - CENTER_Y, PUPIL_X - CENTER_X)
const PUPIL_BASE_R = Math.hypot(PUPIL_X - CENTER_X, PUPIL_Y - CENTER_Y)
const BREATH_MIN = 0.975
const BREATH_MAX = 1.025
const BREATH_PERIOD_MS = 2000
const ROTATION_PER_MS = (Math.PI * 2) / 13000 // one revolution per 13 s
const EYEWHITE_GAZE_OFFSET = 26
const ASSET_VER = 'v4-static-bg1'

/** L1（最外软光环）按设计省略，不再加载。 */
const LAYER_NAMES = [
  'layer_02',
  'layer_03',
  'layer_04',
  'layer_05',
  'layer_06',
  'layer_07'
] as const

const EYEWHITE_LAYERS = ['layer_03', 'layer_04', 'layer_05', 'layer_06', 'layer_07'] as const
type LayerName = (typeof LAYER_NAMES)[number]
type EmotionKey = 'normal' | 'caring' | 'smug' | 'teasing' | 'alert'

const EMOTION_BIAS: Record<EmotionKey, { x: number; y: number; pulse: number; spin: number }> = {
  normal: { x: 0, y: 0, pulse: 1, spin: 0 },
  caring: { x: 0, y: 0.12, pulse: 0.7, spin: 0 },
  smug: { x: 0.35, y: -0.08, pulse: 1.1, spin: 0.15 },
  teasing: { x: -0.3, y: 0.12, pulse: 1.2, spin: -0.15 },
  alert: { x: 0, y: -0.22, pulse: 1.45, spin: 0.65 }
}

const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const voiceCallStore = useVoiceCallStore()

let app: PIXI.Application | null = null
let background: PIXI.Sprite | null = null
let eyeRoot: PIXI.Container | null = null
let eyeWhiteRoot: PIXI.Container | null = null
const layers: Partial<Record<LayerName, PIXI.Sprite>> = {}
let mouthAmplitude = 0
let mouthSyncChannel: BroadcastChannel | null = null
let idleScan: IdleScanController | null = null
let stopSpeakingWatch: WatchStopHandle | null = null
let stopEmotionWatch: WatchStopHandle | null = null
let emotionTimer: number | null = null

const gaze = new GazeFocusController()
let emotionBias = EMOTION_BIAS.normal
let emotionUntil = 0
let baseL2Rotation = 0

function layoutScene(): void {
  if (!app || !eyeRoot) return
  const { width, height } = app.screen

  if (background) {
    const backgroundWidth = background.texture.width || CANVAS_W
    const backgroundHeight = background.texture.height || CANVAS_H
    const backgroundScale = Math.max(width / backgroundWidth, height / backgroundHeight)
    background.scale.set(backgroundScale)
    background.x = width / 2
    background.y = height / 2
  }

  const eyeScale = (Math.min(width, height) * props.eyeFit) / CANVAS_H
  eyeRoot.scale.set(eyeScale)
  // The art center is intentionally below-right of its raw image midpoint.
  // Position from that calibrated point so the eye is visually centered.
  eyeRoot.x = width / 2 - CENTER_X * eyeScale
  eyeRoot.y = height / 2 - CENTER_Y * eyeScale
}

function applyEmotion(emotion: string): void {
  const key = (emotion in EMOTION_BIAS ? emotion : 'normal') as EmotionKey
  emotionBias = EMOTION_BIAS[key]
  emotionUntil = performance.now() + 1200
  idleScan?.pause()
  gaze.focus(emotionBias.x, emotionBias.y)

  if (emotionTimer !== null) window.clearTimeout(emotionTimer)
  emotionTimer = window.setTimeout(() => {
    if (performance.now() >= emotionUntil - 50) {
      emotionBias = EMOTION_BIAS.normal
      if (!voiceCallStore.isSpeaking) idleScan?.resume()
    }
  }, 1200)
}

/** Only L3 and L6 receive this scale, exactly as the animation rule requires. */
function breathingScale(now: number): number {
  const phase = (now % BREATH_PERIOD_MS) / BREATH_PERIOD_MS
  const base = BREATH_MIN + (BREATH_MAX - BREATH_MIN) * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2))
  const remainingEmotion = Math.max(0, (emotionUntil - now) / 1200)
  const speechKick = voiceCallStore.isSpeaking ? mouthAmplitude * 0.008 : 0
  return base * (1 + speechKick + remainingEmotion * 0.012 * emotionBias.pulse)
}

function makeSprite(
  texture: PIXI.Texture,
  parent: PIXI.Container,
  x: number,
  y: number,
  name: LayerName
): PIXI.Sprite {
  const sprite = new PIXI.Sprite(texture)
  if (name === 'layer_07') {
    // Anchor on the orb so it can ride L3's inner rim without inheriting scale.
    sprite.anchor.set(PUPIL_X / CANVAS_W, PUPIL_Y / CANVAS_H)
  } else {
    sprite.anchor.set(CENTER_X / CANVAS_W, CENTER_Y / CANVAS_H)
  }
  sprite.x = x
  sprite.y = y
  parent.addChild(sprite)
  return sprite
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

  const assetUrls = [
    ...(props.hideBackground ? [] : [`/fairy/layers_v4/background.png?v=${ASSET_VER}`]),
    ...LAYER_NAMES.map((name) => `/fairy/layers_v4/${name}.png?v=${ASSET_VER}`)
  ]
  const assets = await PIXI.Assets.load(assetUrls)

  if (!props.hideBackground) {
    background = new PIXI.Sprite(assets[`/fairy/layers_v4/background.png?v=${ASSET_VER}`])
    background.anchor.set(0.5)
    app.stage.addChild(background)
  }

  eyeRoot = new PIXI.Container()
  app.stage.addChild(eyeRoot)
  eyeWhiteRoot = new PIXI.Container()
  eyeWhiteRoot.x = CENTER_X
  eyeWhiteRoot.y = CENTER_Y

  for (const name of LAYER_NAMES) {
    const texture = assets[`/fairy/layers_v4/${name}.png?v=${ASSET_VER}`]
    const parent = EYEWHITE_LAYERS.includes(name as (typeof EYEWHITE_LAYERS)[number]) ? eyeWhiteRoot : eyeRoot
    const localX = parent === eyeWhiteRoot ? 0 : CENTER_X
    const localY = parent === eyeWhiteRoot ? 0 : CENTER_Y
    layers[name] = makeSprite(texture, parent, localX, localY, name)
  }
  eyeRoot.addChild(eyeWhiteRoot)
  layoutScene()

  idleScan = new IdleScanController(gaze, {
    idleDelayMs: 3000,
    scanIntervalMs: 4000,
    rangeX: 0.92,
    rangeY: 0.58
  })
  idleScan.resume()

  mouthSyncChannel = new BroadcastChannel('fairy-mouth-sync')
  mouthSyncChannel.onmessage = (event: MessageEvent) => {
    mouthAmplitude = typeof event.data === 'number' ? Math.max(0, Math.min(1, event.data)) : 0
  }

  // These watches are deliberately retained and stopped: this async mounted
  // callback creates them after await, so Vue cannot reliably auto-dispose them.
  stopSpeakingWatch = watch(
    () => voiceCallStore.isSpeaking,
    (speaking) => {
      if (speaking) idleScan?.pause()
      else if (performance.now() >= emotionUntil) idleScan?.resume()
    }
  )
  stopEmotionWatch = watch(
    () => voiceCallStore.emotionTrigger,
    () => applyEmotion(voiceCallStore.currentEmotion)
  )

  app.ticker.add((ticker) => {
    if (!eyeWhiteRoot) return
    const now = performance.now()
    const dt = ticker.deltaMS

    if (voiceCallStore.isSpeaking && now >= emotionUntil) {
      const t = now / 1000
      gaze.focus(Math.sin(t * 2.3) * 0.35 * mouthAmplitude, Math.sin(t * 1.7 + 1) * 0.18 * mouthAmplitude)
    }

    const look = gaze.update(dt)
    eyeWhiteRoot.x = CENTER_X + look.x * EYEWHITE_GAZE_OFFSET
    eyeWhiteRoot.y = CENTER_Y + look.y * EYEWHITE_GAZE_OFFSET

    const l2 = layers.layer_02
    if (l2) {
      baseL2Rotation += dt * ROTATION_PER_MS * (1 + emotionBias.spin)
      l2.rotation = baseL2Rotation
    }

    const breath = breathingScale(now)
    for (const name of ['layer_03', 'layer_06'] as const) {
      layers[name]?.scale.set(breath)
    }
    // L4 / L5 stay unscaled inside the eye-white group.
    for (const name of ['layer_04', 'layer_05'] as const) {
      const sprite = layers[name]
      if (!sprite) continue
      sprite.scale.set(1)
      sprite.x = 0
      sprite.y = 0
    }

    // L7: no scale; ride L3 inner rim so the hole and orb never drift apart.
    const l7 = layers.layer_07
    if (l7) {
      const rimR = PUPIL_BASE_R * breath
      l7.x = Math.cos(PUPIL_ANGLE) * rimR
      l7.y = Math.sin(PUPIL_ANGLE) * rimR
      l7.scale.set(1)
    }

    layoutScene()
  })
})

onUnmounted(() => {
  stopSpeakingWatch?.()
  stopEmotionWatch?.()
  if (emotionTimer !== null) window.clearTimeout(emotionTimer)
  idleScan?.destroy()
  mouthSyncChannel?.close()
  app?.destroy(true, { children: true, texture: true })
  app = null
  background = null
  eyeRoot = null
  eyeWhiteRoot = null
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
