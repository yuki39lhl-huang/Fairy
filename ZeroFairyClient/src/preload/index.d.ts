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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
