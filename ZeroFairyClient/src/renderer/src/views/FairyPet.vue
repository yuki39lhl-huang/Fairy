<!-- 桌面宠物 Fairy：无背景圆环，四角缩放，右键仅固定/隐藏（与设置同步） -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import FairyEyeCanvas from '../components/FairyEyeCanvas/FairyEyeCanvas.vue'

type Corner = 'nw' | 'ne' | 'sw' | 'se'

const pinned = ref(false)
const menuOpen = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const hovering = ref(false)

let resizing: {
  corner: Corner
  startX: number
  startY: number
  startBounds: { x: number; y: number; width: number; height: number }
} | null = null

let dragging: {
  startX: number
  startY: number
  startBounds: { x: number; y: number; width: number; height: number }
} | null = null

const showHandles = computed(() => hovering.value && !pinned.value)

async function refreshState(): Promise<void> {
  const state = await window.api.getFairyPetState()
  pinned.value = state.pinned
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = Math.min(e.clientX, window.innerWidth - 148)
  menuY.value = Math.min(e.clientY, window.innerHeight - 100)
  menuOpen.value = true
}

function closeMenu(): void {
  menuOpen.value = false
}

/** 隐藏 = 关闭桌面 Fairy，并与设置开关同步关掉 */
async function hidePet(): Promise<void> {
  closeMenu()
  await window.api.setFairyPetEnabled(false)
}

/** 桌面右键只能「固定」，取消固定去设置 */
async function pinPet(): Promise<void> {
  closeMenu()
  if (pinned.value) return
  const state = await window.api.setFairyPetPinned(true)
  pinned.value = state.pinned
}

async function startResize(corner: Corner, e: MouseEvent): Promise<void> {
  if (pinned.value || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  closeMenu()
  const state = await window.api.getFairyPetState()
  const b = state.bounds
  if (!b) return
  resizing = {
    corner,
    startX: e.screenX,
    startY: e.screenY,
    startBounds: { ...b }
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', endResize)
}

function onResizeMove(e: MouseEvent): void {
  if (!resizing) return
  const { corner, startX, startY, startBounds } = resizing
  const dx = e.screenX - startX
  const dy = e.screenY - startY
  let { x, y, width, height } = startBounds

  if (corner === 'se') {
    width += dx
    height += dy
  } else if (corner === 'sw') {
    width -= dx
    height += dy
    x += dx
  } else if (corner === 'ne') {
    width += dx
    height -= dy
    y += dy
  } else {
    width -= dx
    height -= dy
    x += dx
    y += dy
  }

  const size = Math.max(width, height)
  if (corner === 'sw') {
    x = startBounds.x + startBounds.width - size
  } else if (corner === 'ne') {
    y = startBounds.y + startBounds.height - size
  } else if (corner === 'nw') {
    x = startBounds.x + startBounds.width - size
    y = startBounds.y + startBounds.height - size
  }

  void window.api.setFairyPetBounds({ x, y, width: size, height: size })
}

function endResize(): void {
  resizing = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', endResize)
}

async function startDrag(e: MouseEvent): Promise<void> {
  if (pinned.value || e.button !== 0) return
  // 右键/缩放角不走拖动
  const target = e.target as HTMLElement | null
  if (target?.closest?.('.resize-handle, .ctx-menu')) return
  closeMenu()
  const state = await window.api.getFairyPetState()
  const b = state.bounds
  if (!b) return
  dragging = {
    startX: e.screenX,
    startY: e.screenY,
    startBounds: { ...b }
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', endDrag)
}

function onDragMove(e: MouseEvent): void {
  if (!dragging) return
  const dx = e.screenX - dragging.startX
  const dy = e.screenY - dragging.startY
  void window.api.setFairyPetBounds({
    x: dragging.startBounds.x + dx,
    y: dragging.startBounds.y + dy,
    width: dragging.startBounds.width,
    height: dragging.startBounds.height
  })
}

function endDrag(): void {
  dragging = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu()
}

function onPetState(state: { pinned: boolean }): void {
  pinned.value = state.pinned
}

let unsubPetState: (() => void) | null = null

onMounted(async () => {
  await refreshState()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('blur', closeMenu)
  unsubPetState = window.api.onFairyPetState(onPetState)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('blur', closeMenu)
  unsubPetState?.()
  endResize()
  endDrag()
})
</script>

<template>
  <div
    class="pet"
    :class="{ pinned, 'menu-open': menuOpen }"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @contextmenu="onContextMenu"
    @mousedown="startDrag"
    @click="closeMenu"
  >
    <div class="pet-body">
      <FairyEyeCanvas hide-background :eye-fit="0.92" />
    </div>

    <button
      v-for="c in (['nw', 'ne', 'sw', 'se'] as Corner[])"
      :key="c"
      type="button"
      class="resize-handle"
      :class="[c, { visible: showHandles }]"
      title="拖拽缩放"
      @mousedown.stop="startResize(c, $event)"
    />

    <Transition name="ctx">
      <div
        v-if="menuOpen"
        class="ctx-menu"
        :style="{ left: `${menuX}px`, top: `${menuY}px` }"
        @click.stop
        @mousedown.stop
      >
        <button
          v-if="!pinned"
          type="button"
          class="ctx-item"
          @click="pinPet"
        >
          <span class="ctx-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M8.2 1.8 10 5.4l3.8.4-2.9 2.6.9 3.7L8 10.5l-3.8 1.6.9-3.7L2.2 5.8l3.8-.4L8.2 1.8Z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
              <path d="M8 10.6V14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </span>
          <span class="ctx-label">固定</span>
        </button>
        <button type="button" class="ctx-item danger" @click="hidePet">
          <span class="ctx-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 4.5h9M6.2 4.5V3.4c0-.5.4-.9.9-.9h1.8c.5 0 .9.4.9.9v1.1M5.2 4.5l.4 7c0 .6.5 1.1 1.1 1.1h2.6c.6 0 1.1-.5 1.1-1.1l.4-7"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="ctx-label">隐藏</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent !important;
  overflow: hidden !important;
}
</style>

<style scoped>
.pet {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
  user-select: none;
  cursor: grab;
}

.pet.pinned {
  cursor: default;
}

.pet-body {
  width: 100%;
  height: 100%;
  /* 不用 app-region:drag，否则系统右键菜单会抢走事件 */
}

.resize-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.resize-handle.visible {
  opacity: 1;
  pointer-events: auto;
  background: rgba(125, 211, 252, 0.35);
  box-shadow: 0 0 0 1px rgba(186, 230, 253, 0.35);
}

.resize-handle.nw {
  top: 2px;
  left: 2px;
  cursor: nwse-resize;
}
.resize-handle.ne {
  top: 2px;
  right: 2px;
  cursor: nesw-resize;
}
.resize-handle.sw {
  bottom: 2px;
  left: 2px;
  cursor: nesw-resize;
}
.resize-handle.se {
  bottom: 2px;
  right: 2px;
  cursor: nwse-resize;
}

.ctx-menu {
  position: fixed;
  z-index: 20;
  min-width: 128px;
  padding: 5px;
  border-radius: 12px;
  border: 1px solid rgba(165, 220, 255, 0.18);
  background:
    linear-gradient(165deg, rgba(28, 48, 72, 0.92) 0%, rgba(12, 22, 36, 0.94) 100%);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35) inset,
    0 12px 32px rgba(0, 12, 28, 0.55),
    0 0 24px rgba(56, 160, 220, 0.12);
  backdrop-filter: blur(14px) saturate(1.2);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(220, 236, 248, 0.92);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.ctx-item:hover {
  background: rgba(120, 190, 240, 0.14);
  color: #f2f8ff;
}

.ctx-item.danger:hover {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

.ctx-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: rgba(146, 210, 245, 0.9);
}

.ctx-item:hover .ctx-icon {
  color: #b8e4ff;
}

.ctx-item.danger .ctx-icon {
  color: rgba(252, 165, 165, 0.85);
}

.ctx-item.danger:hover .ctx-icon {
  color: #fecaca;
}

.ctx-icon svg {
  width: 16px;
  height: 16px;
  display: block;
}

.ctx-label {
  line-height: 1;
}

.ctx-enter-active,
.ctx-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.ctx-enter-from,
.ctx-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}
</style>
