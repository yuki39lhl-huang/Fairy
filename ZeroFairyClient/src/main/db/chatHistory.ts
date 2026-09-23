// src/main/db/chatHistory.ts
// 职责：聊天记录的存取
// 每次对话结束后自动保存，支持按 session 查询历史

import { getDb } from "./index"

export interface ChatRecord {
    id?: number
    session: string
    role: 'user' | 'assistant'
    content: string
    created_at?: number
}

export const chatHistoryDb = {
    //保存一条信息
    save(record: ChatRecord): void {
        const db = getDb()
        db.prepare(`
    INSERT INTO chat_history (session, role, content)
    VALUES (?, ?, ?)
  `).run(record.session, record.role, record.content)
    },

    //查询某个 session 的历史记录
    getBySession(session: string, limit = 50): ChatRecord[] {
        const db = getDb()
        return db.prepare(`
            SELECT * FROM chat_history
            WHERE session = ?
            ORDER BY created_at DESC
            LIMIT ?
            `).all(session, limit) as ChatRecord[]
    },

    // 查询最近的 N 条记录
    getRecent(limit = 20): ChatRecord[] {
        const db = getDb()
        return db.prepare(`
            SELECT * FROM chat_history
            ORDER BY created_at DESC
            LIMIT ?
            `).all(limit) as ChatRecord[]
    }
}