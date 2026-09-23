// src/main/toolSystem/plugins/webSearch.ts
// 联网搜索工具——方案文档要求的"信息获取"类工具第一位
// 用 Tavily API，专为 AI Agent 场景设计

import axios from 'axios'
import { BaseTool, ToolDefinition } from '../baseTool'
import { storeManager } from '../../store'

export class WebSearchTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'web_search',
        description: '当用户询问的内容涉及你不确定、知识库里没有、或者需要最新实时信息（如新闻、游戏最新活动、当前状态等）时，使用此工具联网搜索真实信息，而不是凭训练数据编造。',
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
                max_results: 3
            })

            const results = response.data.results as Array<{ title: string; content: string; url: string }>

            if (!results || results.length === 0) {
                return `没有搜索到关于"${query}"的相关结果。`
            }

            // 把搜索结果整理成简洁的文本，喂给模型做二次总结
            return results
                .map((r, i) => `${i + 1}. ${r.title}\n${r.content}\n来源: ${r.url}`)
                .join('\n\n')
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return `搜索失败: ${message}`
        }
    }
}