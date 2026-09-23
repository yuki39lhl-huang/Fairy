// src/main/db/index.ts
// 职责：初始化 SQLite 数据库，创建所有表结构
// better-sqlite3 是同步API，不需要 async/await，类比 JDBC 同步操作

import Database from "better-sqlite3"
import { app } from "electron"
import { join } from "path"

// 数据库文件存放在用户数据目录和(electron-store 同一个地方)
// Windows: C:\Users\xxx\AppData\Roaming\ZeroFairyClient\
const DB_PATH = join(app.getPath('userData'), 'fairy.db')

let db: Database.Database
export function getDb(): Database.Database {
    if (!db) {
        db = new Database(DB_PATH)
        // 开启 WAL 模式: 提高并发读写性能
        db.pragma('journal_mode = WAL')
        initTables()
        console.log('[DB] 数据库初始化完成:', DB_PATH)
    }
    return db
}

function initTables(): void {
     // 聊天记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      session   TEXT    NOT NULL,
      role      TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
      content   TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `)

  // 长期记忆表（用户画像、对话沉淀）
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      importance INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `)

  // 游戏知识库表（RAG Worldbook）
  db.exec(`
    CREATE TABLE IF NOT EXISTS worldbook (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      keywords   TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `)

    console.log('[DB] 所有表初始化完成')
}
