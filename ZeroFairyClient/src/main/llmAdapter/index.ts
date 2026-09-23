// src/main/llmAdapter/index.ts
// 适配器工厂——根据当前配置实例化对应的模型适配器

import { BaseModel } from './baseModel'
import { DeepSeekModel } from './providers/deepseek'
import { storeManager } from '../store'

export function createLLMAdapter(): BaseModel {
  const { provider, model } = storeManager.getActiveConfig()
  const apiKey = storeManager.getApiKey(provider) ?? ''

  switch (provider) {
    case 'deepseek':
      return new DeepSeekModel(apiKey, model as 'deepseek-v4-flash')
    default:
      throw new Error(`未知的模型厂商: ${provider}`)
  }
}