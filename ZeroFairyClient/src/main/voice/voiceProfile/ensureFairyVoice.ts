// Fairy 声线自动准备：填 Key 后后台克隆，业务侧只消费 ready 状态

import { getFairyAssets } from '../fairyAssets'
import { getTtsProvider } from '../tts/registry'
import { storeManager } from '../../store'
import type { ProviderVoiceBinding, VoiceBindingStatus } from './types'
import {
  FAIRY_PROFILE_ID,
  FAIRY_PROFILE_NAME,
  MINIMAX_FAIRY_VOICE_ID,
  SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID
} from './types'

const ensureLocks = new Map<string, Promise<ProviderVoiceBinding>>()

function expectedVoiceId(providerId: string): string | undefined {
  if (providerId === 'minimax') return MINIMAX_FAIRY_VOICE_ID
  if (providerId === 'seed-icl-2.0') return SEED_ICL_FAIRY_CUSTOM_SPEAKER_ID
  return undefined
}

export function getFairyVoiceStatus(providerId: string): {
  profileId: string
  displayName: string
  providerId: string
  status: VoiceBindingStatus
  voiceId?: string
  lastError?: string
} {
  if (providerId === 'gpt-sovits') {
    return {
      profileId: FAIRY_PROFILE_ID,
      displayName: FAIRY_PROFILE_NAME,
      providerId,
      status: 'ready',
      voiceId: 'local-ref'
    }
  }

  const binding = storeManager.getFairyVoiceBinding(providerId)
  if (!binding) {
    return {
      profileId: FAIRY_PROFILE_ID,
      displayName: FAIRY_PROFILE_NAME,
      providerId,
      status: 'missing'
    }
  }
  return {
    profileId: FAIRY_PROFILE_ID,
    displayName: FAIRY_PROFILE_NAME,
    providerId,
    status: binding.status,
    voiceId: binding.voiceId || undefined,
    lastError: binding.lastError
  }
}

/**
 * 确保当前厂家下 Fairy 声线可用。
 * - gpt-sovits：本地参考音，立刻 ready
 * - 云厂家：无 binding 则用内置参考音自动克隆并落盘
 * - force=true：换参考音后强制重克隆
 */
export async function ensureFairyVoice(
  providerId: string,
  options: { force?: boolean } = {}
): Promise<ProviderVoiceBinding> {
  if (providerId === 'gpt-sovits') {
    const ready: ProviderVoiceBinding = {
      voiceId: 'local-ref',
      status: 'ready',
      activatedAt: Date.now()
    }
    storeManager.setFairyVoiceBinding(providerId, ready)
    return ready
  }

  const existing = storeManager.getFairyVoiceBinding(providerId)
  const expected = expectedVoiceId(providerId)
  const voiceStale = Boolean(
    expected && existing?.voiceId && existing.voiceId !== expected
  )
  const force = Boolean(options.force || voiceStale)

  if (!force && existing?.status === 'ready' && existing.voiceId) {
    return existing
  }

  const inflight = ensureLocks.get(providerId)
  if (inflight && !force) return inflight

  const task = (async (): Promise<ProviderVoiceBinding> => {
    const pending: ProviderVoiceBinding = {
      voiceId: force ? expected || '' : existing?.voiceId ?? '',
      status: 'pending',
      lastError: undefined,
      extra: existing?.extra
    }
    storeManager.setFairyVoiceBinding(providerId, pending)

    try {
      const provider = getTtsProvider(providerId)
      if (!provider.ensureVoice) {
        throw new Error(`${provider.displayName} 不支持自动克隆 Fairy 声线`)
      }

      const assets = getFairyAssets()
      const result = await provider.ensureVoice({
        refAudioPath: assets.refAudioPath,
        promptText: assets.promptText,
        existingVoiceId: force ? undefined : existing?.voiceId || undefined,
        force
      })

      const ready: ProviderVoiceBinding = {
        voiceId: result.voiceId,
        status: 'ready',
        activatedAt: Date.now(),
        extra: result.extra
      }
      storeManager.setFairyVoiceBinding(providerId, ready)
      console.log(`[voiceProfile] Fairy 声线就绪 @ ${providerId}: ${result.voiceId}`)
      return ready
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const failed: ProviderVoiceBinding = {
        voiceId: existing?.voiceId ?? '',
        status: 'failed',
        lastError: message,
        extra: existing?.extra
      }
      storeManager.setFairyVoiceBinding(providerId, failed)
      console.error(`[voiceProfile] Fairy 声线准备失败 @ ${providerId}:`, message)
      throw err
    } finally {
      ensureLocks.delete(providerId)
    }
  })()

  ensureLocks.set(providerId, task)
  return task
}
