// MiniMax 语音：上传参考音 → voice_clone → T2A 合成；7 天内首次合成激活永久保留

import fs from 'node:fs/promises'
import path from 'node:path'
import { storeManager } from '../../../store'
import { MINIMAX_FAIRY_VOICE_ID } from '../../voiceProfile/types'
import type {
  TtsProvider,
  TtsSynthesizeOptions,
  TtsSynthesizeResult,
  VoiceEnsureContext,
  VoiceEnsureResult
} from '../types'

/** 国内站；国际站为 https://api.minimax.io */
const MINIMAX_API_BASE = 'https://api.minimaxi.com'
const TTS_MODEL = 'speech-2.8-hd'
const ACTIVATE_TEXT = '你好，我是Fairy。'

function getApiKey(): string {
  const key = storeManager.getApiKey('minimax')?.trim()
  if (!key) throw new Error('MiniMax：未配置 API Key')
  return key
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

function hexToBuffer(hex: string): Buffer {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  return Buffer.from(clean, 'hex')
}

async function uploadCloneAudio(apiKey: string, refAudioPath: string): Promise<number> {
  const buf = await fs.readFile(refAudioPath)
  const form = new FormData()
  form.append('purpose', 'voice_clone')
  form.append(
    'file',
    new Blob([new Uint8Array(buf)], { type: 'audio/wav' }),
    path.basename(refAudioPath) || 'fairy_ref.wav'
  )

  const response = await fetch(`${MINIMAX_API_BASE}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`MiniMax 上传参考音失败(${response.status}): ${raw}`)
  }

  const json = JSON.parse(raw) as {
    file?: { file_id?: number }
    file_id?: number
    base_resp?: { status_code?: number; status_msg?: string }
  }
  if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax 上传失败: ${json.base_resp.status_msg || json.base_resp.status_code}`)
  }
  const fileId = json.file?.file_id ?? json.file_id
  if (fileId == null) {
    throw new Error(`MiniMax 上传未返回 file_id: ${raw}`)
  }
  return Number(fileId)
}

async function cloneVoice(apiKey: string, fileId: number, voiceId: string): Promise<void> {
  const response = await fetch(`${MINIMAX_API_BASE}/v1/voice_clone`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      file_id: fileId,
      voice_id: voiceId,
      // text 仅用于克隆预览，真正永久激活靠后续 T2A
      text: ACTIVATE_TEXT,
      model: TTS_MODEL
    })
  })

  const raw = await response.text()
  let json: {
    base_resp?: { status_code?: number; status_msg?: string }
  } = {}
  try {
    json = JSON.parse(raw) as typeof json
  } catch {
    /* ignore */
  }

  const code = json.base_resp?.status_code
  // 已存在同名 voice_id 时视为可复用
  if (code && code !== 0) {
    const msg = json.base_resp?.status_msg || String(code)
    if (/exist|already|duplicate|已存在/i.test(msg)) {
      console.warn('[minimax] voice_id 已存在，直接复用:', voiceId)
      return
    }
    throw new Error(`MiniMax 克隆失败(${response.status}): ${msg}`)
  }
  if (!response.ok) {
    throw new Error(`MiniMax 克隆失败(${response.status}): ${raw}`)
  }
}

async function synthesizeRaw(apiKey: string, text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`${MINIMAX_API_BASE}/v1/t2a_v2`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model: TTS_MODEL,
      text,
      stream: false,
      language_boost: 'Chinese',
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    })
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`MiniMax 合成失败(${response.status}): ${raw}`)
  }

  const json = JSON.parse(raw) as {
    data?: { audio?: string }
    base_resp?: { status_code?: number; status_msg?: string }
  }
  if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax 合成失败: ${json.base_resp.status_msg || json.base_resp.status_code}`
    )
  }
  const hex = json.data?.audio
  if (!hex) {
    throw new Error(`MiniMax 合成未返回音频: ${raw.slice(0, 400)}`)
  }
  return hexToBuffer(hex)
}

export const minimaxProvider: TtsProvider = {
  id: 'minimax',
  displayName: 'MiniMax',
  hint: '云端 · 填 Key 后自动克隆 Fairy',
  kind: 'cloud',

  async ensureVoice(ctx: VoiceEnsureContext): Promise<VoiceEnsureResult> {
    const apiKey = getApiKey()
    const voiceId = MINIMAX_FAIRY_VOICE_ID

    // 非强制且本地已是当前 voice_id 时，试合成确认可用
    if (!ctx.force && ctx.existingVoiceId === voiceId) {
      try {
        await synthesizeRaw(apiKey, ACTIVATE_TEXT, voiceId)
        return { voiceId, activated: true, extra: { model: TTS_MODEL } }
      } catch {
        console.warn('[minimax] 已有 voiceId 合成失败，重新克隆')
      }
    }

    const fileId = await uploadCloneAudio(apiKey, ctx.refAudioPath)
    // 无精确短样台词时不传 clone_prompt，避免文案错配拉低相似度
    await cloneVoice(apiKey, fileId, voiceId)

    // 7 天内至少合成一次才永久保留；克隆预览不算激活
    await synthesizeRaw(apiKey, ACTIVATE_TEXT, voiceId)

    return {
      voiceId,
      activated: true,
      extra: { model: TTS_MODEL, fileId, source: '长克隆语音' }
    }
  },

  async synthesize(text: string, _options: TtsSynthesizeOptions = {}): Promise<TtsSynthesizeResult> {
    const spokenText = text.trim()
    if (!spokenText) throw new Error('MiniMax：朗读文本为空')

    const binding = storeManager.getFairyVoiceBinding('minimax')
    const voiceId = binding?.voiceId || MINIMAX_FAIRY_VOICE_ID
    if (!binding || binding.status !== 'ready' || !binding.voiceId) {
      throw new Error('MiniMax：Fairy 声线尚未就绪，请先在设置中保存 API Key')
    }

    const apiKey = getApiKey()
    const audioBuffer = await synthesizeRaw(apiKey, spokenText, voiceId)
    return { audioBuffer, spokenText, providerId: 'minimax' }
  }
}
