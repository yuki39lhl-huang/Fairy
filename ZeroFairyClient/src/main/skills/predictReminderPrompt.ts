// 到点提示词：根据提醒事项预测 Fairy 要说的一句。
// 只作为技能存放。对话和手动创建都由提醒系统自动调用，不交给模型自己点。
import type { FairySkill } from '../skillSystem/types'
import { createLLMAdapter } from '../llmAdapter'

function withMaster(line: string): string {
  const text = line.trim()
  if (!text) return '主人，该留意一下了'
  if (text.includes('主人')) return text
  return `主人，${text}`
}

/** 模型没及时给出台词时的兜底，避免只念出两个字 */
export function fallbackReminderLine(message: string): string {
  const text = message.trim()
  if (!text) return withMaster('该留意一下了')
  if (text.includes('主人')) return text
  if (/[。！？!?]/.test(text) || text.length > 18) return withMaster(text)
  if (/(该|记得|别忘|到点|啦|吧|呀|哦)/.test(text) || /了$/.test(text)) return withMaster(text)
  const topic = text.replace(/^(请|帮我|提醒我|提醒你去|提醒你|去)/, '').trim() || text
  return withMaster(`该${topic}了`)
}

function cleanSpokenLine(raw: string): string {
  const line = raw
    .replace(/\[emotion:[^\]]+\]/gi, '')
    .replace(/^["「『]+|["」』]+$/g, '')
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean)
  if (!line) return ''
  return line.length > 80 ? line.slice(0, 80) : line
}

async function askLine(matter: string): Promise<string> {
  const adapter = createLLMAdapter()
  if (!adapter.hasApiKey()) return ''
  let result = ''
  let failed = false
  await adapter.chatStream(
    [
      {
        role: 'system',
        content:
          '你是绝区零的 Fairy。主人有一条即将到点的提醒。请只输出到点时要对他说的一句话。必须自然地称呼「主人」，例如「主人，该去洗澡了」。根据事项自己组织措辞，短、像当面说。不要只重复事项标题，也不要用「主人，提醒时间到了」这种固定开头。不要引号，不要解释，不要情绪标签。'
      },
      { role: 'user', content: `提醒事项：${matter}` }
    ],
    {
      onChunk: (chunk) => {
        result += chunk
      },
      onDone: () => undefined,
      onError: () => {
        failed = true
      }
    },
    undefined,
    { toolChoice: 'none' }
  )
  if (failed) return ''
  return withMaster(cleanSpokenLine(result))
}

export const predictReminderPromptSkill: FairySkill = {
  name: 'predict_reminder_prompt',
  title: '到点提示词',
  expose: false,
  description:
    '根据一条定时提醒的事项，预测到点要对主人说的一句话。由提醒系统在保存后自动调用，不在对话里交给模型触发。',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '提醒事项本身，例如「洗澡」「关窗」'
      }
    },
    required: ['message']
  },
  async execute(args) {
    const message = typeof args.message === 'string' ? args.message : ''
    try {
      const line = await askLine(message)
      return line || fallbackReminderLine(message)
    } catch (err) {
      console.warn('[Skill] 到点提示词预测失败，改用兜底:', err)
      return fallbackReminderLine(message)
    }
  }
}
