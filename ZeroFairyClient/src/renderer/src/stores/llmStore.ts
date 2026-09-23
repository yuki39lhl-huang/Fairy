// src/renderer/src/stores/llmStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AgentPhase = 'idle' | 'thinking' | 'tools' | 'streaming'

const TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  get_current_time: '校准时间',
  set_reminder: '设置提醒',
  translate_text: '翻译',
  add_account_record: '记账',
  get_account_summary: '账目汇总',
  generate_excel: '生成表格',
  generate_word: '生成文档',
  generate_pdf: '生成 PDF',
  generate_ppt: '生成演示文稿'
}

export const useLlmStore = defineStore('llm', () => {
  const isGenerating = ref(false)
  const phase = ref<AgentPhase>('idle')
  const statusText = ref('')
  const currentProvider = ref('deepseek')
  const currentModel = ref('deepseek-v4-flash')

  function setGenerating(val: boolean): void {
    isGenerating.value = val
    if (!val) {
      phase.value = 'idle'
      statusText.value = ''
    } else if (phase.value === 'idle') {
      phase.value = 'thinking'
      statusText.value = 'Fairy 思考中…'
    }
  }

  function setThinking(): void {
    phase.value = 'thinking'
    statusText.value = 'Fairy 思考中…'
  }

  function setTools(tools: string[]): void {
    phase.value = 'tools'
    const labels = tools.map((t) => TOOL_LABELS[t] || t)
    statusText.value =
      labels.length === 0 ? 'Fairy 正在调用工具…' : `Fairy 正在${labels.join('、')}…`
  }

  function setStreaming(): void {
    if (phase.value !== 'streaming') {
      phase.value = 'streaming'
      statusText.value = ''
    }
  }

  function clearStatus(): void {
    phase.value = 'idle'
    statusText.value = ''
  }

  return {
    isGenerating,
    phase,
    statusText,
    currentProvider,
    currentModel,
    setGenerating,
    setThinking,
    setTools,
    setStreaming,
    clearStatus
  }
})
