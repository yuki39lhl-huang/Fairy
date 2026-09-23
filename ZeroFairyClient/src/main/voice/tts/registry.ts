// TTS 厂家注册表

import type { TtsProvider } from './types'
import { gptSovitsProvider } from './providers/gptSovitsProvider'
import { minimaxProvider } from './providers/minimaxProvider'
import { seedIclProvider } from './providers/seedIclProvider'
import { storeManager } from '../../store'

const providers = new Map<string, TtsProvider>([
  [gptSovitsProvider.id, gptSovitsProvider],
  [minimaxProvider.id, minimaxProvider],
  [seedIclProvider.id, seedIclProvider]
])

let activeProviderId = gptSovitsProvider.id
let hydrated = false

function hydrateFromStore(): void {
  if (hydrated) return
  hydrated = true
  try {
    const saved = storeManager.getActiveTtsProvider()
    if (saved && providers.has(saved)) {
      activeProviderId = saved
    }
  } catch {
    /* store 尚未就绪时忽略 */
  }
}

export function registerTtsProvider(provider: TtsProvider): void {
  providers.set(provider.id, provider)
}

export function listTtsProviders(): TtsProvider[] {
  hydrateFromStore()
  return [...providers.values()]
}

export function getTtsProvider(id: string): TtsProvider {
  const provider = providers.get(id)
  if (!provider) {
    throw new Error(`未知 TTS provider: ${id}`)
  }
  return provider
}

export function getActiveTtsProvider(): TtsProvider {
  hydrateFromStore()
  return getTtsProvider(activeProviderId)
}

export function setActiveTtsProvider(id: string): void {
  if (!providers.has(id)) {
    throw new Error(`未知 TTS provider: ${id}`)
  }
  activeProviderId = id
  storeManager.setActiveTtsProvider(id)
}
