<!-- src/renderer/src/components/Live2dCanvas/Live2dCanvas.vue -->
<template>
  <div ref="container" class="live2d-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as PIXI from 'pixi.js'
import { Live2DModel } from '@naari3/pixi-live2d-display'
import { useVoiceCallStore } from '../../stores/voiceCallStore'
import { IdleScanController } from '../../services/idleScanController'

window.PIXI = PIXI

const container = ref(null)
const canvas = ref(null)
let mouthAmplitude = 0
let mouthSyncChannel = null
let app = null
let idleScan = null
let emotionMotionActive = false
const voiceCallStore = useVoiceCallStore()

onMounted(async () => {
  app = new PIXI.Application()

  await app.init({
    canvas: canvas.value,
    resizeTo: container.value,
    backgroundAlpha: 0,
    antialias: true,
    preference: 'webgl',
    resolution: window.devicePixelRatio || 1,   // 新增：按屏幕真实像素密度渲染
    autoDensity: true                            // 新增：配合resolution，canvas的CSS显示尺寸不变，只是内部渲染buffer更精细
  })

  const modelUrl = '/live2d/hiyori/hiyori_pro/runtime/hiyori_pro_t11.model3.json'

  // autoUpdate: false —— 不依赖库内部自动挂载定时器这个"看不见的机制"，
  // 改成下面手动接管每一帧调用update()，这是Live2D渲染真正"动起来"必需的一步
  //autoFocus: false 控制鼠标移动模型转动
  const model = await Live2DModel.from(modelUrl, { autoUpdate: false, autoFocus: false })
  app.stage.addChild(model)
  model.setRenderer(app.renderer)
  model.startLipSync()   // 常驻开启，静音时mouthAmplitude是0，效果等同嘴闭着，不用另外判断"要不要启用"
  mouthSyncChannel = new BroadcastChannel('fairy-mouth-sync')
  mouthSyncChannel.onmessage = (e) => {
    console.log('[口型诊断] 收到广播消息，值 =', e.data)
    mouthAmplitude = e.data
  }
  window.__fairyModel = model

  //fairy待机监听
  idleScan = new IdleScanController(model.internalModel.focusController)
  idleScan.resume()

  watch(() => voiceCallStore.isSpeaking, (speaking) => {
    if (speaking) {
      idleScan?.pause()
    } else {
      idleScan?.resume()
    }
  })

  //新增检测表情变化
  const EMOTION_MOTION_MAP = {
    normal: 0,
    caring: 0,
    smug: 1,
    teasing: 1,
    alert: 2
  }

  watch(() => voiceCallStore.emotionTrigger, async () => {
    const emotion = voiceCallStore.currentEmotion
    const index = EMOTION_MOTION_MAP[emotion] ?? 0
    idleScan?.pause()
    emotionMotionActive = true   // 新增
    const started = await model.motion('Idle', index)
    console.log('[emotion-motion] 情绪:', emotion, '→ Idle', index, '启动结果:', started)
    setTimeout(() => {
      emotionMotionActive = false   // 新增
      idleScan?.resume()
    }, 1200)   // 从3000改成1200：只是留时间给反应动作本身播完，不该挡这么久
  })

  model.anchor.set(0.5, 0.5)
  model.scale.set(0.18)
  model.x = app.renderer.width / 2
  model.y = app.renderer.height / 2

  app.ticker.add((ticker) => {
    model.update(ticker.deltaMS)
    model.setLipSyncValue(mouthAmplitude)

    if (voiceCallStore.isSpeaking && !emotionMotionActive) {
      const t = Date.now() / 1000
      const wobbleX = Math.sin(t * 2.3) * 0.45 * mouthAmplitude
      const wobbleY = Math.sin(t * 1.7 + 1) * 0.25 * mouthAmplitude
      model.internalModel.focusController.focus(wobbleX, wobbleY)
    }
  })

  // 临时诊断代码，看完可以删
  console.log('[Live2D诊断]', {
    rendererType: app.renderer.constructor.name,   // 期待"WebGLRenderer"；如果印出"WebGPURenderer"，preference:'webgl'就没生效
    modelVisible: model.visible,
    modelAlpha: model.alpha,
    hasInternalModel: !!model.internalModel,
    canvasScreenRect: canvas.value.getBoundingClientRect(),   // 真实屏幕像素坐标，第一次拿来跟getBounds()交叉验证
    canvasComputedStyle: {
      display: getComputedStyle(canvas.value).display,
      visibility: getComputedStyle(canvas.value).visibility,
      opacity: getComputedStyle(canvas.value).opacity
    }
  })

  console.log('[Live2D] 模型渲染循环已手动接管，应该能看到画面了')
})

onUnmounted(() => {
  app?.destroy(true, { children: true, texture: true })
  app = null
  mouthSyncChannel?.close()
})
</script>

<style scoped>
.live2d-container {
  width: 100%;
  height: 100%;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>