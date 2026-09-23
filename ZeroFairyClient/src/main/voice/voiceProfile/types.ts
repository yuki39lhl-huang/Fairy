// VoiceProfile：角色声线与 TTS 厂家解耦；业务只认「Fairy」，厂家只认各自 binding

export type VoiceBindingStatus = 'ready' | 'pending' | 'failed' | 'missing'

export interface ProviderVoiceBinding {
  /** 厂家侧音色 ID（MiniMax voice_id / 火山 speaker_id 等） */
  voiceId: string
  status: VoiceBindingStatus
  activatedAt?: number
  lastError?: string
  /** 厂家私有扩展（如 model、file_id） */
  extra?: Record<string, unknown>
}

export const FAIRY_PROFILE_ID = 'fairy-default'
export const FAIRY_PROFILE_NAME = 'Fairy'

/** MiniMax 固定 voice_id：换参考音时递增后缀，强制重新克隆 */
export const MINIMAX_FAIRY_VOICE_ID = 'fairy_zerofairy_02'

/**
 * 火山后付费自定义音色代号（非控制台 S_ 槽位）。
 * 规则：英文字母开头，8–256，仅字母数字-_，不以 -/_ 结尾。
 */
export const SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID = 'fairyZerofairy02'
