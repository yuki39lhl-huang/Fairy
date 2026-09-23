// src/renderer/src/services/idleScanController.ts
// 待机自主观察：无操作N秒后，周期性给focusController喂随机注视目标
// 具体怎么平滑过渡完全依赖库自带的FocusController缓动，本模块只决定"什么时候喂、喂什么值"

interface FocusControllerLike {
  focus: (x: number, y: number, instant?: boolean) => void
}

interface IdleScanOptions {
  idleDelayMs?: number   // 静止多久后开始待机扫视，默认3000ms，对应方案"无交互3s"
  scanIntervalMs?: number // 待机扫视时，多久换一次新的注视目标
  rangeX?: number         // 随机幅度，[-1,1]区间内取多大范围，避免转到夸张的边缘角度
  rangeY?: number
}

export class IdleScanController {
  private focusController: FocusControllerLike
  private idleDelayMs: number
  private scanIntervalMs: number
  private rangeX: number
  private rangeY: number

  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private paused = false

  constructor(focusController: FocusControllerLike, options: IdleScanOptions = {}) {
    this.focusController = focusController
    this.idleDelayMs = options.idleDelayMs ?? 3000
    this.scanIntervalMs = options.scanIntervalMs ?? 4000
    this.rangeX = options.rangeX ?? 0.6
    this.rangeY = options.rangeY ?? 0.3
  }

  /** 有交互发生时调用：停止当前扫视，视线回到静息位，重新开始倒计时 */
  notifyInteraction(): void {
    this.stopScanning()
    // (0,0) = 瞳孔回到默认 4~5 点钟静息位（由 FairyEyeCanvas 解释）
    this.focusController.focus(0, 0)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (!this.paused) {
      this.idleTimer = setTimeout(() => this.startScanning(), this.idleDelayMs)
    }
  }

  /** 外部状态（比如Fairy正在说话）需要接管注视时调用 */
  pause(): void {
    this.paused = true
    this.stopScanning()
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  /** 外部状态结束后调用，重新开始倒计时 */
  resume(): void {
    this.paused = false
    this.notifyInteraction()
  }

  private startScanning(): void {
    // 先立刻扫一次，再进入周期
    this.pickGaze()
    this.scanTimer = setInterval(() => this.pickGaze(), this.scanIntervalMs)
  }

  private pickGaze(): void {
    // 离散跳视：多数时候偏右下象限附近，偶尔扫向左侧（贴近原作）
    const biasRight = Math.random() < 0.65
    const x = biasRight
      ? Math.random() * this.rangeX * 0.85
      : -Math.random() * this.rangeX
    const y = (Math.random() * 2 - 1) * this.rangeY
    this.focusController.focus(x, y)
  }

  private stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
  }

  destroy(): void {
    this.pause()
  }
}