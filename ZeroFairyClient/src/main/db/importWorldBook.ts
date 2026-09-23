// src/main/db/importWorldBook.ts
// 职责：读取 docs/worldbook 下的所有 md 文件，解析后导入数据库
// 每个 md 文件 = 一条知识条目，标题取文件名，关键词从文件内的注释标注中提取

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { worldBookDb } from './gameWorldBook'

// 开发环境下 docs 在项目根目录；打包后需要放进 resources，这里先处理开发环境
function getWorldBookDir(): string {
  // app.getAppPath() 开发时指向项目根目录
  return join(app.getAppPath(), 'docs', 'worldbook')
}

// 解析单个 md 文件，提取标题、正文、关键词
function parseMarkdown(content: string, filename: string): {
  title: string
  content: string
  keywords: string
} {
  // 标题：取第一个 # 开头的行，否则用文件名
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '')

  // 关键词：取 <!-- keywords: xxx --> 这一行
  const keywordsMatch = content.match(/<!--\s*keywords:\s*(.+?)\s*-->/)
  const keywords = keywordsMatch ? keywordsMatch[1].trim() : ''

  // 正文：去掉标题行和关键词注释行，保留剩下内容
  const bodyContent = content
    .replace(/^#\s+.+$/m, '')
    .replace(/<!--\s*keywords:.+?-->/, '')
    .trim()

  return { title, content: bodyContent, keywords }
}

export function importWorldBookFromDocs(): void {
  const dir = getWorldBookDir()

  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.md'))
  } catch {
    console.warn('[WorldBook] docs/worldbook 目录不存在或为空:', dir)
    return
  }

  if (files.length === 0) {
    console.log('[WorldBook] 没有找到 md 文件')
    return
  }

  // 每次启动先清空重新导入（保证 docs 里的修改能同步到数据库）
  worldBookDb.clearAll()

  for (const file of files) {
    const fullPath = join(dir, file)
    const raw = readFileSync(fullPath, 'utf-8')
    const parsed = parseMarkdown(raw, file)

    worldBookDb.insert(parsed)
    console.log('[WorldBook] 已导入:', parsed.title)
  }

  console.log(`[WorldBook] 共导入 ${files.length} 条知识`)
}