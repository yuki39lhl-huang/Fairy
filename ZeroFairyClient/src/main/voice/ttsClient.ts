// 业务侧统一入口：SpeakScript 编排 + 当前激活的 TTS Provider + Fairy 声线就绪检查

import { toSpeakText, type SpeakScriptContext } from './speakScript'
import { getActiveTtsProvider, setActiveTtsProvider as setActive } from './tts/registry'
import type { TtsSynthesizeOptions, TtsSynthesizeResult } from './tts/types'
import { ensureFairyVoice } from './voiceProfile/ensureFairyVoice'

export type { TtsSynthesizeOptions, TtsSynthesizeResult }
export type TtsOptions = TtsSynthesizeOptions
export type TtsResult = Pick<TtsSynthesizeResult, 'audioBuffer'> & {
  spokenText?: string
  providerId?: string
}

export {
  registerTtsProvider,
  setActiveTtsProvider,
  listTtsProviders,
  getActiveTtsProvider,
  getTtsProvider
} from './tts/registry'

export { ensureFairyVoice, getFairyVoiceStatus } from './voiceProfile/ensureFairyVoice'

/**
 * 把一段文字合成为语音（先编排朗读稿，再交给当前 TTS 厂家）。
 */
export async function synthesizeSpeech(
  text: string,
  options: TtsOptions & { scene?: SpeakScriptContext['scene'] } = {}
): Promise<TtsResult> {
  const { scene = 'generic', ...ttsOptions } = options
  const spokenText = toSpeakText(text, { scene })
  if (!spokenText) {
    throw new Error('TTS：编排后文本为空，已跳过合成')
  }

  const provider = getActiveTtsProvider()
  if (provider.id !== 'gpt-sovits') {
    await ensureFairyVoice(provider.id)
  }

  const result = await provider.synthesize(spokenText, ttsOptions)
  return {
    audioBuffer: result.audioBuffer,
    spokenText: result.spokenText,
    providerId: result.providerId
  }
}

/** 切换厂家并尽量预热 Fairy 声线（云厂家会触发 ensure） */
export async function switchTtsProvider(id: string): Promise<void> {
  setActive(id)
  if (id !== 'gpt-sovits') {
    void ensureFairyVoice(id).catch((err) => {
      console.warn('[tts] 切换厂家后 Fairy 声线预热失败:', err)
    })
  }
}
