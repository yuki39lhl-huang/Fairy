// 本地 GPT-SoVITS：使用打包的 Fairy 参考音

import { getFairyAssets } from '../../fairyAssets'
import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult } from '../types'

const GPT_SOVITS_API_BASE = 'http://127.0.0.1:9880'

export const gptSovitsProvider: TtsProvider = {
  id: 'gpt-sovits',
  displayName: 'GPT-SoVITS',
  hint: '本地 · 无需 API Key',
  kind: 'local',

  async synthesize(text: string, options: TtsSynthesizeOptions = {}): Promise<TtsSynthesizeResult> {
    const spokenText = text.trim()
    if (!spokenText) {
      throw new Error('GPT-SoVITS：朗读文本为空')
    }

    const assets = getFairyAssets()
    const { seed = 42, temperature = 0.6 } = options
    const requestBody = {
      text: spokenText,
      text_lang: assets.lang,
      ref_audio_path: assets.localRefAudioPath,
      prompt_lang: assets.lang,
      prompt_text: assets.promptText,
      text_split_method: 'cut5',
      media_type: 'wav',
      streaming_mode: false,
      seed,
      temperature,
      fragment_interval: 0.4,
      ...(options.extra ?? {})
    }

    const response = await fetch(`${GPT_SOVITS_API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GPT-SoVITS调用失败(状态码${response.status})：${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return {
      audioBuffer: Buffer.from(arrayBuffer),
      spokenText,
      providerId: 'gpt-sovits'
    }
  }
}
