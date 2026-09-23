// src/main/voice/ttsClient.ts
// 调用本地GPT-SoVITS的api_v2.py服务，把文本合成为语音
import { sanitizeTextForTTS } from './ttsTextSanitizer'

const GPT_SOVITS_API_BASE = 'http://127.0.0.1:9880'

// 已实测验证过的Fairy参考音频配置
const REF_AUDIO_PATH =
  'E:\\Fairy\\Gpt-sovits\\GPT-SoVITS-v2pro-20250604\\output\\slicer_opt\\7月6日 3.mp3.reformatted_vocals.flac_0000383360_0000580160.wav'
  //'E:\\Fairy\\Gpt-sovits\\GPT-SoVITS-v2pro-20250604\\output\\slicer_opt\\xilian.mp3_0000293440_0000492480.wav'
const REF_TEXT = '你好，叶顺光小姐，我已经将您的生活偏好数据分析报告发送给了助手二号。'
//const REF_TEXT = '又感动的重温了一遍呢，但故事的每一页似乎都有些遗憾。'
const REF_LANG = 'zh'

export interface TtsOptions {
  seed?: number
  temperature?: number
}

export interface TtsResult {
  audioBuffer: Buffer
}

/**
 * 调用本地GPT-SoVITS，把一段文字合成为语音。
 * 非流式版本：等整段音频生成完才拿到完整Buffer。
 * seed/temperature先按实测参数给了默认值，之后想精调音色一致性时再调。
 */
export async function synthesizeSpeech(text: string, options: TtsOptions = {}): Promise<TtsResult> {
  const { seed = 42, temperature = 0.6 } = options
  const cleanText = sanitizeTextForTTS(text)

  const requestBody = {
    text: cleanText,
    text_lang: REF_LANG,
    ref_audio_path: REF_AUDIO_PATH,
    prompt_lang: REF_LANG,
    prompt_text: REF_TEXT,
    text_split_method: 'cut5',
    media_type: 'wav',
    streaming_mode: false,
    seed,
    temperature,
    fragment_interval: 0.4   // 新增：句间停顿，默认0.3偏紧，先试0.5，觉得还是太快可以再往上调
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
  return { audioBuffer: Buffer.from(arrayBuffer) }
}