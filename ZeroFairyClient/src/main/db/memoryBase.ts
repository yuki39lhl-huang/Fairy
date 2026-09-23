// src/main/db/memoryBase.ts
// 职责：用户长期记忆和画像的存取
// 每次对话结束后，提炼关键信息存入这里
// 下次对话时自动检索注入上下文

import { getDb } from './index'

export interface MemoryRecord {
  id?: number
  type: 'preference' | 'habit' | 'fact' | 'game'
  // preference：用户偏好（喜欢的游戏角色、玩法）
  // habit：对话习惯（常用的称呼、说话风格）
  // fact：用户基本信息（游戏进度、常问的问题）
  // game：游戏相关记忆（打了哪些空洞、喜欢哪些代理人）
  content: string
  importance: number   // 重要程度 1-5，越高越优先注入上下文
  created_at?: number
  updated_at?: number
}

export const memoryDb = {
  // 存入一条记忆
  save(record: MemoryRecord): void {
    const db = getDb()
    db.prepare(`
    INSERT INTO memory (type, content, importance)
    VALUES (?, ?, ?)
  `).run(record.type, record.content, record.importance ?? 1)
  },

  // 检索最重要的 N 条记忆（注入对话上下文用）
  getTopMemories(limit = 5): MemoryRecord[] {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM memory
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `).all(limit) as MemoryRecord[]
  },

  // 按类型查询
  getByType(type: string): MemoryRecord[] {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM memory
      WHERE type = ?
      ORDER BY importance DESC
    `).all(type) as MemoryRecord[]
  },

  // 更新记忆（发现已有相似内容时更新而不是重复插入）
  update(id: number, content: string, importance: number): void {
    const db = getDb()
    db.prepare(`
      UPDATE memory
      SET content = ?, importance = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).run(content, importance, id)
  },

  // 获取所有记忆（记忆查看页面用）
  getAll(): MemoryRecord[] {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM memory
      ORDER BY importance DESC, updated_at DESC
    `).all() as MemoryRecord[]
  },

  // 删除一条记忆
  delete(id: number): void {
    const db = getDb()
    db.prepare('DELETE FROM memory WHERE id = ?').run(id)
  },

  // memoryBase.ts 加一个方法
  existsContent(content: string): boolean {
    const db = getDb()
    const row = db.prepare('SELECT id FROM memory WHERE content = ?').get(content)
    return !!row
  }
}
