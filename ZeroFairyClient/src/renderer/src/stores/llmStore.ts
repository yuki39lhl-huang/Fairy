// src/renderer/src/stores/llmStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AgentPhase = 'idle' | 'thinking' | 'tools' | 'streaming'

const TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  get_current_time: '校准时间',
  reminder: '定时任务',
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
  /** 当前锁定输入的那一轮所属会话；删会话/新对话后作废，避免旧 ai:done 误解锁或误锁屏 */
  const generatingSessionId = ref('')
  const phase = ref<AgentPhase>('idle')
  const statusText = ref('')
  const currentProvider = ref('deepseek')
  const currentModel = ref('deepseek-v4-flash')

  function setGenerating(val: boolean, sessionId = ''): void {
    isGenerating.value = val
    if (!val) {
      generatingSessionId.value = ''
      phase.value = 'idle'
      statusText.value = ''
    } else {
      generatingSessionId.value = sessionId
      if (phase.value === 'idle') {
        phase.value = 'thinking'
        statusText.value = 'Fairy 思考中…'
      }
    }
  }

  /** 用户离开当前生成中的会话（删除 / 新对话 / 切走）时立刻放开输入 */
  function abandonGeneration(): void {
    isGenerating.value = false
    generatingSessionId.value = ''
    phase.value = 'idle'
    statusText.value = ''
  }

  /** 仅当事件属于当前锁定的会话时才结束生成（旧回合收尾不会误伤新提问） */
  function endGenerationForSession(sessionId?: string): void {
    if (sessionId && generatingSessionId.value && sessionId !== generatingSessionId.value) return
    setGenerating(false)
  }

  function acceptsSession(sessionId?: string): boolean {
    if (!isGenerating.value) return false
    if (!sessionId || !generatingSessionId.value) return true
    return sessionId === generatingSessionId.value
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
    generatingSessionId,
    phase,
    statusText,
    currentProvider,
    currentModel,
    setGenerating,
    abandonGeneration,
    endGenerationForSession,
    acceptsSession,
    setThinking,
    setTools,
    setStreaming,
    clearStatus
  }
})
