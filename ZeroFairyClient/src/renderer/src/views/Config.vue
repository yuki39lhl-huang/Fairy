<!-- Settings: harness-style section rail + preference rows. -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

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

const sections: { id: SectionId; label: string; hint: string }[] = [
  { id: 'models', label: '模型', hint: 'DeepSeek API' },
  { id: 'search', label: '搜索', hint: 'Tavily 联网' },
  { id: 'voice', label: '语音', hint: '播放与存档' }
]

onMounted(async () => {
  savedMask.value = await window.api.getApiKey('deepseek')
  savedTavilyMask.value = await window.api.getApiKey('tavily')
  voiceEnabled.value = await window.api.getVoiceEnabled()
  voiceSaveToFile.value = await window.api.getVoiceSaveToFile()
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
          <p class="pane-sub">控制回复后的语音合成与本地存档。</p>
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

.field-control {
  display: flex;
  gap: 8px;
  align-items: center;
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
