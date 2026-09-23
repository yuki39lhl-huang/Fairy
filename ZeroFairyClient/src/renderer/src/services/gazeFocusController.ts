// 简易注视目标：给 IdleScanController 用，每帧自行 lerp 到 target

export class GazeFocusController {
  targetX = 0
  targetY = 0
  currentX = 0
  currentY = 0

  /** IdleScan / 说话 wobble 调用：输入约在 [-1, 1] */
  focus(x: number, y: number, instant = false): void {
    this.targetX = x
    this.targetY = y
    if (instant) {
      this.currentX = x
      this.currentY = y
    }
  }

  /** dt 为毫秒；返回当前平滑后的注视坐标 */
  update(dtMs: number): { x: number; y: number } {
    const k = 1 - Math.exp(-dtMs * 0.006)
    this.currentX += (this.targetX - this.currentX) * k
    this.currentY += (this.targetY - this.currentY) * k
    return { x: this.currentX, y: this.currentY }
  }
}
