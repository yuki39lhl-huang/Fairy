import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  sendMessage: (
    text: string,
    history: { role: string; content: string }[],
    sessionId?: string
  ): Promise<string> => ipcRenderer.invoke('send-message', text, history, sessionId),

  listChatSessions: (
    lane: 'chat' | 'code' = 'chat'
  ): Promise<
    Array<{ session: string; title: string; updatedAt: number; pinned: boolean; projectDir: string }>
  > => ipcRenderer.invoke('chat:list-sessions', lane),

  bindChatProject: (sessionId: string, projectDir: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:bind-project', sessionId, projectDir),

  setChatPinned: (sessionId: string, pinned: boolean): Promise<boolean> =>
    ipcRenderer.invoke('chat:set-pinned', sessionId, pinned),

  renameChatSession: (sessionId: string, title: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:rename-session', sessionId, title),

  deleteChatSession: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:delete-session', sessionId),

  getChatMessages: (
    sessionId: string
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> =>
    ipcRenderer.invoke('chat:get-messages', sessionId),

  getCodeProjectDir: (): Promise<string> => ipcRenderer.invoke('code:get-project-dir'),
  listCodeProjectDirs: (): Promise<string[]> => ipcRenderer.invoke('code:list-project-dirs'),
  pickCodeProjectDir: (): Promise<string | null> => ipcRenderer.invoke('code:pick-project-dir'),
  clearCodeProjectDir: (): Promise<string> => ipcRenderer.invoke('code:clear-project-dir'),
  removeCodeProjectDir: (dir: string): Promise<string[]> =>
    ipcRenderer.invoke('code:remove-project-dir', dir),

  // 订阅 AG-UI 事件流（渲染进程用这个监听主进程推送的所有事件）
  onAgUiEvent: (callback: (event: { type: string; payload: unknown }) => void): void => {
    ipcRenderer.on('ag-ui-event', (_ipcEvent, agEvent) => callback(agEvent))
  },

  // 新增: 保存 API Key
  saveApiKey: (provider: string, key: string): Promise<void> =>
    ipcRenderer.invoke('save-api-key', provider, key),

  // 新增: 读取当前 Key (返回脱敏版, 只显示前4位数)
  getApiKey: (provider: string): Promise<string> =>
    ipcRenderer.invoke('get-api-key', provider),

  //新增: 语音相关设置
  getVoiceEnabled: (): Promise<boolean> => ipcRenderer.invoke('get-voice-enabled'),
  setVoiceEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-voice-enabled', enabled),
  getVoiceSaveToFile: (): Promise<boolean> => ipcRenderer.invoke('get-voice-save-to-file'),
  setVoiceSaveToFile: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-voice-save-to-file', enabled),

  listTtsProviders: (): Promise<
    Array<{ id: string; displayName: string; hint: string; kind: 'local' | 'cloud' }>
  > => ipcRenderer.invoke('tts:list-providers'),
  getActiveTtsProvider: (): Promise<string> => ipcRenderer.invoke('tts:get-active-provider'),
  setActiveTtsProvider: (id: string): Promise<string> =>
    ipcRenderer.invoke('tts:set-active-provider', id),
  getFairyVoiceStatus: (
    providerId?: string
  ): Promise<{
    profileId: string
    displayName: string
    providerId: string
    status: 'ready' | 'pending' | 'failed' | 'missing'
    voiceId?: string
    lastError?: string
  }> => ipcRenderer.invoke('tts:fairy-voice-status', providerId),
  ensureFairyVoice: (
    providerId?: string,
    force?: boolean
  ): Promise<{
    profileId: string
    displayName: string
    providerId: string
    status: 'ready' | 'pending' | 'failed' | 'missing'
    voiceId?: string
    lastError?: string
  }> => ipcRenderer.invoke('tts:ensure-fairy-voice', providerId, force),

  openVoiceCallWindow: (): Promise<void> => ipcRenderer.invoke('open-voice-call-window'),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window-close'),
  minimizeVoiceCallWindow: (): Promise<void> => ipcRenderer.invoke('minimize-voice-call-window'),
  toggleMaximizeVoiceCallWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('toggle-maximize-voice-call-window'),
  isVoiceCallWindowMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('is-voice-call-window-maximized'),
  onVoiceCallWindowState: (callback: (state: { maximized: boolean }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }): void => {
      callback(state)
    }
    ipcRenderer.on('voice-call-window-state', listener)
    return () => {
      ipcRenderer.removeListener('voice-call-window-state', listener)
    }
  },

  onFairyFloatShow: (callback: (payload: { text?: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { text?: string }): void => {
      callback(payload)
    }
    ipcRenderer.on('fairy-float:show', listener)
    return () => {
      ipcRenderer.removeListener('fairy-float:show', listener)
    }
  },

  onFairyFloatHide: (callback: () => void): (() => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('fairy-float:hide', listener)
    return () => {
      ipcRenderer.removeListener('fairy-float:hide', listener)
    }
  },

  onFairyFloatAudio: (
    callback: (payload: { audioData: Uint8Array }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { audioData: Uint8Array }
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('fairy-float:audio', listener)
    return () => {
      ipcRenderer.removeListener('fairy-float:audio', listener)
    }
  },

  notifyFairyFloatReady: (): Promise<void> => ipcRenderer.invoke('fairy-float:ready'),

  notifyFairyFloatSpeechEnded: (): Promise<void> =>
    ipcRenderer.invoke('fairy-float:speech-ended'),

  noteIdleActivity: (): void => {
    ipcRenderer.send('idle:activity')
  },

  setVoiceCallMuted: (muted: boolean): void => {
    ipcRenderer.send('voice-call:muted', muted)
  },

  transcribeSpeech: (
    audioPath: string
  ): Promise<{ success: boolean; text: string; error?: string }> =>
    ipcRenderer.invoke('whisper:transcribe', audioPath),

  transcribeRecording: (
    audioData: Uint8Array,
    options?: { debugSave?: boolean; stats?: unknown }
  ): Promise<{ success: boolean; text: string; error?: string; stats?: unknown; debugPath?: string }> =>
    ipcRenderer.invoke('whisper:transcribe-recording', audioData, options),

  listReminders: (): Promise<
    Array<{
      id: string
      message: string
      createdAt: number
      fireAt: number
      status: 'pending' | 'fired' | 'cancelled'
      source?: 'manual' | 'fairy'
    }>
  > => ipcRenderer.invoke('reminders:list'),

  cancelReminder: (id: string): Promise<boolean> => ipcRenderer.invoke('reminders:cancel', id),

  clearFinishedReminders: (): Promise<number> => ipcRenderer.invoke('reminders:clear-finished'),

  createReminder: (payload: {
    message: string
    delaySeconds: number
  }): Promise<{
    id: string
    message: string
    createdAt: number
    fireAt: number
    status: 'pending' | 'fired' | 'cancelled'
    source?: 'manual' | 'fairy'
  }> => ipcRenderer.invoke('reminders:create', payload),

  getUserProfile: (): Promise<{
    displayName: string
    avatarDataUrl: string
    masterRole: 'zhe' | 'ling' | 'custom'
    masterCustomName: string
    assistant2Role: 'zhe' | 'ling' | 'custom'
    assistant2CustomName: string
  }> => ipcRenderer.invoke('user-profile:get'),
  setUserProfile: (
    profile: Partial<{
      displayName: string
      avatarDataUrl: string
      masterRole: 'zhe' | 'ling' | 'custom'
      masterCustomName: string
      assistant2Role: 'zhe' | 'ling' | 'custom'
      assistant2CustomName: string
    }>
  ): Promise<{
    displayName: string
    avatarDataUrl: string
    masterRole: 'zhe' | 'ling' | 'custom'
    masterCustomName: string
    assistant2Role: 'zhe' | 'ling' | 'custom'
    assistant2CustomName: string
  }> => ipcRenderer.invoke('user-profile:set', profile),
  onUserProfileChanged: (
    callback: (profile: {
      displayName: string
      avatarDataUrl: string
      masterRole: 'zhe' | 'ling' | 'custom'
      masterCustomName: string
      assistant2Role: 'zhe' | 'ling' | 'custom'
      assistant2CustomName: string
    }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      profile: {
        displayName: string
        avatarDataUrl: string
        masterRole: 'zhe' | 'ling' | 'custom'
        masterCustomName: string
        assistant2Role: 'zhe' | 'ling' | 'custom'
        assistant2CustomName: string
      }
    ): void => {
      callback(profile)
    }
    ipcRenderer.on('user-profile:changed', listener)
    return () => {
      ipcRenderer.removeListener('user-profile:changed', listener)
    }
  },

  listBgmTracks: (): Promise<{
    dir: string
    tracks: Array<{
      id: string
      fileName: string
      title: string
      artist: string
    }>
  }> => ipcRenderer.invoke('bgm:list-tracks'),
  readBgmTrack: (
    fileName: string
  ): Promise<{ data: Uint8Array; mime: string; fileName: string }> =>
    ipcRenderer.invoke('bgm:read-track', fileName),
  getBgmSettings: (): Promise<{
    enabled: boolean
    playMode: 'loop-one' | 'loop-all' | 'shuffle'
    bgmVolume: number
    fairyVoiceVolume: number
    lastTrackId: string | null
    trackOrder: string[]
  }> => ipcRenderer.invoke('bgm:get-settings'),
  setBgmSettings: (
    partial: Partial<{
      enabled: boolean
      playMode: 'loop-one' | 'loop-all' | 'shuffle'
      bgmVolume: number
      fairyVoiceVolume: number
      lastTrackId: string | null
      trackOrder: string[]
    }>
  ): Promise<{
    enabled: boolean
    playMode: 'loop-one' | 'loop-all' | 'shuffle'
    bgmVolume: number
    fairyVoiceVolume: number
    lastTrackId: string | null
    trackOrder: string[]
  }> => ipcRenderer.invoke('bgm:set-settings', partial),
  flushBgmSettings: (
    partial: Partial<{
      enabled: boolean
      playMode: 'loop-one' | 'loop-all' | 'shuffle'
      bgmVolume: number
      fairyVoiceVolume: number
      lastTrackId: string | null
      trackOrder: string[]
    }>
  ): void => {
    ipcRenderer.send('bgm:flush-settings', partial)
  },

  getFairyPetState: (): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:get-state'),
  setFairyPetEnabled: (
    enabled: boolean
  ): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:set-enabled', enabled),
  showFairyPet: (): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:show'),
  hideFairyPet: (): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:hide'),
  setFairyPetPinned: (
    pinned: boolean
  ): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:set-pinned', pinned),
  setFairyPetBounds: (bounds: {
    x?: number
    y?: number
    width?: number
    height?: number
  }): Promise<{
    enabled: boolean
    visible: boolean
    pinned: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('fairy-pet:set-bounds', bounds),
  openFairyPetSettings: (): Promise<void> => ipcRenderer.invoke('fairy-pet:open-settings'),
  onFairyPetState: (
    callback: (state: {
      enabled: boolean
      visible: boolean
      pinned: boolean
      bounds: { x: number; y: number; width: number; height: number } | null
    }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: {
        enabled: boolean
        visible: boolean
        pinned: boolean
        bounds: { x: number; y: number; width: number; height: number } | null
      }
    ): void => {
      callback(state)
    }
    ipcRenderer.on('fairy-pet:state', listener)
    return () => {
      ipcRenderer.removeListener('fairy-pet:state', listener)
    }
  },
  onNavigate: (callback: (path: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string): void => {
      callback(path)
    }
    ipcRenderer.on('navigate', listener)
    return () => {
      ipcRenderer.removeListener('navigate', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    /*把 electron 和 api 挂载到 window 上，供渲染进程访问*/
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
