// 火山引擎 seed-icl-2.0：V3 voice_clone 训练 + unidirectional 合成

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { storeManager } from '../../../store'
import { SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID } from '../../voiceProfile/types'
import type {
  TtsProvider,
  TtsSynthesizeOptions,
  TtsSynthesizeResult,
  VoiceEnsureContext,
  VoiceEnsureResult
} from '../types'

const VOLC_CLONE_URL = 'https://openspeech.bytedance.com/api/v3/tts/voice_clone'
const VOLC_GET_VOICE_URL = 'https://openspeech.bytedance.com/api/v3/tts/get_voice'
const VOLC_TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-icl-2.0'
const MODEL_TYPE = 4

interface VolcCredentials {
  mode: 'apiKey' | 'appToken'
  apiKey?: string
  appId?: string
  accessToken?: string
}

function getCredentials(): VolcCredentials {
  const apiKey = storeManager.getApiKey('volcengine')?.trim()
  if (apiKey) return { mode: 'apiKey', apiKey }

  const appId = storeManager.getApiKey('volcengineAppId')?.trim()
  const accessToken = storeManager.getApiKey('volcengineAccessToken')?.trim()
  if (appId && accessToken) {
    return { mode: 'appToken', appId, accessToken }
  }
  throw new Error('火山 seed-icl-2.0：请配置 API Key，或 AppId + Access Token')
}

function authHeaders(creds: VolcCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Request-Id': randomUUID(),
    'X-Api-Resource-Id': RESOURCE_ID
  }
  if (creds.mode === 'apiKey' && creds.apiKey) {
    headers['X-Api-Key'] = creds.apiKey
  } else {
    if (creds.appId) {
      headers['X-Api-App-Id'] = creds.appId
      headers['X-Api-App-Key'] = creds.appId
    }
    if (creds.accessToken) {
      headers['X-Api-Access-Key'] = creds.accessToken
    }
  }
  return headers
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cloneVoice(
  creds: VolcCredentials,
  refAudioPath: string,
  promptText: string
): Promise<string> {
  const audioBuf = await fs.readFile(refAudioPath)
  const body = {
    speaker_id: 'custom_speaker_id',
    custom_speaker_id: SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID,
    audio: {
      data: audioBuf.toString('base64'),
      format: 'wav'
    },
    text: promptText,
    language: 0,
    extra_params: {
      enable_audio_denoise: false,
      demo_text: '你好，我是Fairy。'
    }
  }

  const response = await fetch(VOLC_CLONE_URL, {
    method: 'POST',
    headers: authHeaders(creds),
    body: JSON.stringify(body)
  })

  const raw = await response.text()
  let json: {
    code?: number
    message?: string
    speaker_id?: string
    status?: number
  } = {}
  try {
    json = JSON.parse(raw) as typeof json
  } catch {
    /* ignore */
  }

  // 已存在时走查询
  if (!response.ok || (json.code && json.code !== 0 && json.code !== 20000000)) {
    const msg = json.message || raw
    if (/exist|already|重复|已存在/i.test(msg)) {
      return SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID
    }
    throw new Error(`火山克隆失败(${response.status}): ${msg.slice(0, 500)}`)
  }

  return json.speaker_id || SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID
}

async function waitUntilReady(creds: VolcCredentials, speakerId: string): Promise<string> {
  const maxAttempts = 40
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(VOLC_GET_VOICE_URL, {
      method: 'POST',
      headers: authHeaders(creds),
      body: JSON.stringify({
        speaker_id: speakerId.startsWith('S_') ? speakerId : 'custom_speaker_id',
        ...(speakerId.startsWith('S_')
          ? {}
          : { custom_speaker_id: speakerId })
      })
    })

    const raw = await response.text()
    let json: {
      status?: number
      speaker_id?: string
      message?: string
      code?: number
    } = {}
    try {
      json = JSON.parse(raw) as typeof json
    } catch {
      /* ignore */
    }

    // Success=2 Active=4
    if (json.status === 2 || json.status === 4) {
      return json.speaker_id || speakerId
    }
    if (json.status === 3) {
      throw new Error(`火山音色训练失败: ${json.message || raw}`)
    }

    await sleep(1500)
  }
  throw new Error('火山音色训练超时，请稍后在设置中重试')
}

async function synthesizeRaw(
  creds: VolcCredentials,
  text: string,
  speakerId: string
): Promise<Buffer> {
  const response = await fetch(VOLC_TTS_URL, {
    method: 'POST',
    headers: authHeaders(creds),
    body: JSON.stringify({
      user: { uid: 'zerofairyclient' },
      req_params: {
        text,
        speaker: speakerId,
        audio_params: {
          format: 'mp3',
          sample_rate: 24000
        },
        additions: JSON.stringify({ model_type: MODEL_TYPE })
      }
    })
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`火山合成失败(${response.status}): ${raw.slice(0, 500)}`)
  }

  const chunks: Buffer[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row: { code?: number; data?: string; message?: string }
    try {
      row = JSON.parse(trimmed) as typeof row
    } catch {
      continue
    }
    if (row.code === 0 && row.data) {
      chunks.push(Buffer.from(row.data, 'base64'))
      continue
    }
    if (row.code === 20000000) break
    if (row.code && row.code !== 0) {
      throw new Error(`火山合成错误(${row.code}): ${row.message || trimmed}`)
    }
  }

  if (!chunks.length) {
    throw new Error(`火山合成未返回音频: ${raw.slice(0, 400)}`)
  }
  return Buffer.concat(chunks)
}

export const seedIclProvider: TtsProvider = {
  id: 'seed-icl-2.0',
  displayName: '火山 seed-icl-2.0',
  hint: '云端 · 填 Key 后自动克隆 Fairy',
  kind: 'cloud',

  async ensureVoice(ctx: VoiceEnsureContext): Promise<VoiceEnsureResult> {
    const creds = getCredentials()
    let speakerId = ctx.existingVoiceId?.trim() || SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID

    if (ctx.existingVoiceId?.trim()) {
      try {
        speakerId = await waitUntilReady(creds, speakerId)
        return { voiceId: speakerId, activated: true, extra: { model_type: MODEL_TYPE } }
      } catch {
        console.warn('[seed-icl] 已有 speaker 不可用，重新训练')
      }
    }

    speakerId = await cloneVoice(creds, ctx.refAudioPath, ctx.promptText)
    speakerId = await waitUntilReady(creds, speakerId)

    return {
      voiceId: speakerId,
      activated: true,
      extra: { model_type: MODEL_TYPE, resourceId: RESOURCE_ID }
    }
  },

  async synthesize(text: string, _options: TtsSynthesizeOptions = {}): Promise<TtsSynthesizeResult> {
    const spokenText = text.trim()
    if (!spokenText) throw new Error('seed-icl-2.0：朗读文本为空')

    const binding = storeManager.getFairyVoiceBinding('seed-icl-2.0')
    if (!binding || binding.status !== 'ready' || !binding.voiceId) {
      throw new Error('seed-icl-2.0：Fairy 声线尚未就绪，请先在设置中保存密钥')
    }

    const creds = getCredentials()
    const audioBuffer = await synthesizeRaw(creds, spokenText, binding.voiceId)
    return { audioBuffer, spokenText, providerId: 'seed-icl-2.0' }
  }
}
