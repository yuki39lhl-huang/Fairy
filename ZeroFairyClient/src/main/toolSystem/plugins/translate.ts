// src/main/toolSystem/plugins/translate.ts
// 文本翻译工具——方案文档"文档处理"类工具之一
// 直接复用已接入的LLM做翻译，不需要额外的第三方翻译API

import { BaseTool, ToolDefinition } from '../baseTool'
import { createLLMAdapter } from '../../llmAdapter'

export class TranslateTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'translate_text',
    description: '将一段文字翻译成指定语言。当用户明确要求翻译内容时使用。',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '需要翻译的原文'
        },
        targetLanguage: {
          type: 'string',
          description: '目标语言，例如"英语"、"日语"、"中文"'
        }
      },
      required: ['text', 'targetLanguage']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const text = args.text as string
    const targetLanguage = args.targetLanguage as string

    if (!text || !targetLanguage) {
      return '翻译失败：缺少原文或目标语言。'
    }

    try {
      const adapter = createLLMAdapter()
      if (!adapter.hasApiKey()) {
        return '翻译失败：未配置模型API Key。'
      }

      let result = ''
      await adapter.chatStream(
        [
          {
            role: 'system',
            content: `你是专业翻译引擎。只输出翻译结果，不要任何解释、不要加引号、不要说"翻译如下"之类的话。`
          },
          {
            role: 'user',
            content: `将以下内容翻译成${targetLanguage}：\n${text}`
          }
        ],
        {
          onChunk: (chunk) => { result += chunk },
          onDone: () => {},
          onError: () => {}
        }
      )

      return result.trim() || '翻译失败：模型没有返回结果。'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `翻译出错: ${message}`
    }
  }
}