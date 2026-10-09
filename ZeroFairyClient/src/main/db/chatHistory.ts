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

export interface ChatSessionSummary {
    session: string
    title: string
    updatedAt: number
    pinned: boolean
    projectDir: string
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

    // 查询最近的 N 条记录
    getRecent(limit = 20): ChatRecord[] {
        const db = getDb()
        return db.prepare(`
            SELECT * FROM chat_history
            ORDER BY created_at DESC
            LIMIT ?
            `).all(limit) as ChatRecord[]
    },

    /** 按会话聚合：自定义标题优先，否则取第一条用户消息。置顶排在前面。 */
    listSessions(limit = 200, lane: 'chat' | 'code' = 'chat'): ChatSessionSummary[] {
        const db = getDb()
        const rows = db.prepare(`
            SELECT
              s.session AS session,
              COALESCE(
                NULLIF(m.title, ''),
                (SELECT content FROM chat_history
                 WHERE session = s.session AND role = 'user'
                 ORDER BY id ASC LIMIT 1),
                CASE WHEN s.session LIKE 'c-%' THEN '新会话' ELSE '新对话' END
              ) AS title,
              COALESCE(s.updated_at, m.opened_at, 0) AS updatedAt,
              COALESCE(m.pinned, 0) AS pinned,
              m.pinned_at AS pinnedAt,
              COALESCE(m.project_dir, '') AS projectDir
            FROM (
              SELECT session, MAX(created_at) AS updated_at
              FROM chat_history
              GROUP BY session
              UNION ALL
              SELECT session, NULL
              FROM chat_session_meta
              WHERE project_dir IS NOT NULL AND TRIM(project_dir) != ''
                AND session NOT IN (SELECT session FROM chat_history)
            ) s
            LEFT JOIN chat_session_meta m ON m.session = s.session
            WHERE CASE
              WHEN ? = 'code' THEN s.session LIKE 'c-%'
              ELSE s.session NOT LIKE 'c-%'
            END
            ORDER BY COALESCE(m.pinned, 0) DESC,
                     CASE WHEN COALESCE(m.pinned, 0) = 1 THEN m.pinned_at END DESC,
                     COALESCE(s.updated_at, m.opened_at, 0) DESC
            LIMIT ?
        `).all(lane, limit) as Array<ChatSessionSummary & { pinned: number; pinnedAt: number | null }>
        return rows.map((row) => ({
            session: row.session,
            title: row.title,
            updatedAt: row.updatedAt,
            pinned: Number(row.pinned) === 1,
            projectDir: row.projectDir || ''
        }))
    },

    /** 把会话挂到项目文件夹上。还没发消息时也会出现在列表里。 */
    bindProject(session: string, projectDir: string): void {
        const db = getDb()
        const dir = projectDir.trim()
        if (!session || !dir) return
        db.prepare(`
            INSERT INTO chat_session_meta (session, title, pinned, pinned_at, project_dir, opened_at)
            VALUES (?, NULL, 0, NULL, ?, strftime('%s','now'))
            ON CONFLICT(session) DO UPDATE SET
              project_dir = excluded.project_dir,
              opened_at = COALESCE(chat_session_meta.opened_at, excluded.opened_at)
        `).run(session, dir)
    },

    setPinned(session: string, pinned: boolean): void {
        const db = getDb()
        db.prepare(`
            INSERT INTO chat_session_meta (session, title, pinned, pinned_at)
            VALUES (?, NULL, ?, ?)
            ON CONFLICT(session) DO UPDATE SET
              pinned = excluded.pinned,
              pinned_at = excluded.pinned_at
        `).run(session, pinned ? 1 : 0, pinned ? Math.floor(Date.now() / 1000) : null)
    },

    renameSession(session: string, title: string): void {
        const db = getDb()
        const next = title.trim()
        db.prepare(`
            INSERT INTO chat_session_meta (session, title, pinned, pinned_at)
            VALUES (?, ?, 0, NULL)
            ON CONFLICT(session) DO UPDATE SET title = excluded.title
        `).run(session, next || null)
    },

    deleteSession(session: string): void {
        const db = getDb()
        const tx = db.transaction(() => {
            db.prepare('DELETE FROM chat_history WHERE session = ?').run(session)
            db.prepare('DELETE FROM chat_session_meta WHERE session = ?').run(session)
        })
        tx()
    },

    getMessages(session: string): ChatRecord[] {
        const db = getDb()
        return db.prepare(`
            SELECT * FROM chat_history
            WHERE session = ?
            ORDER BY id ASC
        `).all(session) as ChatRecord[]
    }
}