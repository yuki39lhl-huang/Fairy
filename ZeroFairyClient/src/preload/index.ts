import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  sendMessage: (text: string, history: { role: string, content: string }[]): Promise<string> =>
    ipcRenderer.invoke('send-message', text, history),

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
  openVoiceCallWindow: (): Promise<void> => ipcRenderer.invoke('open-voice-call-window'),
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

  transcribeSpeech: (
    audioPath: string
  ): Promise<{ success: boolean; text: string; error?: string }> =>
    ipcRenderer.invoke('whisper:transcribe', audioPath),

  transcribeRecording: (
    audioData: Uint8Array,
    options?: { debugSave?: boolean; stats?: unknown }
  ): Promise<{ success: boolean; text: string; error?: string; stats?: unknown; debugPath?: string }> =>
    ipcRenderer.invoke('whisper:transcribe-recording', audioData, options)
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
