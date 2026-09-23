<!-- src/renderer/src/views/Config.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const apiKey = ref('')
const savedMask = ref('')  // 显示脱敏后的key
const saving = ref(false)
// Tavily 搜索配置
const tavilyKey = ref('')
const savedTavilyMask = ref('')
const savingTavily = ref(false)
//语音开关
const voiceEnabled = ref(true)
const voiceSaveToFile = ref(false)

onMounted(async () => {
  savedMask.value = await window.api.getApiKey('deepseek')
  savedTavilyMask.value = await window.api.getApiKey('tavily')  // 新增
})

async function saveKey(): Promise<void> {
  if (!apiKey.value.trim()) return
  saving.value = true
  await window.api.saveApiKey('deepseek', apiKey.value.trim())
  savedMask.value = await window.api.getApiKey('deepseek')
  apiKey.value = ''
  saving.value = false
}

async function saveTavilyKey(): Promise<void> {
  if (!tavilyKey.value.trim()) return
  savingTavily.value = true
  await window.api.saveApiKey('tavily', tavilyKey.value.trim())
  savedTavilyMask.value = await window.api.getApiKey('tavily')
  tavilyKey.value = ''
  savingTavily.value = false
}

onMounted(async () => {
  savedMask.value = await window.api.getApiKey('deepseek')
  savedTavilyMask.value = await window.api.getApiKey('tavily')
  voiceEnabled.value = await window.api.getVoiceEnabled()
  voiceSaveToFile.value = await window.api.getVoiceSaveToFile()
})

async function onVoiceEnabledChange(): Promise<void> {
  await window.api.setVoiceEnabled(voiceEnabled.value)
}

async function onVoiceSaveToFileChange(): Promise<void> {
  await window.api.setVoiceSaveToFile(voiceSaveToFile.value)
}


</script>

<template>
  <div class="config-page">
    <div class="config-card">
      <button class="back-btn" @click="router.push('/chat')">← 返回</button>
      <h2 class="config-title">⚙ 配置</h2>

      <div class="config-section">
        <label class="config-label">DeepSeek API Key</label>
        <p class="config-desc">
          当前已保存：<span class="key-mask">{{ savedMask || '未配置' }}</span>
        </p>
        <div class="key-input-row">
          <input v-model="apiKey" type="password" class="key-input" placeholder="sk-..." />
          <button class="save-btn" :disabled="saving || !apiKey.trim()" @click="saveKey">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="config-section" style="margin-top: 24px">
        <label class="config-label">Tavily 搜索 API Key（联网搜索功能）</label>
        <p class="config-desc">
          当前已保存：<span class="key-mask">{{ savedTavilyMask || '未配置' }}</span>
        </p>
        <div class="key-input-row">
          <input v-model="tavilyKey" type="password" class="key-input" placeholder="tvly-..." />
          <button class="save-btn" :disabled="savingTavily || !tavilyKey.trim()" @click="saveTavilyKey">
            {{ savingTavily ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="config-section" style="margin-top: 24px">
        <label class="config-label">语音自动播放</label>
        <p class="config-desc">Fairy回复后自动合成语音并播放</p>
        <label class="toggle-switch">
          <input v-model="voiceEnabled" type="checkbox" @change="onVoiceEnabledChange" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div v-if="voiceEnabled" class="config-section" style="margin-top: 24px">
        <label class="config-label">同时保存语音文件到本地</label>
        <p class="config-desc">开启后，每次生成的语音会额外存一份到"文档/ZeroFairyClient/语音"文件夹，且这轮会自动切换为整段合成（牺牲一点起播速度，换一份完整可用的音频文件）</p>
        <label class="toggle-switch">
          <input v-model="voiceSaveToFile" type="checkbox" @change="onVoiceSaveToFileChange" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-page {
  min-height: 100vh;
  background: #0a0e1a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.config-card {
  width: 100%;
  max-width: 480px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 16px;
  padding: 32px;
  backdrop-filter: blur(12px);
}

.back-btn {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  margin-bottom: 20px;
}

.back-btn:hover {
  color: #7dd3fc;
}

.config-title {
  color: #7dd3fc;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 28px;
  letter-spacing: 1px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
}

.config-desc {
  color: #475569;
  font-size: 12px;
}

.key-mask {
  color: #38bdf8;
  font-family: monospace;
}

.key-input-row {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.key-input {
  flex: 1;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
}

.key-input:focus {
  border-color: rgba(56, 189, 248, 0.5);
}

.save-btn {
  padding: 8px 18px;
  background: linear-gradient(135deg, #0369a1, #0284c7);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 8px;
  color: #e0f2fe;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  margin-top: 4px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 24px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: #64748b;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked+.toggle-slider {
  background: linear-gradient(135deg, #0369a1, #0284c7);
  border-color: rgba(56, 189, 248, 0.4);
}

.toggle-switch input:checked+.toggle-slider::before {
  transform: translateX(20px);
  background: #e0f2fe;
}
</style>