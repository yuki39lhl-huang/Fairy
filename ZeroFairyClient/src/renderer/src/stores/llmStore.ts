// src/renderer/src/stores/llmStore.ts
// 职责：LLM 状态管理（是否正在生成、当前模型等）
// 类比：Java 里的全局单例 Service Bean

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLlmStore = defineStore('llm', () => {
  const isGenerating = ref(false)   // 是否正在等待LLM回复
  const currentProvider = ref('deepseek')
  const currentModel = ref('deepseek-v4-flash')

  function setGenerating(val: boolean): void {
    isGenerating.value = val
  }

  return { isGenerating, currentProvider, currentModel, setGenerating }
})