<!-- App shell: brand, new session, collapsible rail, bottom-pinned settings. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore, sessionInLane } from '../../stores/chatStore'
import { useLlmStore } from '../../stores/llmStore'
import { useBgmStore } from '../../stores/bgmStore'
import { onBgmSpectrum } from '../../services/bgmPlayer'
import Config from '../../views/Config.vue'
import ModeSwitch from './ModeSwitch.vue'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const llmStore = useLlmStore()
const bgmStore = useBgmStore()
const collapsed = ref(false)
const peeking = ref(false)
let peekTimer: ReturnType<typeof setTimeout> | null = null
const accountOpen = ref(false)
const settingsOpen = ref(false)
const accountRoot = ref<HTMLElement | null>(null)
const workMode = ref<'chat' | 'code'>('chat')
provide('workMode', workMode)

interface SessionRow {
  session: string
  title: string
  updatedAt: number
  pinned?: boolean
  projectDir?: string
}

const sessions = ref<SessionRow[]>([])
const historyOpen = ref(true)
const pinsOpen = ref(true)
const projectOpen = ref(false)
const projectDirs = ref<string[]>([])
const folderOpen = ref<Record<string, boolean>>({})
const focusedProjectDir = ref('')
const projectMenu = ref<{ x: number; y: number; dir: string } | null>(null)
const historyMenu = ref<{ session: string; x: number; y: number } | null>(null)
const renamingSession = ref('')
const renameDraft = ref('')
const historyListEl = ref<HTMLElement | null>(null)
const historyFit = ref(8)
const HISTORY_ROW = 32
let historyObserver: ResizeObserver | null = null

const displayName = ref('主人')
const avatarDataUrl = ref('')
const spectrumCanvas = ref<HTMLCanvasElement | null>(null)
let unsubProfile: (() => void) | null = null
let unsubSpectrum: (() => void) | null = null
/** 沿基线走动的脉冲，走到尽头时下一颗从左侧淡入 */
let pulses: { x: number }[] = [{ x: 0 }]
let barLevels: number[] = []
let lastPulseAt = 0
const PULSE_SPEED = 0.16
const PULSE_FADE = 0.16

const avatarLetter = computed(() => {
  const name = displayName.value.trim() || '主'
  return [...name][0] || '主'
})

function applyProfile(p: {
  displayName: string
  avatarDataUrl: string
}): void {
  displayName.value = p.displayName?.trim() || '主人'
  avatarDataUrl.value = p.avatarDataUrl || ''
}

function drawSpectrum(bins: number[]): void {
  const canvas = spectrumCanvas.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 1
  const cssH = canvas.clientHeight || 36
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
  ctx.shadowBlur = 0

  const midY = cssH / 2
  const pad = 6
  const left = pad
  const width = Math.max(1, cssW - pad * 2)
  const n = Math.max(4, Math.min(14, Math.floor(width / 18)))
  const slot = width / n

  ctx.strokeStyle = 'rgba(122, 170, 255, 0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, midY)
  ctx.lineTo(left + width, midY)
  ctx.stroke()

  ctx.fillStyle = 'rgba(122, 170, 255, 0.45)'
  const ticks = Math.max(4, Math.floor(width / 22))
  for (let i = 0; i <= ticks; i++) {
    const x = left + (width * i) / ticks
    const major = i % 4 === 0
    ctx.fillRect(x, midY + 4, 1, major ? 4 : 2)
  }

  const levels: number[] = []
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i / n) * bins.length)
    const end = Math.max(start + 1, Math.min(bins.length, Math.floor(((i + 1) / n) * bins.length)))
    let sum = 0
    for (let j = start; j < end; j++) sum += bins[j] ?? 0
    levels.push(sum / (end - start))
  }
  const frameMax = levels.reduce((m, v) => Math.max(m, v), 0)
  const maxRise = cssH * 0.48
  const now = performance.now()
  const dt = lastPulseAt ? Math.min(0.05, (now - lastPulseAt) / 1000) : 1 / 60
  lastPulseAt = now
  if (barLevels.length !== n) barLevels = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    const v = levels[i] ?? 0
    // 不再用 1.65 次方把弱柱压扁，半高的柱子能占到大约七成高度，起伏才看得出来
    const ratio = frameMax < 0.05 ? 0 : Math.min(1, v / frameMax)
    const target = Math.pow(ratio, 0.55)
    const follow = target > barLevels[i] ? 0.72 : 0.28
    barLevels[i] += (target - barLevels[i]) * follow
    const shaped = barLevels[i]
    const rise = shaped * maxRise
    if (rise < 1.2) continue
    const x = left + (i + 0.5) * slot
    ctx.save()
    ctx.shadowColor = `rgba(170, 205, 255, ${0.28 + shaped * 0.72})`
    ctx.shadowBlur = 3 + shaped * 8
    ctx.strokeStyle = `rgba(${Math.round(150 + shaped * 90)}, ${Math.round(190 + shaped * 50)}, 255, ${0.32 + shaped * 0.68})`
    ctx.lineWidth = shaped > 0.72 ? 1.6 : 1.15
    ctx.lineJoin = 'miter'
    ctx.beginPath()
    ctx.moveTo(x, midY)
    ctx.lineTo(x, midY - rise)
    ctx.lineTo(x + 2.2, midY + Math.min(4, rise * 0.22))
    ctx.lineTo(x + slot * 0.42, midY)
    ctx.stroke()
    ctx.restore()
  }

  for (const pulse of pulses) pulse.x += dt * PULSE_SPEED
  const rightmost = pulses.reduce((best, pulse) => (pulse.x > best.x ? pulse : best), pulses[0])
  if (pulses.length < 2 && rightmost.x >= 1 - PULSE_FADE) {
    pulses.push({ x: rightmost.x - 1 })
  }
  pulses = pulses.filter((pulse) => pulse.x < 1 + PULSE_FADE)

  for (const pulse of pulses) {
    const x = pulse.x
    let alpha = 1
    if (x < PULSE_FADE) alpha = Math.max(0, x / PULSE_FADE)
    else if (x > 1) alpha = Math.max(0, 1 - (x - 1) / PULSE_FADE)
    if (alpha < 0.02 || x < 0) continue
    const hx = left + x * width
    const trailEnd = Math.min(hx, left + width)
    ctx.save()
    ctx.globalAlpha = alpha
    const head = ctx.createLinearGradient(hx - 22, midY, trailEnd, midY)
    head.addColorStop(0, 'rgba(122, 170, 255, 0)')
    head.addColorStop(1, 'rgba(232, 242, 255, 0.95)')
    ctx.strokeStyle = head
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(Math.max(left, hx - 22), midY)
    ctx.lineTo(trailEnd, midY)
    ctx.stroke()
    ctx.shadowColor = 'rgba(190, 216, 255, 0.95)'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#f4f8ff'
    ctx.beginPath()
    ctx.arc(Math.min(hx, left + width), midY, 1.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

const pinnedSessions = computed(() => sessions.value.filter((row) => row.pinned))
const unpinnedSessions = computed(() => sessions.value.filter((row) => !row.pinned))
const historyOverflow = computed(() => unpinnedSessions.value.length > historyFit.value)
const visibleSessions = computed(() =>
  historyOverflow.value ? unpinnedSessions.value.slice(0, historyFit.value) : unpinnedSessions.value
)
function folderName(dir: string): string {
  const parts = dir.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || dir
}
function sameProjectDir(left: string, right: string): boolean {
  const norm = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return Boolean(left) && Boolean(right) && norm(left) === norm(right)
}
function isFolderOpen(dir: string): boolean {
  const key = dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return folderOpen.value[key] !== false
}
function toggleFolder(dir: string): void {
  const key = dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  folderOpen.value = { ...folderOpen.value, [key]: !isFolderOpen(dir) }
}
function sessionsFor(dir: string): SessionRow[] {
  return sessions.value.filter((row) => sameProjectDir(row.projectDir || '', dir))
}
const codeProjectName = computed(() => folderName(focusedProjectDir.value))
const codeProjectFocus = ref(false)
provide('codeProjectName', codeProjectName)
provide('codeProjectFocus', codeProjectFocus)
const newSessionLabel = computed(() => (workMode.value === 'code' ? '新会话' : '新对话'))
const historyLabel = computed(() => (workMode.value === 'code' ? '会话' : '对话'))

function measureHistory(): void {
  const el = historyListEl.value
  if (!el) return
  historyFit.value = Math.max(1, Math.floor(el.clientHeight / HISTORY_ROW))
}

watch([historyOpen, collapsed, peeking], async () => {
  await nextTick()
  historyObserver?.disconnect()
  if (historyListEl.value && historyObserver) historyObserver.observe(historyListEl.value)
  measureHistory()
})

async function refreshSessions(): Promise<void> {
  if (!window.api?.listChatSessions) {
    sessions.value = []
    return
  }
  try {
    sessions.value = (await window.api.listChatSessions(workMode.value)).filter((row) =>
      sessionInLane(row.session, workMode.value)
    )
  } catch {
    sessions.value = []
  }
  await nextTick()
  measureHistory()
}

function pokeIdle(): void {
  window.api.noteIdleActivity?.()
}

onMounted(async () => {
  try {
    applyProfile(await window.api.getUserProfile())
  } catch {
    /* ignore */
  }
  unsubProfile = window.api?.onUserProfileChanged?.(applyProfile) ?? null
  document.addEventListener('pointerdown', onDocumentPointer)
  window.addEventListener('keydown', pokeIdle)
  void bgmStore.bootstrap()
  unsubSpectrum = onBgmSpectrum((bins) => drawSpectrum(bins))
  drawSpectrum(new Array(32).fill(0))
  void refreshSessions()
  try {
    const listed = await window.api.listCodeProjectDirs?.()
    if (listed?.length) {
      projectDirs.value = listed
    } else {
      const legacy = (await window.api.getCodeProjectDir?.()) || ''
      projectDirs.value = legacy ? [legacy] : []
    }
    projectOpen.value = projectDirs.value.length > 0
  } catch {
    projectDirs.value = []
  }
  window.addEventListener('fairy-sessions-changed', onSessionsChanged)
  window.api?.onAgUiEvent?.((event) => {
    if (event.type === 'ai:done') void refreshSessions()
  })
  historyObserver = new ResizeObserver(() => measureHistory())
  await nextTick()
  if (historyListEl.value) historyObserver.observe(historyListEl.value)
})

function onSessionsChanged(): void {
  void refreshSessions()
}

onUnmounted(() => {
  unsubProfile?.()
  unsubSpectrum?.()
  historyObserver?.disconnect()
  clearPeekTimer()
  document.removeEventListener('pointerdown', onDocumentPointer)
  window.removeEventListener('keydown', pokeIdle)
  window.removeEventListener('fairy-sessions-changed', onSessionsChanged)
})

const activePath = computed(() => route.path)

const showSpectrum = computed(() => bgmStore.enabled && bgmStore.playing)

function isActive(to: string): boolean {
  return activePath.value === to || activePath.value.startsWith(to + '/')
}

function doNewChat(): void {
  chatStore.activate(workMode.value)
  chatStore.startNewSession()
  focusedProjectDir.value = ''
  codeProjectFocus.value = false
  llmStore.setGenerating(false)
  void refreshSessions()
  if (route.path !== '/chat') void router.push('/chat')
}

async function openSession(row: SessionRow): Promise<void> {
  if (llmStore.isGenerating) return
  chatStore.activate(workMode.value)
  const linked = projectDirs.value.find((dir) => sameProjectDir(dir, row.projectDir || '')) || ''
  focusedProjectDir.value = linked
  codeProjectFocus.value = Boolean(linked)
  try {
    const rows = (await window.api?.getChatMessages(row.session)) ?? []
    chatStore.loadSession(
      row.session,
      rows.map((item) => ({ role: item.role, content: item.content }))
    )
  } catch {
    return
  }
  if (route.path !== '/chat') await router.push('/chat')
}

watch(workMode, (mode) => {
  chatStore.activate(mode)
  void refreshSessions()
  if (mode === 'code' && route.path === '/schedule') void router.push('/chat')
})

function onProjectHead(): void {
  projectOpen.value = !projectOpen.value
}

async function pickProjectDir(): Promise<void> {
  const picked = await window.api.pickCodeProjectDir?.()
  if (!picked) return
  if (!projectDirs.value.some((dir) => sameProjectDir(dir, picked))) {
    projectDirs.value = [...projectDirs.value, picked]
  }
  projectOpen.value = true
  const key = picked.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  folderOpen.value = { ...folderOpen.value, [key]: true }
}

function startProjectSession(dir: string): void {
  if (!dir) return
  projectMenu.value = null
  const key = dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  folderOpen.value = { ...folderOpen.value, [key]: true }
  chatStore.activate('code')
  chatStore.startNewSession()
  llmStore.setGenerating(false)
  focusedProjectDir.value = dir
  codeProjectFocus.value = true
  const sessionId = chatStore.sessionId
  void (async () => {
    await window.api?.bindChatProject?.(sessionId, dir)
    if (window.api?.listChatSessions) await refreshSessions()
    if (!sessions.value.some((row) => row.session === sessionId)) {
      sessions.value.unshift({
        session: sessionId,
        title: '新会话',
        updatedAt: Math.floor(Date.now() / 1000),
        pinned: false,
        projectDir: dir
      })
    }
  })()
  if (route.path !== '/chat') void router.push('/chat')
}

function openProjectMenu(event: MouseEvent, dir: string): void {
  historyMenu.value = null
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const rect = target.getBoundingClientRect()
  projectMenu.value = {
    x: Math.min(rect.left, window.innerWidth - 168),
    y: Math.min(rect.bottom + 4, window.innerHeight - 48),
    dir
  }
}

async function deleteProject(): Promise<void> {
  const dir = projectMenu.value?.dir || ''
  projectMenu.value = null
  if (!dir) return
  projectDirs.value = projectDirs.value.filter((item) => !sameProjectDir(item, dir))
  if (sameProjectDir(focusedProjectDir.value, dir)) {
    focusedProjectDir.value = ''
    codeProjectFocus.value = false
  }
  await window.api.removeCodeProjectDir?.(dir)
}

function openHistoryPage(): void {
  void router.push('/history')
}

function dismissPeek(): void {
  peeking.value = false
  clearPeekTimer()
}

function openVoiceCall(): void {
  dismissPeek()
  accountOpen.value = false
  window.api.openVoiceCallWindow()
}

function clearPeekTimer(): void {
  if (peekTimer) {
    clearTimeout(peekTimer)
    peekTimer = null
  }
}

const PEEK_WIDTH = 248

function schedulePeekClose(): void {
  if (peekTimer) return
  peekTimer = setTimeout(() => {
    peeking.value = false
    peekTimer = null
  }, 120)
}

function onShellPointerMove(event: PointerEvent): void {
  if (!collapsed.value || settingsOpen.value) {
    if (peeking.value) dismissPeek()
    return
  }
  if (accountOpen.value) {
    clearPeekTimer()
    peeking.value = true
    return
  }
  const shell = event.currentTarget
  if (!(shell instanceof HTMLElement)) return
  const shellRect = shell.getBoundingClientRect()
  const x = event.clientX - shellRect.left
  const btn = shell.querySelector('.sidebar-top [aria-label="展开侧栏"]')?.getBoundingClientRect()
  const onExpand =
    !!btn &&
    event.clientX >= btn.left &&
    event.clientX <= btn.right &&
    event.clientY >= btn.top &&
    event.clientY <= btn.bottom
  const inPanel = peeking.value && x >= 0 && x <= PEEK_WIDTH
  if (onExpand || inPanel) {
    clearPeekTimer()
    peeking.value = true
    return
  }
  if (peeking.value) schedulePeekClose()
}

function onMainPointerEnter(event: PointerEvent): void {
  if (!peeking.value || !collapsed.value || accountOpen.value) return
  const shell = event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null
  if (!shell) return
  const x = event.clientX - shell.getBoundingClientRect().left
  if (x <= PEEK_WIDTH) return
  schedulePeekClose()
}

function toggleSidebar(): void {
  collapsed.value = !collapsed.value
  peeking.value = false
  clearPeekTimer()
  accountOpen.value = false
}

function toggleAccount(): void {
  clearPeekTimer()
  accountOpen.value = !accountOpen.value
}

function openSettings(): void {
  dismissPeek()
  accountOpen.value = false
  settingsOpen.value = true
}

function closeSettings(): void {
  settingsOpen.value = false
}

function onDocumentPointer(event: PointerEvent): void {
  pokeIdle()
  if ((historyMenu.value || projectMenu.value) && event.target instanceof Node) {
    const menu = document.querySelector('.history-menu')
    if (!menu || !menu.contains(event.target)) {
      historyMenu.value = null
      projectMenu.value = null
    }
  }
  const root = accountRoot.value
  if (!accountOpen.value || !root) return
  if (event.target instanceof Node && root.contains(event.target)) return
  accountOpen.value = false
  if (!collapsed.value || !peeking.value) return
  const shell = root.closest('.shell')
  if (!(shell instanceof HTMLElement)) return
  const x = event.clientX - shell.getBoundingClientRect().left
  if (x > PEEK_WIDTH) dismissPeek()
}

function openHistoryMenu(event: MouseEvent, row: SessionRow): void {
  const menuWidth = 168
  const menuHeight = 120
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
  historyMenu.value = { session: row.session, x, y }
}

const historyMenuRow = computed(() =>
  sessions.value.find((row) => row.session === historyMenu.value?.session) ?? null
)

async function togglePinSession(row: SessionRow): Promise<void> {
  historyMenu.value = null
  await window.api?.setChatPinned?.(row.session, !row.pinned)
  await refreshSessions()
}

function beginRename(row: SessionRow): void {
  historyMenu.value = null
  renamingSession.value = row.session
  renameDraft.value = row.title
  void nextTick(() => {
    document.querySelector<HTMLInputElement>('.history-rename')?.focus()
  })
}

async function commitRename(): Promise<void> {
  const session = renamingSession.value
  const title = renameDraft.value.trim()
  renamingSession.value = ''
  if (!session || !title) return
  await window.api?.renameChatSession?.(session, title)
  await refreshSessions()
}

async function deleteSession(row: SessionRow): Promise<void> {
  historyMenu.value = null
  await window.api?.deleteChatSession?.(row.session)
  if (chatStore.sessionId === row.session) {
    chatStore.startNewSession()
    if (route.path !== '/chat') await router.push('/chat')
  }
  await refreshSessions()
}

function minimizeWindow(): void {
  void window.api?.minimizeWindow()
}

function toggleMaximizeWindow(): void {
  void window.api?.toggleMaximizeWindow()
}

function closeWindow(): void {
  void window.api?.closeWindow()
}
</script>

<template>
  <div
    class="shell"
    :class="{ collapsed, peeking: collapsed && peeking }"
    @pointermove="onShellPointerMove"
  >
    <div class="sidebar-top">
        <button type="button" class="collapse-btn" title="拓展" aria-label="拓展">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="collapse-btn"
          :title="collapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="4"
              y="5"
              width="16"
              height="14"
              rx="2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path d="M9 5v14" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </button>
        <button
          type="button"
          class="collapse-btn"
          title="语音通话"
          aria-label="语音通话"
          @click="openVoiceCall"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M8 5h3l1.5 3.5-2 1.2a12 12 0 0 0 5.8 5.8l1.2-2L20 15v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 8.2 2 2 0 0 1 6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <div v-show="!collapsed" class="sidebar-drag" />
        <ModeSwitch v-if="!collapsed" v-model="workMode" />
      </div>

    <aside v-if="!collapsed || peeking" class="sidebar">
      <div v-if="collapsed && peeking" class="peek-top">
        <ModeSwitch v-model="workMode" />
      </div>
      <nav class="nav-list">
        <button type="button" class="nav-item" @click="doNewChat">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M8 6.5h6.2A2 2 0 0 1 16.2 8.5v5.2a2 2 0 0 1-2 2H9.2L6.4 18.2V8.5A2 2 0 0 1 8.4 6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path
              d="M18.2 4.8v5.2M15.6 7.4h5.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          {{ newSessionLabel }}
        </button>
        <button
          v-if="workMode !== 'code'"
          type="button"
          class="nav-item"
          :class="{ active: isActive('/schedule') }"
          @click="router.push('/schedule')"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M12 8.2V12l2.8 1.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          定时任务
        </button>
        <div v-else class="project-block">
          <div class="history-head project-head">
            <button type="button" class="project-toggle" @click="onProjectHead">
              <span>项目</span>
              <span class="history-chevron" :class="{ open: projectOpen }" aria-hidden="true">
                <svg viewBox="0 0 12 12"><path d="M4.2 2.4 7.8 6 4.2 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </span>
            </button>
            <button type="button" class="project-icon" title="添加项目" aria-label="添加项目" @click="pickProjectDir">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <template v-if="projectOpen">
            <template v-for="dir in projectDirs" :key="dir">
              <div class="project-row">
                <button type="button" class="project-fold" :title="dir" @click="toggleFolder(dir)">
                  <span class="history-chevron" :class="{ open: isFolderOpen(dir) }" aria-hidden="true">
                    <svg viewBox="0 0 12 12"><path d="M4.2 2.4 7.8 6 4.2 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </span>
                  <span class="project-name">{{ folderName(dir) }}</span>
                </button>
                <button type="button" class="project-icon" title="项目选项" aria-label="项目选项" @click="openProjectMenu($event, dir)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
                  </svg>
                </button>
                <button type="button" class="project-icon" title="新会话" aria-label="在此项目新建会话" @click="startProjectSession(dir)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M8 6.5h6.2A2 2 0 0 1 16.2 8.5v5.2a2 2 0 0 1-2 2H9.2L6.4 18.2V8.5A2 2 0 0 1 8.4 6.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M18.2 4.8v5.2M15.6 7.4h5.2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div v-if="isFolderOpen(dir) && sessionsFor(dir).length" class="project-sessions">
                <button
                  v-for="row in sessionsFor(dir)"
                  :key="row.session"
                  type="button"
                  class="history-item"
                  :class="{ active: chatStore.sessionId === row.session && activePath === '/chat' }"
                  :title="row.title"
                  @click="openSession(row)"
                  @contextmenu.prevent="openHistoryMenu($event, row)"
                >
                  {{ row.title }}
                </button>
              </div>
            </template>
          </template>
        </div>

        <div class="history-block">
          <template v-if="pinnedSessions.length">
            <button type="button" class="history-head" @click="pinsOpen = !pinsOpen">
              <span>已置顶</span>
              <span class="history-chevron" :class="{ open: pinsOpen }" aria-hidden="true">
                <svg viewBox="0 0 12 12"><path d="M4.2 2.4 7.8 6 4.2 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </span>
            </button>
            <div v-if="pinsOpen" class="history-pin-list">
              <template v-for="row in pinnedSessions" :key="row.session">
                <input
                  v-if="renamingSession === row.session"
                  v-model="renameDraft"
                  class="history-rename"
                  @click.stop
                  @keydown.enter.prevent="commitRename"
                  @keydown.esc.prevent="renamingSession = ''"
                  @blur="commitRename"
                />
                <button
                  v-else
                  type="button"
                  class="history-item"
                  :class="{ active: chatStore.sessionId === row.session && activePath === '/chat' }"
                  :title="row.title"
                  @click="openSession(row)"
                  @contextmenu.prevent="openHistoryMenu($event, row)"
                >
                  {{ row.title }}
                </button>
              </template>
            </div>
          </template>

          <button type="button" class="history-head" @click="historyOpen = !historyOpen">
            <span>{{ historyLabel }}</span>
            <span class="history-chevron" :class="{ open: historyOpen }" aria-hidden="true">
              <svg viewBox="0 0 12 12"><path d="M4.2 2.4 7.8 6 4.2 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
          </button>
          <div v-if="historyOpen" ref="historyListEl" class="history-list">
            <p v-if="unpinnedSessions.length === 0 && pinnedSessions.length === 0" class="history-empty">还没有{{ historyLabel }}</p>
            <template v-for="row in visibleSessions" :key="row.session">
              <input
                v-if="renamingSession === row.session"
                v-model="renameDraft"
                class="history-rename"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="renamingSession = ''"
                @blur="commitRename"
              />
              <button
                v-else
                type="button"
                class="history-item"
                :class="{ active: chatStore.sessionId === row.session && activePath === '/chat' }"
                :title="row.title"
                @click="openSession(row)"
                @contextmenu.prevent="openHistoryMenu($event, row)"
              >
                {{ row.title }}
              </button>
            </template>
          </div>
          <button
            v-if="historyOpen && historyOverflow"
            type="button"
            class="history-more"
            :class="{ active: isActive('/history') }"
            @click="openHistoryPage"
          >
            展示更多
          </button>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div class="spectrum-wrap" :class="{ active: showSpectrum }" aria-hidden="true">
          <canvas ref="spectrumCanvas" class="spectrum" />
        </div>
        <div ref="accountRoot" class="account">
          <button
            type="button"
            class="user-chip"
            :class="{ active: accountOpen }"
            :aria-expanded="accountOpen"
            @click="toggleAccount"
          >
            <span class="user-avatar">
              <img
                v-if="avatarDataUrl"
                class="user-avatar-img"
                :src="avatarDataUrl"
                alt=""
              />
              <template v-else>{{ avatarLetter }}</template>
            </span>
            <span class="user-name">{{ displayName }}</span>
          </button>
          <div v-if="accountOpen" class="account-menu" role="menu">
            <div class="account-name">{{ displayName }}</div>
            <button type="button" class="account-item" role="menuitem" @click="openSettings">
              设置
            </button>
          </div>
        </div>
      </div>
    </aside>

    <div class="winbar">
        <div class="win-drag" />
        <span v-if="activePath === '/chat'" class="win-hint">新艾利都智能管家</span>
        <div class="win-controls">
          <button type="button" class="win-btn" aria-label="最小化" @click="minimizeWindow">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          <button type="button" class="win-btn" aria-label="最大化" @click="toggleMaximizeWindow">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          <button type="button" class="win-btn close" aria-label="关闭" @click="closeWindow">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
        </div>
      </div>
      <div class="main-body" @pointerenter="onMainPointerEnter">
        <RouterView />
      </div>

    <div v-if="settingsOpen" class="settings-mask" @click.self="closeSettings">
      <div class="settings-float" role="dialog" aria-modal="true" aria-label="设置">
        <button type="button" class="settings-close" aria-label="关闭设置" @click="closeSettings">
          ×
        </button>
        <Config />
      </div>
    </div>

    <div
      v-if="historyMenu && historyMenuRow"
      class="history-menu"
      :style="{ left: historyMenu.x + 'px', top: historyMenu.y + 'px' }"
      @pointerdown.stop
    >
      <button type="button" @click="togglePinSession(historyMenuRow)">
        {{ historyMenuRow.pinned ? '取消置顶' : '置顶' }}
      </button>
      <button type="button" @click="beginRename(historyMenuRow)">重命名</button>
      <button type="button" class="danger" @click="deleteSession(historyMenuRow)">删除</button>
    </div>

    <div
      v-if="projectMenu"
      class="history-menu"
      :style="{ left: projectMenu.x + 'px', top: projectMenu.y + 'px' }"
      @pointerdown.stop
    >
      <button type="button" class="danger" @click="deleteProject">删除项目</button>
    </div>

  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  grid-template-rows: 40px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: var(--agent-bg);
  color: var(--agent-text);
  position: relative;
}

.shell.collapsed {
  grid-template-columns: max-content minmax(0, 1fr);
}

.sidebar {
  grid-area: 2 / 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 10px 14px;
  gap: 0;
  background: #111111;
  border-right: 0.5px solid var(--agent-border-strong);
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.shell:has(.account-menu) .sidebar {
  overflow: visible;
}

.collapse-btn,
.nav-item,
.history-head,
.history-item,
.history-more,
.sidebar-foot,
.account,
.user-chip {
  -webkit-app-region: no-drag;
}

.sidebar-top {
  grid-area: 1 / 1;
  position: relative;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  min-width: 0;
  padding: 0 10px;
  box-sizing: border-box;
  background: #111111;
  border-right: 0.5px solid var(--agent-border-strong);
  -webkit-app-region: drag;
}

.shell.collapsed .sidebar-top {
  width: max-content;
  background: var(--agent-bg);
  border-right-color: transparent;
  padding-right: 4px;
  z-index: 26;
  -webkit-app-region: no-drag;
}

.shell.peeking .sidebar-top,
.shell.peeking .sidebar {
  background: #20201e;
  border-right-color: transparent;
}

.peek-top {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  height: 40px;
  margin: 0 -10px;
  padding: 0 10px 0 132px;
  box-sizing: border-box;
  background: #20201e;
  -webkit-app-region: no-drag;
}

.shell.peeking .sidebar {
  position: absolute;
  top: 0;
  left: 0;
  grid-area: auto;
  z-index: 25;
  width: 248px;
  height: 100%;
  box-shadow: 12px 0 32px rgba(0, 0, 0, 0.28);
  -webkit-app-region: no-drag;
}

.sidebar-drag {
  flex: 1;
  align-self: stretch;
  min-width: 12px;
  -webkit-app-region: drag;
}

.shell.peeking .win-drag {
  -webkit-app-region: no-drag;
}

.collapse-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text-mid);
  cursor: pointer;
}

.collapse-btn:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.account {
  position: relative;
  width: 100%;
}

.account.alone {
  width: auto;
}

.account-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 30;
  width: 100%;
  min-width: 180px;
  padding: 6px;
  border-radius: 12px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-panel);
  -webkit-app-region: no-drag;
}

.account.alone .account-menu {
  left: calc(100% + 8px);
  bottom: 0;
  width: 180px;
}

.account-name {
  padding: 8px 10px 6px;
  font-size: 12px;
  color: var(--agent-text-dim);
}

.account-item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.account-item:hover {
  background: var(--agent-sidebar-hover);
}

.nav-primary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 10px;
  background: transparent;
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.nav-primary:hover {
  background: var(--agent-sidebar-hover);
}

.ico {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.nav-item.active {
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
}

.project-block {
  display: flex;
  flex-direction: column;
}

.project-head {
  gap: 4px;
}

.project-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.project-sessions {
  display: flex;
  flex-direction: column;
  padding-left: 16px;
}

.project-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 6px 0 12px;
  border-radius: 8px;
}

.project-row:hover {
  background: var(--agent-sidebar-hover);
}

.project-fold {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.project-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  text-align: left;
}

.project-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--agent-text-dim);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.project-icon svg {
  width: 16px;
  height: 16px;
}

.project-icon:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.history-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}

.history-head,
.history-more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.history-head:hover,
.history-more:hover,
.history-item:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.history-chevron {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  color: var(--agent-text-dim);
  transition: transform 0.15s ease;
}

.history-chevron svg {
  width: 12px;
  height: 12px;
}

.history-chevron.open {
  transform: rotate(90deg);
}

.history-pin-list {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.history-rename {
  width: 100%;
  height: 32px;
  margin: 0;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  outline: none;
  -webkit-app-region: no-drag;
}

.history-menu {
  position: fixed;
  z-index: 80;
  width: 160px;
  padding: 6px;
  border-radius: 12px;
  background: #2a2a2e;
  box-shadow: var(--agent-elevation-panel);
  -webkit-app-region: no-drag;
}

.history-menu button {
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.history-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.history-menu button.danger {
  color: #f07178;
}

.history-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.history-empty {
  margin: 0;
  height: 32px;
  padding: 8px 12px;
  color: var(--agent-text-dim);
  font-size: 12px;
}

.history-item {
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.001);
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item.active,
.history-more.active {
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
}

.nav-dot {
  font-size: 12px;
  font-weight: 600;
}

.sidebar-foot {
  margin-top: auto;
  padding-top: 6px;
  border-top: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
}

.spectrum-wrap {
  width: 100%;
  height: 58px;
  margin-bottom: 6px;
  opacity: 0.55;
  transition: opacity 0.2s ease;
}

.spectrum-wrap.active {
  opacity: 1;
}

.spectrum {
  display: block;
  width: 100%;
  height: 100%;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.001);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.user-chip:hover {
  background: var(--agent-sidebar-hover);
}

.user-chip.active {
  background: var(--agent-sidebar-active);
}

.user-chip.alone {
  width: 36px;
  height: 36px;
  justify-content: center;
  padding: 0;
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--agent-surface-2);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.user-name {
  font-size: 12px;
  color: var(--agent-text-dim);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.winbar {
  grid-area: 1 / 2;
  height: 40px;
  min-width: 0;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  background: var(--agent-bg);
}

.win-drag {
  flex: 1;
  -webkit-app-region: drag;
}

.win-hint {
  align-self: center;
  margin-right: 12px;
  font-size: 12px;
  color: var(--agent-text-dim);
  -webkit-app-region: no-drag;
}

.win-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.shell:has(.settings-mask) .win-controls {
  position: relative;
  z-index: 50;
  background: transparent;
}

.win-btn {
  width: 46px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--agent-text-mid);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.win-btn svg {
  width: 12px;
  height: 12px;
}

.win-btn:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.win-btn.close:hover {
  background: #e5484d;
  color: #fff;
}

.main-body {
  grid-area: 2 / 2;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--agent-bg);
}

.main-body > :deep(*) {
  flex: 1;
  min-height: 0;
}

.shell.collapsed .main-body {
  grid-column: 1 / -1;
}

.settings-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  padding: calc(40px + clamp(14px, 2.4vh, 28px)) clamp(18px, 8vw, 176px) clamp(14px, 2.4vh, 28px);
  background: rgba(0, 0, 0, 0.52);
  -webkit-app-region: no-drag;
}

.settings-float {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--agent-bg);
  border: 0.5px solid var(--agent-border-strong);
  box-shadow: var(--agent-elevation-panel);
}

.settings-close {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 2;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--agent-bg);
  color: var(--agent-text-mid);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.settings-close:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}
</style>
