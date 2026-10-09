// 联网搜索：深搜 + 打开最相关的页面核对。总长度仍要封顶，避免跟进轮被撑爆。

import axios from 'axios'
import { BaseTool, ToolDefinition } from '../baseTool'
import { storeManager } from '../../store'

const MAX_RESULTS = 5
const OPEN_PAGES = 2
const MAX_SNIPPET = 220
const MAX_PAGE = 480
const MAX_ANSWER = 360
const MAX_TOTAL = 2200

interface SearchHit {
  title: string
  content: string
  url: string
  score?: number
}

function cleanText(text: string, limit: number): string {
  const compact = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|[^|\n]{0,40}\|/g, ' ')
    .trim()
  if (compact.length <= limit) return compact
  return `${compact.slice(0, limit)}…`
}

async function openPages(apiKey: string, urls: string[]): Promise<Map<string, string>> {
  const excerpts = new Map<string, string>()
  if (urls.length === 0) return excerpts
  try {
    const response = await axios.post(
      'https://api.tavily.com/extract',
      { api_key: apiKey, urls },
      { timeout: 12000 }
    )
    const pages = (response.data?.results ?? []) as Array<{ url?: string; raw_content?: string }>
    for (const page of pages) {
      if (!page.url || !page.raw_content) continue
      excerpts.set(page.url, cleanText(page.raw_content, MAX_PAGE))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[web_search] 打开网页失败，仅保留搜索摘要:', message)
  }
  return excerpts
}

export class WebSearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'web_search',
    description:
      '当问题涉及不确定、知识库没有、或需要最新信息（新闻、游戏活动、版本、当前状态）时使用。会深搜并打开最相关的网页核对。query 要具体，带上作品名、版本或时间，不要只丢一个宽泛的词。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '具体搜索词，例如「绝区零 2.6 版本 卡池 时间」'
        }
      },
      required: ['query']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? '').trim()
    const apiKey = storeManager.getApiKey('tavily')

    if (!query) return '搜索词是空的。'
    if (!apiKey) {
      return '联网搜索功能尚未配置API Key,请提醒主人先在设置页填写Tavily密钥。'
    }

    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: apiKey,
          query,
          search_depth: 'advanced',
          max_results: MAX_RESULTS,
          include_answer: true,
          include_raw_content: false,
          include_images: false
        },
        { timeout: 15000 }
      )

      const results = ((response.data?.results ?? []) as SearchHit[])
        .filter((item) => item.url)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, MAX_RESULTS)

      if (results.length === 0) {
        return `没有搜索到关于"${query}"的相关结果。`
      }

      const pages = await openPages(
        apiKey,
        results.slice(0, OPEN_PAGES).map((item) => item.url)
      )

      const parts: string[] = []
      const answer = cleanText(String(response.data?.answer ?? ''), MAX_ANSWER)
      if (answer) parts.push(`检索结论：\n${answer}`)

      const sourceLines = results.map((item, index) => {
        const title = cleanText(item.title || '无标题', 80)
        const body = cleanText(item.content || '', MAX_SNIPPET)
        return `${index + 1}. ${title}\n${body}\n来源: ${item.url}`
      })
      parts.push(`来源：\n${sourceLines.join('\n\n')}`)

      const opened = results
        .slice(0, OPEN_PAGES)
        .map((item, index) => {
          const excerpt = pages.get(item.url)
          if (!excerpt) return ''
          return `${index + 1}. ${item.url}\n${excerpt}`
        })
        .filter(Boolean)
      if (opened.length > 0) parts.push(`已打开核对：\n${opened.join('\n\n')}`)

      parts.push('只根据以上材料回答。材料里没有的事实不要补充，并在用到的事实后附上来源网址。')

      let text = parts.join('\n\n')
      if (text.length > MAX_TOTAL) text = `${text.slice(0, MAX_TOTAL)}…`
      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `搜索失败: ${message}`
    }
  }
}
