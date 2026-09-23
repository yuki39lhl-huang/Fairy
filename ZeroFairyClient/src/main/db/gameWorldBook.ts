// src/main/db/gameWorldBook.ts
// 职责：绝区零游戏知识库的存取（RAG 检索用）
// 存放剧情、角色、空洞、装备等游戏资料分片

import { getDb } from './index'

export interface WorldBookEntry {
  id?: number
  title: string
  content: string
  keywords: string   // 逗号分隔的关键词，用于检索
  created_at?: number
}

export const worldBookDb = {
  // 导入一条知识条目
  insert(entry: WorldBookEntry): void {
    const db = getDb()
    db.prepare(`
    INSERT INTO worldbook (title, content, keywords)
    VALUES (?, ?, ?)
  `).run(entry.title, entry.content, entry.keywords ?? '')
  },

 // 关键词召回：条目的关键词列表里只要有一个出现在用户问题中，就命中
search(query: string, limit = 3): WorldBookEntry[] {
  const db = getDb()
  const all = db.prepare(`SELECT * FROM worldbook`).all() as WorldBookEntry[]

  const matched = all.filter(entry => {
    const keywords = entry.keywords.split(',').map(k => k.trim()).filter(Boolean)
    return keywords.some(kw => query.includes(kw))
  })
  return matched.slice(0, limit)
},

  // 获取所有条目（知识库管理页面用）
  getAll(): WorldBookEntry[] {
    const db = getDb()
    return db.prepare(`
      SELECT id, title, keywords, created_at FROM worldbook
      ORDER BY created_at DESC
    `).all() as WorldBookEntry[]
  },

  // 删除一条条目
  delete(id: number): void {
    const db = getDb()
    db.prepare('DELETE FROM worldbook WHERE id = ?').run(id)
  },

  // 清空所有知识条目（重新导入前调用）
  clearAll(): void {
    const db = getDb()
    db.prepare('DELETE FROM worldbook').run()
  }
}