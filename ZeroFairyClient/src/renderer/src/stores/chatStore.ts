// src/renderer/src/stores/chatStore.ts
// 职责：聊天消息列表的全局状态
// 每条消息的格式：{ role: 'user'|'assistant', content: string }

import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type WorkLane = 'chat' | 'code'

function createSessionId(lane: WorkLane): string {
  const prefix = lane === 'code' ? 'c' : 's'
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Code 会话号以 c- 开头，其余都算 Chat。列表过滤只认这一处。 */
export function sessionInLane(sessionId: string, lane: WorkLane): boolean {
  const code = sessionId.startsWith('c-')
  return lane === 'code' ? code : !code
}

interface LaneState {
  messages: ChatMessage[]
  streamingContent: string
  sessionId: string
  streamingSessionId: string
}

function freshLane(lane: WorkLane): LaneState {
  return {
    messages: [],
    streamingContent: '',
    sessionId: createSessionId(lane),
    streamingSessionId: ''
  }
}

export const useChatStore = defineStore('chat', () => {
  const activeLane = ref<WorkLane>('chat')
  const parked: Record<WorkLane, LaneState> = {
    chat: freshLane('chat'),
    code: freshLane('code')
  }
  const messages = ref<ChatMessage[]>([])
  const streamingContent = ref('')
  const sessionId = ref(parked.chat.sessionId)
  /** 正在生成的那一轮属于哪个会话；切走后旧流继续写回原会话，不进当前画面 */
  const streamingSessionId = ref('')
  /** 用户切到别的会话时，把还在生成的那条先搁在这里 */
  let held: LaneState | null = null

  // 添加一条完整消息
  function addMessage(role: 'user' | 'assistant', content: string): void {
    messages.value.push({ role, content })
  }

  function armStream(): void {
    streamingSessionId.value = sessionId.value
  }

  function snapshot(): LaneState {
    return {
      messages: messages.value.map((item) => ({ ...item })),
      streamingContent: streamingContent.value,
      sessionId: sessionId.value,
      streamingSessionId: streamingSessionId.value
    }
  }

  function restore(state: LaneState): void {
    messages.value = state.messages.map((item) => ({ ...item }))
    streamingContent.value = state.streamingContent
    sessionId.value = state.sessionId
    streamingSessionId.value = state.streamingSessionId
  }

  /** Chat / Code 各留一份会话，切换时对调，不把另一边的记录带过来。 */
  function activate(lane: WorkLane): void {
    if (activeLane.value === lane) return
    parked[activeLane.value] = snapshot()
    activeLane.value = lane
    restore(parked[lane])
  }

  function parkedStreamingLane(): WorkLane | null {
    if (streamingSessionId.value) return null
    const other: WorkLane = activeLane.value === 'chat' ? 'code' : 'chat'
    return parked[other].streamingSessionId ? other : null
  }

  function parkGenerating(): void {
    if (!streamingSessionId.value) return
    held = snapshot()
    streamingContent.value = ''
    streamingSessionId.value = ''
  }

  function restoreHeld(id: string): boolean {
    if (!held || held.sessionId !== id || !held.streamingSessionId) {
      if (held?.sessionId === id) held = null
      return false
    }
    const snap = held
    held = null
    restore(snap)
    return true
  }

  // 流式输出：累加文字片段。切到另一模式或另一会话时，文字仍写回原来的那条。
  function appendStreamChunk(chunk: string, forSession?: string): void {
    if (
      held &&
      forSession &&
      forSession === held.streamingSessionId &&
      held.sessionId !== sessionId.value
    ) {
      held.streamingContent += chunk
      return
    }
    if (forSession && streamingSessionId.value && forSession !== streamingSessionId.value) return
    if (streamingSessionId.value) {
      if (streamingSessionId.value === sessionId.value) streamingContent.value += chunk
      return
    }
    const lane = parkedStreamingLane()
    if (!lane) return
    const state = parked[lane]
    if (forSession && state.streamingSessionId && forSession !== state.streamingSessionId) return
    if (state.streamingSessionId === state.sessionId) state.streamingContent += chunk
  }

  // 流式输出结束：把累积内容存为完整消息，清空缓冲区
  function commitStreamMessage(forSession?: string): void {
    if (
      held &&
      forSession &&
      forSession === held.streamingSessionId &&
      held.sessionId !== sessionId.value
    ) {
      if (held.streamingContent) {
        held.messages.push({ role: 'assistant', content: held.streamingContent })
      }
      held.streamingContent = ''
      held.streamingSessionId = ''
      return
    }
    if (forSession && streamingSessionId.value && forSession !== streamingSessionId.value) return
    if (streamingSessionId.value) {
      if (streamingSessionId.value === sessionId.value && streamingContent.value) {
        messages.value.push({ role: 'assistant', content: streamingContent.value })
      }
      streamingContent.value = ''
      streamingSessionId.value = ''
      return
    }
    const lane = parkedStreamingLane()
    if (!lane) return
    const state = parked[lane]
    if (forSession && state.streamingSessionId && forSession !== state.streamingSessionId) return
    if (state.streamingSessionId === state.sessionId && state.streamingContent) {
      state.messages.push({ role: 'assistant', content: state.streamingContent })
    }
    state.streamingContent = ''
    state.streamingSessionId = ''
  }

  /** 离开当前生成回合：丢掉未完成流，避免旧 chunk 写进新会话 */
  function abandonStream(): void {
    streamingContent.value = ''
    streamingSessionId.value = ''
    held = null
  }

  // 清空所有消息
  function clearMessages(): void {
    messages.value = []
    streamingContent.value = ''
  }

  function startNewSession(): void {
    parkGenerating()
    sessionId.value = createSessionId(activeLane.value)
    messages.value = []
    streamingContent.value = ''
  }

  function loadSession(id: string, next: ChatMessage[]): void {
    if (restoreHeld(id)) return
    parkGenerating()
    if (restoreHeld(id)) return
    sessionId.value = id
    messages.value = next
    streamingContent.value = ''
  }

  return {
    messages,
    streamingContent,
    sessionId,
    activeLane,
    activate,
    armStream,
    addMessage,
    appendStreamChunk,
    commitStreamMessage,
    abandonStream,
    clearMessages,
    startNewSession,
    loadSession
  }
})