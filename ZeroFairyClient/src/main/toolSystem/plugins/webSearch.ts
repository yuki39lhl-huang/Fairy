// src/main/toolSystem/plugins/webSearch.ts
// 联网搜索：结果必须短而干净，否则跟进轮上下文膨胀 → 流式极慢 + DSML 泄漏

import axios from 'axios'
import { BaseTool, ToolDefinition } from '../baseTool'
import { storeManager } from '../../store'

const MAX_RESULTS = 2
const MAX_SNIPPET = 280
const MAX_TOTAL = 700

function cleanSnippet(text: string, limit: number): string {
  const compact = text
    .replace(/\s+/g, ' ')
    .replace(/\|[^|\n]{0,40}\|/g, ' ') // 粗略丢掉 markdown 表格残片
    .trim()
  if (compact.length <= limit) return compact
  return `${compact.slice(0, limit)}…`
}

export class WebSearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'web_search',
    description:
      '当用户询问的内容涉及你不确定、知识库里没有、或者需要最新实时信息（如新闻、游戏最新活动、当前状态等）时，使用此工具联网搜索真实信息，而不是凭训练数据编造。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的关键词，简洁精准，例如"绝区零最新版本"'
        }
      },
      required: ['query']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string
    const apiKey = storeManager.getApiKey('tavily')

    if (!apiKey) {
      return '联网搜索功能尚未配置API Key,请提醒主人先在设置页填写Tavily密钥。'
    }

    try {
      const response = await axios.post('https://api.tavily.com/search', {
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: false,
        include_raw_content: false,
        include_images: false
      })

      const results = response.data.results as Array<{
        title: string
        content: string
        url: string
      }>

      if (!results || results.length === 0) {
        return `没有搜索到关于"${query}"的相关结果。`
      }

      const parts: string[] = []
      let total = 0
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        const title = cleanSnippet(r.title || '', 80)
        const body = cleanSnippet(r.content || '', MAX_SNIPPET)
        const block = `${i + 1}. ${title}\n${body}\n来源: ${r.url}`
        if (total + block.length > MAX_TOTAL && parts.length > 0) break
        parts.push(block)
        total += block.length
      }

      return parts.join('\n\n')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `搜索失败: ${message}`
    }
  }
}
