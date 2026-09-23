// src/main/agentEventBus.ts
// AG-UI 全局事件流总线
// 职责: 主进程统一通过这里向渲染进程推送所有事件
// 现在支持同时注册多个窗口（主聊天窗口 + 语音通话窗口），事件会广播给所有存活的窗口

import { WebContents } from "electron";

export type AgUiEventType =
    | 'ai:text-chunk'
    | 'ai:emotion'
    | 'ai:tool-call'
    | 'ai:status'
    | 'ai:audio-ready'
    | 'ai:audio-reset'
    | 'ai:done'
    | 'ai:error'
    | 'reminder:changed'

export interface AgUiEvent {
    type: AgUiEventType
    payload: unknown
}

class AgentEventBus {
    private webContentsList: WebContents[] = []

    // 注册渲染窗口：改成"追加"而不是"覆盖"，同一个webContents不会重复添加
    register(webContents: WebContents): void {
        if (!this.webContentsList.includes(webContents)) {
            this.webContentsList.push(webContents)
        }
        // 窗口关闭时自动从列表里摘除，避免持有已销毁窗口的失效引用
        webContents.once('destroyed', () => {
            this.webContentsList = this.webContentsList.filter((wc) => wc !== webContents)
        })
        console.log('[AgentEventBus] 渲染窗口已注册，当前共', this.webContentsList.length, '个')
    }

    // 推送事件到所有已注册且仍存活的窗口
    emit(type: AgUiEventType, payload: unknown): void {
        const aliveList = this.webContentsList.filter((wc) => !wc.isDestroyed())
        if (aliveList.length === 0) {
            console.warn('[AgentEventBus] 没有存活的渲染窗口，事件丢弃', type)
            return
        }
        for (const wc of aliveList) {
            wc.send('ag-ui-event', { type, payload } as AgUiEvent)
        }
    }
}

export const agentEventBus = new AgentEventBus()