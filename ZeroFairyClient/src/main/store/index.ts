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
    userProfile: DEFAULT_USER_PROFILE
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
  }
}
