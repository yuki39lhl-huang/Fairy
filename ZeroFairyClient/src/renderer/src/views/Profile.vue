<!-- 个人设置：名字/头像 + 主人哲铃/自定义 + 助手二号 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type CharacterRole = 'zhe' | 'ling' | 'custom'

interface UserProfile {
  displayName: string
  avatarDataUrl: string
  masterRole: CharacterRole
  masterCustomName: string
  assistant2Role: CharacterRole
  assistant2CustomName: string
}

const profile = ref<UserProfile>({
  displayName: '主人',
  avatarDataUrl: '',
  masterRole: 'zhe',
  masterCustomName: '',
  assistant2Role: 'ling',
  assistant2CustomName: ''
})
const saving = ref(false)
const savedHint = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showAssistant2Picker = computed(() => profile.value.masterRole === 'custom')

const masterOptions: { id: CharacterRole; label: string; hint: string }[] = [
  { id: 'zhe', label: '哲', hint: '哥哥 · 助手二号自动为铃' },
  { id: 'ling', label: '铃', hint: '妹妹 · 助手二号自动为哲' },
  { id: 'custom', label: '自定义', hint: '自定主人身份，并另选助手二号' }
]

const assistant2Options: { id: CharacterRole; label: string; hint: string }[] = [
  { id: 'zhe', label: '哲', hint: '作为助手二号' },
  { id: 'ling', label: '铃', hint: '作为助手二号' },
  { id: 'custom', label: '自定义', hint: '自定助手二号称呼' }
]

const avatarLetter = computed(() => {
  const name = profile.value.displayName.trim() || '主'
  return [...name][0] || '主'
})

onMounted(async () => {
  profile.value = await window.api.getUserProfile()
})

function onMasterRoleChange(role: CharacterRole): void {
  profile.value.masterRole = role
  if (role === 'zhe') profile.value.assistant2Role = 'ling'
  else if (role === 'ling') profile.value.assistant2Role = 'zhe'
}

function pickAvatar(): void {
  fileInput.value?.click()
}

async function onAvatarFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    savedHint.value = '请选择图片文件'
    return
  }
  const dataUrl = await readImageAsDataUrl(file, 128)
  profile.value.avatarDataUrl = dataUrl
}

function clearAvatar(): void {
  profile.value.avatarDataUrl = ''
}

function readImageAsDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法压缩头像'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('图片损坏'))
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

async function saveProfile(): Promise<void> {
  saving.value = true
  savedHint.value = ''
  try {
    if (profile.value.masterRole === 'custom' && !profile.value.masterCustomName.trim()) {
      savedHint.value = '请填写自定义主人名称'
      return
    }
    if (
      profile.value.masterRole === 'custom' &&
      profile.value.assistant2Role === 'custom' &&
      !profile.value.assistant2CustomName.trim()
    ) {
      savedHint.value = '请填写自定义助手二号名称'
      return
    }
    profile.value = await window.api.setUserProfile({ ...profile.value })
    savedHint.value = '已保存'
  } catch (err) {
    savedHint.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="profile">
    <header class="head">
      <h1 class="title">个人设置</h1>
      <p class="sub">
        名字与头像保存在本机（侧栏展示）。主人选哲/铃时，Fairy 只认角色身份；本地显示名仅在「自定义」时用于对话称呼。
      </p>
    </header>

    <section class="block">
      <h2 class="block-title">我的资料</h2>
      <div class="avatar-row">
        <button type="button" class="avatar-btn" title="更换头像" @click="pickAvatar">
          <img
            v-if="profile.avatarDataUrl"
            class="avatar-img"
            :src="profile.avatarDataUrl"
            alt=""
          />
          <span v-else class="avatar-letter">{{ avatarLetter }}</span>
        </button>
        <div class="avatar-actions">
          <button type="button" class="btn-ghost" @click="pickAvatar">选择头像</button>
          <button
            v-if="profile.avatarDataUrl"
            type="button"
            class="btn-ghost"
            @click="clearAvatar"
          >
            清除
          </button>
          <p class="hint">本地图片，自动压缩到约 128px</p>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onAvatarFile"
        />
      </div>

      <label class="field">
        <span class="label">显示名称</span>
        <input
          v-model="profile.displayName"
          class="input"
          maxlength="24"
          placeholder="例如：主人"
        />
        <p class="hint">仅侧栏头像旁展示，不会作为对话里的「我是谁」身份。</p>
      </label>
    </section>

    <section class="block">
      <h2 class="block-title">主人是谁</h2>
      <p class="block-desc">哲与铃互为法厄同兄妹；选其一后，另一位自动成为助手二号。</p>
      <div class="option-list">
        <button
          v-for="opt in masterOptions"
          :key="opt.id"
          type="button"
          class="option"
          :class="{ active: profile.masterRole === opt.id }"
          @click="onMasterRoleChange(opt.id)"
        >
          <span class="option-name">{{ opt.label }}</span>
          <span class="option-hint">{{ opt.hint }}</span>
        </button>
      </div>
      <label v-if="profile.masterRole === 'custom'" class="field">
        <span class="label">自定义主人名称</span>
        <input
          v-model="profile.masterCustomName"
          class="input"
          maxlength="24"
          placeholder="例如：自己 / 柚子"
        />
      </label>
    </section>

    <section v-if="showAssistant2Picker" class="block">
      <h2 class="block-title">助手二号</h2>
      <p class="block-desc">主人选了自定义后，再指定助手二号是哲、铃，或也自定义。</p>
      <div class="option-list">
        <button
          v-for="opt in assistant2Options"
          :key="opt.id"
          type="button"
          class="option"
          :class="{ active: profile.assistant2Role === opt.id }"
          @click="profile.assistant2Role = opt.id"
        >
          <span class="option-name">{{ opt.label }}</span>
          <span class="option-hint">{{ opt.hint }}</span>
        </button>
      </div>
      <label v-if="profile.assistant2Role === 'custom'" class="field">
        <span class="label">自定义助手二号名称</span>
        <input
          v-model="profile.assistant2CustomName"
          class="input"
          maxlength="24"
          placeholder="例如：搭档"
        />
      </label>
    </section>

    <section v-else class="block muted">
      <h2 class="block-title">助手二号</h2>
      <p class="block-desc">
        当前自动为：
        <strong>{{ profile.masterRole === 'zhe' ? '铃' : '哲' }}</strong>
        （随主人哲/铃互斥切换）
      </p>
    </section>

    <div class="footer">
      <span class="status">{{ savedHint }}</span>
      <button type="button" class="btn-save" :disabled="saving" @click="saveProfile">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.profile {
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px 40px;
  background: var(--agent-bg);
  color: var(--agent-text);
}

.head {
  width: min(640px, 100%);
  margin-bottom: 8px;
  padding-bottom: 16px;
  border-bottom: 0.5px solid var(--agent-border-strong);
}

.title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
}

.sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--agent-text-dim);
}

.block {
  width: min(640px, 100%);
  padding: 18px 0;
  border-bottom: 0.5px solid var(--agent-border);
}

.block.muted .block-desc {
  margin-top: 4px;
}

.block-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.block-desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--agent-text-dim);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.avatar-btn {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 50%;
  overflow: hidden;
  background: var(--agent-surface-2);
  cursor: pointer;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-letter {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 22px;
  font-weight: 600;
  color: var(--agent-text-mid);
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.hint {
  margin: 0;
  width: 100%;
  font-size: 11px;
  color: var(--agent-text-dim);
}

.hidden {
  display: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.label {
  font-size: 12px;
  color: var(--agent-text-dim);
}

.input {
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

.option-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 11px 14px;
  border: 0.5px solid var(--agent-border-strong);
  border-radius: 10px;
  background: var(--agent-surface-2);
  color: var(--agent-text-mid);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.option:hover {
  background: var(--agent-surface-3);
  color: var(--agent-text);
}

.option.active {
  border-color: var(--agent-accent);
  background: color-mix(in srgb, var(--agent-accent) 12%, var(--agent-surface-2));
  color: var(--agent-text);
}

.option-name {
  font-size: 13px;
  font-weight: 500;
}

.option-hint {
  font-size: 11px;
  color: var(--agent-text-dim);
}

.footer {
  width: min(640px, 100%);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 18px;
}

.status {
  font-size: 12px;
  color: var(--agent-text-dim);
}

.btn-ghost,
.btn-save {
  appearance: none;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-ghost {
  border: 0.5px solid var(--agent-border-strong);
  background: transparent;
  color: var(--agent-text-mid);
}

.btn-ghost:hover {
  background: var(--agent-sidebar-hover);
  color: var(--agent-text);
}

.btn-save {
  border: none;
  background: var(--agent-send);
  color: var(--agent-send-fg);
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
