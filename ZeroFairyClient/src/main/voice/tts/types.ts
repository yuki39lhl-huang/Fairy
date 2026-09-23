// 可插拔 TTS 厂家抽象

export interface TtsSynthesizeOptions {
  seed?: number
  temperature?: number
  extra?: Record<string, unknown>
}

export interface TtsSynthesizeResult {
  audioBuffer: Buffer
  spokenText: string
  providerId: string
}

export interface VoiceEnsureContext {
  refAudioPath: string
  promptText: string
  /** 本地已缓存的厂家音色 ID（若有） */
  existingVoiceId?: string
  /** true 时忽略本地 ready，强制重新克隆 */
  force?: boolean
}

export interface VoiceEnsureResult {
  voiceId: string
  activated: boolean
  extra?: Record<string, unknown>
}

export interface TtsProvider {
  readonly id: string
  readonly displayName: string
  /** 设置页短说明 */
  readonly hint?: string
  readonly kind?: 'local' | 'cloud'
  synthesize(text: string, options?: TtsSynthesizeOptions): Promise<TtsSynthesizeResult>
  /**
   * 可选：用内置 Fairy 参考音自动克隆/绑定声线。
   * 本地引擎可不实现（视为始终就绪）。
   */
  ensureVoice?(ctx: VoiceEnsureContext): Promise<VoiceEnsureResult>
}
