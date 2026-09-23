<!-- App shell: brand, new session, collapsible rail, bottom-pinned settings. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chatStore'
import { useLlmStore } from '../../stores/llmStore'
import fairyMark from '../../assets/fairy-mark.png'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const llmStore = useLlmStore()
const collapsed = ref(false)
const confirmOpen = ref(false)

const displayName = ref('主人')
const avatarDataUrl = ref('')
let unsubProfile: (() => void) | null = null

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

onMounted(async () => {
  try {
    applyProfile(await window.api.getUserProfile())
  } catch {
    /* ignore */
  }
  unsubProfile = window.api.onUserProfileChanged(applyProfile)
})

onUnmounted(() => {
  unsubProfile?.()
})

const navItems = [
  { to: '/chat', label: '聊天' },
  { to: '/memory', label: '记忆' },
  { to: '/toolplugin', label: '工具' },
  { to: '/schedule', label: '定时任务' }
] as const

const activePath = computed(() => route.path)
const settingsActive = computed(
  () => activePath.value === '/config' || activePath.value.startsWith('/config/')
)
const profileActive = computed(
  () => activePath.value === '/profile' || activePath.value.startsWith('/profile/')
)

const hasChatContent = computed(
  () => chatStore.messages.length > 0 || !!chatStore.streamingContent || llmStore.isGenerating
)

function isActive(to: string): boolean {
  return activePath.value === to || activePath.value.startsWith(to + '/')
}

function requestNewChat(): void {
  if (hasChatContent.value) {
    confirmOpen.value = true
    return
  }
  doNewChat()
}

function doNewChat(): void {
  confirmOpen.value = false
  chatStore.clearMessages()
  llmStore.setGenerating(false)
  if (route.path !== '/chat') router.push('/chat')
}

function cancelNewChat(): void {
  confirmOpen.value = false
}

function openVoiceCall(): void {
  window.api.openVoiceCallWindow()
}

function toggleSidebar(): void {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <div class="shell" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="sidebar-top">
        <button
          type="button"
          class="collapse-btn"
          :title="collapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              v-if="collapsed"
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              v-else
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <div v-if="!collapsed" class="brand" @click="requestNewChat">
          <img class="brand-mark" :src="fairyMark" alt="" aria-hidden="true" />
          <div class="brand-text">
            <span class="brand-name">Fairy</span>
            <span class="brand-badge">Agent</span>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="brand-mark alone"
          title="Fairy"
          @click="requestNewChat"
        >
          <img class="brand-mark-img" :src="fairyMark" alt="Fairy" />
        </button>
      </div>

      <button
        class="nav-primary"
        type="button"
        :title="collapsed ? '新对话' : undefined"
        @click="requestNewChat"
      >
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <span v-if="!collapsed" class="nav-primary-label">新对话</span>
      </button>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.to"
          type="button"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
          :title="collapsed ? item.label : undefined"
          @click="router.push(item.to)"
        >
          <span v-if="!collapsed">{{ item.label }}</span>
          <span v-else class="nav-dot">{{ item.label.slice(0, 1) }}</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <button
          type="button"
          class="nav-item call"
          :title="collapsed ? '语音通话' : undefined"
          @click="openVoiceCall"
        >
          <span v-if="!collapsed">语音通话</span>
          <span v-else class="nav-dot">通</span>
        </button>
        <button
          type="button"
          class="nav-item settings"
          :class="{ active: settingsActive }"
          :title="collapsed ? '设置' : undefined"
          @click="router.push('/config')"
        >
          <span v-if="!collapsed">设置</span>
          <span v-else class="nav-dot">设</span>
        </button>
        <button
          type="button"
          class="user-chip"
          :class="{ alone: collapsed, active: profileActive }"
          :title="collapsed ? displayName : undefined"
          @click="router.push('/profile')"
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
          <span v-if="!collapsed" class="user-name">{{ displayName }}</span>
        </button>
      </div>
    </aside>

    <main class="main">
      <RouterView />
    </main>

    <div v-if="confirmOpen" class="confirm-mask" @click.self="cancelNewChat">
      <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <h2 id="new-chat-title" class="confirm-title">开始新对话？</h2>
        <p class="confirm-desc">当前聊天内容会被清空，且无法恢复。</p>
        <div class="confirm-actions">
          <button type="button" class="btn-ghost" @click="cancelNewChat">取消</button>
          <button type="button" class="btn-danger" @click="doNewChat">清空并新建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--agent-bg);
  color: var(--agent-text);
  position: relative;
}

.sidebar {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 10px 14px;
  background: var(--agent-sidebar);
  border-right: 0.5px solid var(--agent-border-strong);
  transition: width 0.18s ease;
  overflow: hidden;
  -webkit-app-region: drag;
}

.shell.collapsed .sidebar {
  width: 56px;
  padding-left: 8px;
  padding-right: 8px;
  align-items: center;
}

.sidebar-top,
.brand,
.collapse-btn,
.nav-primary,
.nav-item,
.sidebar-foot,
.brand-mark.alone,
.user-chip {
  -webkit-app-region: no-drag;
}

.sidebar-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
}

.shell.collapsed .sidebar-top {
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.collapse-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--agent-text-mid);
  cursor: pointer;
}

.collapse-btn:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 4px 4px 2px;
  cursor: pointer;
  min-width: 0;
  flex: 1;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--agent-text);
  box-shadow: none;
  border: none;
  outline: none;
  cursor: pointer;
  font: inherit;
  flex-shrink: 0;
  object-fit: contain;
  padding: 0;
  overflow: visible;
}

.brand-mark.alone {
  margin: 0;
}

.brand-mark-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.brand-badge {
  font-size: 11px;
  color: var(--agent-text-dim);
  line-height: 1.2;
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

.shell.collapsed .nav-primary {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
  border-radius: 10px;
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
  margin-top: 8px;
  flex: 1;
  overflow-y: auto;
  width: 100%;
}

.shell.collapsed .nav-list {
  align-items: center;
}

.nav-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--agent-text-mid);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.shell.collapsed .nav-item {
  width: 36px;
  height: 36px;
  padding: 0;
  display: grid;
  place-items: center;
}

.nav-item:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.nav-item.active {
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
}

.nav-item.call {
  color: var(--agent-text);
}

.nav-dot {
  font-size: 12px;
  font-weight: 600;
}

.sidebar-foot {
  margin-top: auto;
  padding-top: 10px;
  border-top: 0.5px solid var(--agent-border);
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
}

.shell.collapsed .sidebar-foot {
  align-items: center;
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
  background: transparent;
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

.main {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--agent-bg);
}

.confirm-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.48);
  -webkit-app-region: no-drag;
}

.confirm-card {
  width: min(360px, calc(100% - 40px));
  padding: 22px 22px 18px;
  border-radius: 14px;
  background: var(--agent-surface);
  box-shadow: var(--agent-elevation-panel);
}

.confirm-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.confirm-desc {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--agent-text-dim);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-ghost,
.btn-danger {
  appearance: none;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-ghost {
  background: transparent;
  color: var(--agent-text-mid);
  border: 0.5px solid var(--agent-border-strong);
}

.btn-ghost:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.btn-danger {
  background: var(--agent-send);
  color: var(--agent-send-fg);
}

.btn-danger:hover {
  filter: brightness(0.94);
}
</style>
