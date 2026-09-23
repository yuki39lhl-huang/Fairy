<!-- Settings: harness-style section rail + preference rows. -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

type SectionId = 'models' | 'search' | 'voice'

const section = ref<SectionId>('models')
const apiKey = ref('')
const savedMask = ref('')
const saving = ref(false)
const tavilyKey = ref('')
const savedTavilyMask = ref('')
const savingTavily = ref(false)
const voiceEnabled = ref(true)
const voiceSaveToFile = ref(false)
const desktopPetEnabled = ref(true)
const desktopPetPinned = ref(false)

const ttsProviders = ref<
  Array<{ id: string; displayName: string; hint: string; kind: 'local' | 'cloud' }>
>([])
const activeTtsProvider = ref('gpt-sovits')
const switchingTts = ref(false)

const minimaxKey = ref('')
const savedMinimaxMask = ref('')
const savingMinimax = ref(false)

const volcApiKey = ref('')
const savedVolcApiMask = ref('')
const savingVolcApi = ref(false)
const volcAppId = ref('')
const savedVolcAppMask = ref('')
const volcAccessToken = ref('')
const savedVolcTokenMask = ref('')
const savingVolcPair = ref(false)

const fairyStatus = ref<{
  status: 'ready' | 'pending' | 'failed' | 'missing'
  voiceId?: string
  lastError?: string
}>({ status: 'missing' })
const ensuringVoice = ref(false)
let statusTimer: ReturnType<typeof setInterval> | null = null
let unsubPetState: (() => void) | null = null

const sections: { id: SectionId; label: string; hint: string }[] = [
  { id: 'models', label: '模型', hint: 'DeepSeek API' },
  { id: 'search', label: '搜索', hint: 'Tavily 联网' },
  { id: 'voice', label: '语音', hint: '厂家与声线' }
]

const fairyStatusLabel = computed(() => {
  switch (fairyStatus.value.status) {
    case 'ready':
      return 'Fairy 声线已就绪'
    case 'pending':
      return 'Fairy 声线准备中…'
    case 'failed':
      return `准备失败：${fairyStatus.value.lastError || '未知错误'}`
    default:
      return activeTtsProvider.value === 'gpt-sovits'
        ? '本地参考音（无需密钥）'
        : '尚未准备（保存密钥后自动开始）'
  }
})

async function refreshFairyStatus(): Promise<void> {
  fairyStatus.value = await window.api.getFairyVoiceStatus(activeTtsProvider.value)
}

onMounted(async () => {
  savedMask.value = await window.api.getApiKey('deepseek')
  savedTavilyMask.value = await window.api.getApiKey('tavily')
  voiceEnabled.value = await window.api.getVoiceEnabled()
  voiceSaveToFile.value = await window.api.getVoiceSaveToFile()
  const petState = await window.api.getFairyPetState()
  desktopPetEnabled.value = petState.enabled
  desktopPetPinned.value = petState.pinned
  ttsProviders.value = await window.api.listTtsProviders()
  activeTtsProvider.value = await window.api.getActiveTtsProvider()
  savedMinimaxMask.value = await window.api.getApiKey('minimax')
  savedVolcApiMask.value = await window.api.getApiKey('volcengine')
  savedVolcAppMask.value = await window.api.getApiKey('volcengineAppId')
  savedVolcTokenMask.value = await window.api.getApiKey('volcengineAccessToken')
  await refreshFairyStatus()
  statusTimer = setInterval(() => {
    void refreshFairyStatus()
  }, 2000)
  unsubPetState = window.api.onFairyPetState((state) => {
    desktopPetEnabled.value = state.enabled
    desktopPetPinned.value = state.pinned
  })
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  unsubPetState?.()
})

async function saveKey(): Promise<void> {
  if (!apiKey.value.trim()) return
  saving.value = true
  try {
    await window.api.saveApiKey('deepseek', apiKey.value.trim())
    savedMask.value = await window.api.getApiKey('deepseek')
    apiKey.value = ''
  } finally {
    saving.value = false
  }
}

async function saveTavilyKey(): Promise<void> {
  if (!tavilyKey.value.trim()) return
  savingTavily.value = true
  try {
    await window.api.saveApiKey('tavily', tavilyKey.value.trim())
    savedTavilyMask.value = await window.api.getApiKey('tavily')
    tavilyKey.value = ''
  } finally {
    savingTavily.value = false
  }
}

async function onVoiceEnabledChange(): Promise<void> {
  await window.api.setVoiceEnabled(voiceEnabled.value)
}

async function onVoiceSaveToFileChange(): Promise<void> {
  await window.api.setVoiceSaveToFile(voiceSaveToFile.value)
}

async function onDesktopPetChange(): Promise<void> {
  const state = await window.api.setFairyPetEnabled(desktopPetEnabled.value)
  desktopPetEnabled.value = state.enabled
  desktopPetPinned.value = state.pinned
}

async function onDesktopPetPinnedChange(): Promise<void> {
  const state = await window.api.setFairyPetPinned(desktopPetPinned.value)
  desktopPetPinned.value = state.pinned
}

async function onTtsProviderChange(): Promise<void> {
  switchingTts.value = true
  try {
    activeTtsProvider.value = await window.api.setActiveTtsProvider(activeTtsProvider.value)
    await refreshFairyStatus()
  } finally {
    switchingTts.value = false
  }
}

async function selectTtsProvider(id: string): Promise<void> {
  if (switchingTts.value || id === activeTtsProvider.value) return
  activeTtsProvider.value = id
  await onTtsProviderChange()
}

async function saveMinimaxKey(): Promise<void> {
  if (!minimaxKey.value.trim()) return
  savingMinimax.value = true
  try {
    await window.api.saveApiKey('minimax', minimaxKey.value.trim())
    savedMinimaxMask.value = await window.api.getApiKey('minimax')
    minimaxKey.value = ''
    fairyStatus.value = { status: 'pending' }
    await refreshFairyStatus()
  } finally {
    savingMinimax.value = false
  }
}

async function saveVolcApiKey(): Promise<void> {
  if (!volcApiKey.value.trim()) return
  savingVolcApi.value = true
  try {
    await window.api.saveApiKey('volcengine', volcApiKey.value.trim())
    savedVolcApiMask.value = await window.api.getApiKey('volcengine')
    volcApiKey.value = ''
    fairyStatus.value = { status: 'pending' }
    await refreshFairyStatus()
  } finally {
    savingVolcApi.value = false
  }
}

async function saveVolcPair(): Promise<void> {
  if (!volcAppId.value.trim() || !volcAccessToken.value.trim()) return
  savingVolcPair.value = true
  try {
    await window.api.saveApiKey('volcengineAppId', volcAppId.value.trim())
    await window.api.saveApiKey('volcengineAccessToken', volcAccessToken.value.trim())
    savedVolcAppMask.value = await window.api.getApiKey('volcengineAppId')
    savedVolcTokenMask.value = await window.api.getApiKey('volcengineAccessToken')
    volcAppId.value = ''
    volcAccessToken.value = ''
    fairyStatus.value = { status: 'pending' }
    await refreshFairyStatus()
  } finally {
    savingVolcPair.value = false
  }
}

async function retryEnsureVoice(): Promise<void> {
  ensuringVoice.value = true
  try {
    fairyStatus.value = await window.api.ensureFairyVoice(activeTtsProvider.value, true)
  } catch (err) {
    fairyStatus.value = {
      status: 'failed',
      lastError: err instanceof Error ? err.message : String(err)
    }
  } finally {
    ensuringVoice.value = false
    await refreshFairyStatus()
  }
}
</script>

<template>
  <div class="settings">
    <aside class="rail">
      <h1 class="rail-title">设置</h1>
      <nav class="rail-nav">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          class="rail-item"
          :class="{ active: section === item.id }"
          @click="section = item.id"
        >
          <span class="rail-label">{{ item.label }}</span>
          <span class="rail-hint">{{ item.hint }}</span>
        </button>
      </nav>
    </aside>

    <div class="pane">
      <!-- Models -->
      <section v-show="section === 'models'" class="pane-block">
        <header class="pane-head">
          <h2 class="pane-title">模型</h2>
          <p class="pane-sub">配置 DeepSeek API，保存后立即可用，无需重启。</p>
        </header>

        <div class="field">
          <div class="field-copy">
            <div class="field-label">DeepSeek API Key</div>
            <p class="field-desc">
              状态：
              <span class="status" :class="{ ok: !!savedMask }">
                {{ savedMask || '未配置' }}
              </span>
            </p>
          </div>
          <div class="field-control">
            <input
              v-model="apiKey"
              type="password"
              class="input"
              placeholder="sk-…"
              autocomplete="off"
              @keydown.enter="saveKey"
            />
            <button
              type="button"
              class="btn-save"
              :disabled="saving || !apiKey.trim()"
              @click="saveKey"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Search -->
      <section v-show="section === 'search'" class="pane-block">
        <header class="pane-head">
          <h2 class="pane-title">搜索</h2>
          <p class="pane-sub">Tavily 用于联网搜索；未配置时相关工具不可用。</p>
        </header>

        <div class="field">
          <div class="field-copy">
            <div class="field-label">Tavily API Key</div>
            <p class="field-desc">
              状态：
              <span class="status" :class="{ ok: !!savedTavilyMask }">
                {{ savedTavilyMask || '未配置' }}
              </span>
            </p>
          </div>
          <div class="field-control">
            <input
              v-model="tavilyKey"
              type="password"
              class="input"
              placeholder="tvly-…"
              autocomplete="off"
              @keydown.enter="saveTavilyKey"
            />
            <button
              type="button"
              class="btn-save"
              :disabled="savingTavily || !tavilyKey.trim()"
              @click="saveTavilyKey"
            >
              {{ savingTavily ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Voice -->
      <section v-show="section === 'voice'" class="pane-block">
        <header class="pane-head">
          <h2 class="pane-title">语音</h2>
          <p class="pane-sub">
            选厂家、填密钥即可。Fairy 声线由内置参考音自动绑定，无需选音色或上传音频。
          </p>
        </header>

        <div class="field row">
          <div class="field-copy">
            <div class="field-label">语音自动播放</div>
            <p class="field-desc">Fairy 回复后自动合成并播放语音。</p>
          </div>
          <label class="toggle">
            <input v-model="voiceEnabled" type="checkbox" @change="onVoiceEnabledChange" />
            <span class="toggle-track" />
          </label>
        </div>

        <div class="field row">
          <div class="field-copy">
            <div class="field-label">桌面 Fairy</div>
            <p class="field-desc">
              启动后显示无背景圆环。右键可固定/隐藏；隐藏会同步关掉本开关。
            </p>
          </div>
          <label class="toggle">
            <input
              v-model="desktopPetEnabled"
              type="checkbox"
              @change="onDesktopPetChange"
            />
            <span class="toggle-track" />
          </label>
        </div>

        <div v-if="desktopPetEnabled" class="field row">
          <div class="field-copy">
            <div class="field-label">固定桌面 Fairy</div>
            <p class="field-desc">固定后不可拖拽缩放；桌面右键只能固定，取消固定请在此关闭。</p>
          </div>
          <label class="toggle">
            <input
              v-model="desktopPetPinned"
              type="checkbox"
              @change="onDesktopPetPinnedChange"
            />
            <span class="toggle-track" />
          </label>
        </div>

        <div v-if="voiceEnabled" class="field row">
          <div class="field-copy">
            <div class="field-label">同时保存语音文件</div>
            <p class="field-desc">
              额外存到「文档 / ZeroFairyClient / 语音」；本轮改为整段合成（起播稍慢，文件完整）。
            </p>
          </div>
          <label class="toggle">
            <input
              v-model="voiceSaveToFile"
              type="checkbox"
              @change="onVoiceSaveToFileChange"
            />
            <span class="toggle-track" />
          </label>
        </div>

        <div class="field">
          <div class="field-copy">
            <div class="field-label">语音厂家</div>
            <p class="field-desc">选一家即可；云端保存密钥后会自动准备 Fairy 声线。</p>
          </div>
          <div class="provider-list" role="listbox" aria-label="语音厂家">
            <button
              v-for="p in ttsProviders"
              :key="p.id"
              type="button"
              class="provider-option"
              role="option"
              :aria-selected="activeTtsProvider === p.id"
              :class="{ active: activeTtsProvider === p.id }"
              :disabled="switchingTts"
              @click="selectTtsProvider(p.id)"
            >
              <span class="provider-main">
                <span class="provider-name">{{ p.displayName }}</span>
                <span class="provider-tag" :class="p.kind">
                  {{ p.kind === 'local' ? '本地' : '云端' }}
                </span>
              </span>
              <span class="provider-hint">{{ p.hint }}</span>
            </button>
          </div>
        </div>

        <div class="field">
          <div class="field-copy">
            <div class="field-label">Fairy 声线</div>
            <p class="field-desc">
              状态：
              <span
                class="status"
                :class="{
                  ok: fairyStatus.status === 'ready',
                  warn: fairyStatus.status === 'pending',
                  bad: fairyStatus.status === 'failed'
                }"
              >
                {{ fairyStatusLabel }}
              </span>
            </p>
          </div>
          <div
            v-if="activeTtsProvider !== 'gpt-sovits'"
            class="field-control"
          >
            <button
              type="button"
              class="btn-save"
              :disabled="ensuringVoice"
              @click="retryEnsureVoice"
            >
              {{
                ensuringVoice
                  ? '重克隆中…'
                  : fairyStatus.status === 'failed'
                    ? '重试准备'
                    : '重新克隆声线'
              }}
            </button>
          </div>
        </div>

        <template v-if="activeTtsProvider === 'minimax'">
          <div class="field">
            <div class="field-copy">
              <div class="field-label">MiniMax API Key</div>
              <p class="field-desc">
                状态：
                <span class="status" :class="{ ok: !!savedMinimaxMask }">
                  {{ savedMinimaxMask || '未配置' }}
                </span>
              </p>
            </div>
            <div class="field-control">
              <input
                v-model="minimaxKey"
                type="password"
                class="input"
                placeholder="MiniMax API Key"
                autocomplete="off"
                @keydown.enter="saveMinimaxKey"
              />
              <button
                type="button"
                class="btn-save"
                :disabled="savingMinimax || !minimaxKey.trim()"
                @click="saveMinimaxKey"
              >
                {{ savingMinimax ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
        </template>

        <template v-if="activeTtsProvider === 'seed-icl-2.0'">
          <div class="field">
            <div class="field-copy">
              <div class="field-label">火山 API Key（新版控制台，推荐）</div>
              <p class="field-desc">
                状态：
                <span class="status" :class="{ ok: !!savedVolcApiMask }">
                  {{ savedVolcApiMask || '未配置' }}
                </span>
              </p>
            </div>
            <div class="field-control">
              <input
                v-model="volcApiKey"
                type="password"
                class="input"
                placeholder="X-Api-Key"
                autocomplete="off"
                @keydown.enter="saveVolcApiKey"
              />
              <button
                type="button"
                class="btn-save"
                :disabled="savingVolcApi || !volcApiKey.trim()"
                @click="saveVolcApiKey"
              >
                {{ savingVolcApi ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>

          <div class="field">
            <div class="field-copy">
              <div class="field-label">或使用 AppId + Access Token（旧版）</div>
              <p class="field-desc">
                AppId：
                <span class="status" :class="{ ok: !!savedVolcAppMask }">
                  {{ savedVolcAppMask || '未配置' }}
                </span>
                · Token：
                <span class="status" :class="{ ok: !!savedVolcTokenMask }">
                  {{ savedVolcTokenMask || '未配置' }}
                </span>
              </p>
            </div>
            <div class="field-stack">
              <input
                v-model="volcAppId"
                type="password"
                class="input"
                placeholder="AppId"
                autocomplete="off"
              />
              <input
                v-model="volcAccessToken"
                type="password"
                class="input"
                placeholder="Access Token"
                autocomplete="off"
                @keydown.enter="saveVolcPair"
              />
              <button
                type="button"
                class="btn-save"
                :disabled="
                  savingVolcPair || !volcAppId.trim() || !volcAccessToken.trim()
                "
                @click="saveVolcPair"
              >
                {{ savingVolcPair ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings {
  height: 100%;
  display: flex;
  background: var(--agent-bg);
  color: var(--agent-text);
}

.rail {
  width: 200px;
  flex-shrink: 0;
  padding: 28px 14px 20px;
  border-right: 0.5px solid var(--agent-border-strong);
  background: var(--agent-sidebar);
}

.rail-title {
  margin: 0 10px 18px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.rail-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rail-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--agent-text-mid);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rail-item:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.rail-item.active {
  background: var(--agent-sidebar-active);
  color: var(--agent-text);
}

.rail-label {
  font-size: 13px;
  font-weight: 500;
}

.rail-hint {
  font-size: 11px;
  color: var(--agent-text-dim);
}

.pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 36px 40px;
}

.pane-block {
  width: min(640px, 100%);
}

.pane-head {
  margin-bottom: 8px;
  padding-bottom: 16px;
  border-bottom: 0.5px solid var(--agent-border-strong);
}

.pane-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
}

.pane-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--agent-text-dim);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 0;
  border-bottom: 0.5px solid var(--agent-border);
}

.field.row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.field-copy {
  min-width: 0;
  flex: 1;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.field-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--agent-text-dim);
}

.status {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color: var(--agent-text-mid);
}

.status.ok {
  color: var(--agent-accent);
}

.status.warn {
  color: #d4a017;
}

.status.bad {
  color: #e07070;
}

.field-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 10px;
  background: var(--agent-surface-2);
  color: var(--agent-text-mid);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.provider-option:hover:not(:disabled) {
  border-color: var(--agent-border-strong);
  background: var(--agent-surface-3);
  color: var(--agent-text);
}

.provider-option.active {
  border-color: var(--agent-accent);
  background: color-mix(in srgb, var(--agent-accent) 12%, var(--agent-surface-2));
  color: var(--agent-text);
}

.provider-option:disabled {
  opacity: 0.55;
  cursor: default;
}

.provider-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-name {
  font-size: 13px;
  font-weight: 500;
}

.provider-tag {
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  border: 0.5px solid var(--agent-border-strong);
  color: var(--agent-text-dim);
}

.provider-tag.local {
  border-color: color-mix(in srgb, var(--agent-accent) 45%, transparent);
  color: var(--agent-accent);
}

.provider-tag.cloud {
  color: var(--agent-text-mid);
}

.provider-hint {
  font-size: 12px;
  line-height: 1.4;
  color: var(--agent-text-dim);
}

.input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 8px;
  background: var(--agent-surface-2);
  color: var(--agent-text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.input:focus {
  border-color: var(--agent-accent);
}

.input::placeholder {
  color: var(--agent-text-dim);
}

.btn-save {
  appearance: none;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: var(--agent-send);
  color: var(--agent-send-fg);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.btn-save:hover:not(:disabled) {
  filter: brightness(0.94);
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: default;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: var(--agent-surface-3);
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.toggle-track::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  border-radius: 50%;
  background: var(--agent-text-mid);
  transition: transform 0.15s ease, background 0.15s ease;
}

.toggle input:checked + .toggle-track {
  background: var(--agent-accent);
  border-color: transparent;
}

.toggle input:checked + .toggle-track::before {
  transform: translateX(18px);
  background: #fff;
}
</style>
