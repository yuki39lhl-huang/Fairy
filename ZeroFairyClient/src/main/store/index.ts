// src/main/store/index.ts
// 职责：加密存储 API Key、全局配置等敏感数据

const ElectronStore = require('electron-store').default
import { createHash } from 'crypto'
import type { ProviderVoiceBinding } from '../voice/voiceProfile/types'
import {
  DEFAULT_USER_PROFILE,
  normalizeUserProfile,
  type UserProfile
} from '../userProfile/types'
import type { BgmPlayMode, BgmSettings } from '../bgmSystem'

export const DEFAULT_BGM_SETTINGS: BgmSettings = {
  enabled: false,
  playMode: 'loop-all',
  bgmVolume: 0.35,
  fairyVoiceVolume: 1,
  lastTrackId: null,
  trackOrder: []
}

interface StoreSchema {
  apiKeys: {
    deepseek?: string
    openai?: string
    anthropic?: string
    tavily?: string
    minimax?: string
    /** 火山新版控制台 API Key（可选，优先于 AppId+Token） */
    volcengine?: string
    volcengineAppId?: string
    volcengineAccessToken?: string
  }
  activeProvider: string
  activeModel: string
  voiceEnabled: boolean
  voiceSaveToFile: boolean
  /** 当前 TTS 厂家：gpt-sovits / minimax / seed-icl-2.0 */
  activeTtsProvider: string
  /** Fairy 在各厂家下的声线绑定 */
  fairyVoiceBindings: Record<string, ProviderVoiceBinding>
  /** 桌面宠物 Fairy */
  desktopPetEnabled: boolean
  desktopPetPinned: boolean
  desktopPetBounds: { x: number; y: number; width: number; height: number } | null
  userProfile: UserProfile
  bgmSettings: BgmSettings
  /** 旧字段：只存过一个项目目录 */
  codeProjectDir: string
  /** Code 模式已添加的项目目录 */
  codeProjectDirs: string[]
}

const encryptionKey = createHash('sha256')
  .update('ZeroFairyClient-secret-salt')
  .digest('hex')
  .substring(0, 32)

const store = new ElectronStore({
  name: 'fairy-config',
  encryptionKey,
  defaults: {
    apiKeys: {},
    activeProvider: 'deepseek',
    activeModel: 'deepseek-v4-flash',
    voiceEnabled: true,
    voiceSaveToFile: false,
    activeTtsProvider: 'gpt-sovits',
    fairyVoiceBindings: {},
    desktopPetEnabled: true,
    desktopPetPinned: false,
    desktopPetBounds: null,
    userProfile: DEFAULT_USER_PROFILE,
    bgmSettings: DEFAULT_BGM_SETTINGS,
    codeProjectDir: '',
    codeProjectDirs: []
  }
}) as unknown as import('electron-store').default<StoreSchema>

export const storeManager = {
  setApiKey(provider: string, key: string): void {
    const apiKeys = store.get('apiKeys')
    store.set('apiKeys', { ...apiKeys, [provider]: key })
  },

  getApiKey(provider: string): string | undefined {
    return store.get('apiKeys')[provider as keyof StoreSchema['apiKeys']]
  },

  setActiveProvider(provide: string, model: string): void {
    store.set('activeProvider', provide)
    store.set('activeModel', model)
  },

  getActiveConfig(): { provider: string; model: string } {
    return {
      provider: store.get('activeProvider'),
      model: store.get('activeModel')
    }
  },

  setVoiceEnabled(enabled: boolean): void {
    store.set('voiceEnabled', enabled)
  },
  getVoiceEnabled(): boolean {
    return store.get('voiceEnabled')
  },

  setVoiceSaveToFile(enabled: boolean): void {
    store.set('voiceSaveToFile', enabled)
  },
  getVoiceSaveToFile(): boolean {
    return store.get('voiceSaveToFile')
  },

  setActiveTtsProvider(id: string): void {
    store.set('activeTtsProvider', id)
  },
  getActiveTtsProvider(): string {
    return store.get('activeTtsProvider') || 'gpt-sovits'
  },

  getFairyVoiceBinding(providerId: string): ProviderVoiceBinding | undefined {
    return store.get('fairyVoiceBindings')?.[providerId]
  },

  setFairyVoiceBinding(providerId: string, binding: ProviderVoiceBinding): void {
    const all = { ...(store.get('fairyVoiceBindings') ?? {}) }
    all[providerId] = binding
    store.set('fairyVoiceBindings', all)
  },

  getAllFairyVoiceBindings(): Record<string, ProviderVoiceBinding> {
    return { ...(store.get('fairyVoiceBindings') ?? {}) }
  },

  getDesktopPetEnabled(): boolean {
    return store.get('desktopPetEnabled') !== false
  },
  setDesktopPetEnabled(enabled: boolean): void {
    store.set('desktopPetEnabled', enabled)
  },
  getDesktopPetPinned(): boolean {
    return Boolean(store.get('desktopPetPinned'))
  },
  setDesktopPetPinned(pinned: boolean): void {
    store.set('desktopPetPinned', pinned)
  },
  getDesktopPetBounds(): { x: number; y: number; width: number; height: number } | null {
    return store.get('desktopPetBounds') ?? null
  },
  setDesktopPetBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    store.set('desktopPetBounds', bounds)
  },

  getUserProfile(): UserProfile {
    return normalizeUserProfile(store.get('userProfile'))
  },
  setUserProfile(profile: Partial<UserProfile>): UserProfile {
    const next = normalizeUserProfile({ ...storeManager.getUserProfile(), ...profile })
    store.set('userProfile', next)
    return next
  },

  getBgmSettings(): BgmSettings {
    const raw = store.get('bgmSettings') ?? DEFAULT_BGM_SETTINGS
    const playMode: BgmPlayMode =
      raw.playMode === 'loop-one' || raw.playMode === 'loop-all' || raw.playMode === 'shuffle'
        ? raw.playMode
        : 'loop-all'
    return {
      enabled: Boolean(raw.enabled),
      playMode,
      bgmVolume: clamp01(raw.bgmVolume ?? DEFAULT_BGM_SETTINGS.bgmVolume),
      fairyVoiceVolume: clamp01(raw.fairyVoiceVolume ?? DEFAULT_BGM_SETTINGS.fairyVoiceVolume),
      lastTrackId: typeof raw.lastTrackId === 'string' ? raw.lastTrackId : null,
      trackOrder: sanitizeTrackOrder(raw.trackOrder)
    }
  },
  setBgmSettings(partial: Partial<BgmSettings>): BgmSettings {
    const next = { ...storeManager.getBgmSettings(), ...partial }
    next.bgmVolume = clamp01(next.bgmVolume)
    next.fairyVoiceVolume = clamp01(next.fairyVoiceVolume)
    if (next.playMode !== 'loop-one' && next.playMode !== 'loop-all' && next.playMode !== 'shuffle') {
      next.playMode = 'loop-all'
    }
    next.lastTrackId = typeof next.lastTrackId === 'string' ? next.lastTrackId : null
    next.trackOrder = sanitizeTrackOrder(next.trackOrder)
    store.set('bgmSettings', next)
    return next
  },

  getCodeProjectDir(): string {
    return this.listCodeProjectDirs()[0] || ''
  },
  setCodeProjectDir(dir: string): string {
    const next = dir.trim()
    if (!next) {
      store.set('codeProjectDirs', [])
      store.set('codeProjectDir', '')
      return ''
    }
    this.addCodeProjectDir(next)
    return next
  },
  listCodeProjectDirs(): string[] {
    const saved = store.get('codeProjectDirs')
    const dirs = Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
    if (dirs.length) return dirs
    const legacy = store.get('codeProjectDir')
    if (typeof legacy === 'string' && legacy.trim()) {
      const migrated = [legacy.trim()]
      store.set('codeProjectDirs', migrated)
      return migrated
    }
    return []
  },
  addCodeProjectDir(dir: string): string {
    const next = dir.trim()
    if (!next) return ''
    const dirs = this.listCodeProjectDirs()
    if (dirs.some((item) => sameDir(item, next))) return dirs.find((item) => sameDir(item, next)) || next
    const updated = [...dirs, next]
    store.set('codeProjectDirs', updated)
    store.set('codeProjectDir', updated[0] || '')
    return next
  },
  removeCodeProjectDir(dir: string): string[] {
    const updated = this.listCodeProjectDirs().filter((item) => !sameDir(item, dir))
    store.set('codeProjectDirs', updated)
    store.set('codeProjectDir', updated[0] || '')
    return updated
  }
}

function sameDir(left: string, right: string): boolean {
  const norm = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return Boolean(left) && Boolean(right) && norm(left) === norm(right)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function sanitizeTrackOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const order: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue
    seen.add(item)
    order.push(item)
  }
  return order
}
