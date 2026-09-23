import { ElectronAPI } from '@electron-toolkit/preload'

interface MicAudioStats {
  durationSec: number
  wavBytes: number
  sampleRate: number
  channels: number
  peak: number
  rms: number
  rawBytes: number
  mimeType: string
}

interface TranscribeRecordingOptions {
  debugSave?: boolean
  stats?: MicAudioStats
}

interface TranscribeResult {
  success: boolean
  text: string
  error?: string
  stats?: MicAudioStats
  debugPath?: string
}

interface Api {
  sendMessage: (text: string, history: { role: string; content: string }[]) => Promise<string>
  onAgUiEvent: (callback: (event: { type: string; payload: unknown }) => void) => void
  saveApiKey: (provider: string, key: string) => Promise<void>
  getApiKey: (provider: string) => Promise<string>
  getVoiceEnabled: () => Promise<boolean>
  setVoiceEnabled: (enabled: boolean) => Promise<void>
  getVoiceSaveToFile: () => Promise<boolean>
  setVoiceSaveToFile: (enabled: boolean) => Promise<void>
  listTtsProviders: () => Promise<
    Array<{ id: string; displayName: string; hint: string; kind: 'local' | 'cloud' }>
  >
  getActiveTtsProvider: () => Promise<string>
  setActiveTtsProvider: (id: string) => Promise<string>
  getFairyVoiceStatus: (providerId?: string) => Promise<{
    profileId: string
    displayName: string
    providerId: string
    status: 'ready' | 'pending' | 'failed' | 'missing'
    voiceId?: string
    lastError?: string
  }>
  ensureFairyVoice: (
    providerId?: string,
    force?: boolean
  ) => Promise<{
    profileId: string
    displayName: string
    providerId: string
    status: 'ready' | 'pending' | 'failed' | 'missing'
    voiceId?: string
    lastError?: string
  }>
  minimizeVoiceCallWindow: () => Promise<void>
  toggleMaximizeVoiceCallWindow: () => Promise<boolean>
  isVoiceCallWindowMaximized: () => Promise<boolean>
  onVoiceCallWindowState: (callback: (state: { maximized: boolean }) => void) => () => void
  onFairyFloatShow: (callback: (payload: { text?: string }) => void) => () => void
  onFairyFloatHide: (callback: () => void) => () => void
  onFairyFloatAudio: (callback: (payload: { audioData: Uint8Array }) => void) => () => void
  notifyFairyFloatReady: () => Promise<void>
  notifyFairyFloatSpeechEnded: () => Promise<void>
  transcribeSpeech: (audioPath: string) => Promise<TranscribeResult>
  openVoiceCallWindow: () => Promise<void>
  transcribeRecording: (
    audioData: Uint8Array,
    options?: TranscribeRecordingOptions
  ) => Promise<TranscribeResult>
  listReminders: () => Promise<
    Array<{
      id: string
      message: string
      createdAt: number
      fireAt: number
      status: 'pending' | 'fired' | 'cancelled'
      source?: 'manual' | 'fairy'
    }>
  >
  cancelReminder: (id: string) => Promise<boolean>
  clearFinishedReminders: () => Promise<number>
  createReminder: (payload: {
    message: string
    delaySeconds: number
  }) => Promise<{
    id: string
    message: string
    createdAt: number
    fireAt: number
    status: 'pending' | 'fired' | 'cancelled'
    source?: 'manual' | 'fairy'
  }>
  getUserProfile: () => Promise<{
    displayName: string
    avatarDataUrl: string
    masterRole: 'zhe' | 'ling' | 'custom'
    masterCustomName: string
    assistant2Role: 'zhe' | 'ling' | 'custom'
    assistant2CustomName: string
  }>
  setUserProfile: (
    profile: Partial<{
      displayName: string
      avatarDataUrl: string
      masterRole: 'zhe' | 'ling' | 'custom'
      masterCustomName: string
      assistant2Role: 'zhe' | 'ling' | 'custom'
      assistant2CustomName: string
    }>
  ) => Promise<{
    displayName: string
    avatarDataUrl: string
    masterRole: 'zhe' | 'ling' | 'custom'
    masterCustomName: string
    assistant2Role: 'zhe' | 'ling' | 'custom'
    assistant2CustomName: string
  }>
  onUserProfileChanged: (
    callback: (profile: {
      displayName: string
      avatarDataUrl: string
      masterRole: 'zhe' | 'ling' | 'custom'
      masterCustomName: string
      assistant2Role: 'zhe' | 'ling' | 'custom'
      assistant2CustomName: string
    }) => void
  ) => () => void
  getFairyPetState: () => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  setFairyPetEnabled: (enabled: boolean) => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  showFairyPet: () => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  hideFairyPet: () => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  setFairyPetPinned: (pinned: boolean) => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  setFairyPetBounds: (bounds: {
    x?: number
    y?: number
    width?: number
    height?: number
  }) => Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  openFairyPetSettings: () => Promise<void>
  onFairyPetState: (
    callback: (state: {
      enabled: boolean
      visible: boolean
      pinned: boolean
      bounds: { x: number; y: number; width: number; height: number } | null
    }) => void
  ) => () => void
  onNavigate: (callback: (path: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
