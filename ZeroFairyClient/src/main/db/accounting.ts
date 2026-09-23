// src/main/db/accounting.ts
// 职责：记账数据的存取
import { getDb } from './index'

export interface AccountRecord {
  id?: number
  type: 'income' | 'expense'
  amount: number
  category: string
  note: string
  created_at?: number
}

export function initAccountingTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounting (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
      amount     REAL    NOT NULL,
      category   TEXT    NOT NULL,
      note       TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `)
}

export const accountingDb = {
  add(record: AccountRecord): void {
    const db = getDb()
    db.prepare(`
      INSERT INTO accounting (type, amount, category, note)
      VALUES (?, ?, ?, ?)
    `).run(record.type, record.amount, record.category, record.note ?? '')
  },

  getRecent(limit = 20): AccountRecord[] {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM accounting ORDER BY created_at DESC LIMIT ?
    `).all(limit) as AccountRecord[]
  },

  getSummary(): { totalIncome: number; totalExpense: number } {
    const db = getDb()
    const income = db.prepare(`SELECT SUM(amount) as total FROM accounting WHERE type = 'income'`).get() as { total: number | null }
    const expense = db.prepare(`SELECT SUM(amount) as total FROM accounting WHERE type = 'expense'`).get() as { total: number | null }
    return {
      totalIncome: income.total ?? 0,
      totalExpense: expense.total ?? 0
    }
  }
}