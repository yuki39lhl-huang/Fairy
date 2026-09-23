// src/main/toolSystem/plugins/setReminder.ts
import { BaseTool, ToolDefinition } from '../baseTool'
import { scheduleReminder } from '../../reminderSystem'

export class SetReminderTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'set_reminder',
    description:
      '设置一个定时提醒，到时间后弹出系统通知，并会出现在「定时任务」列表中。用于喝水、游戏活动、日程等提醒。只负责弹窗提示，不执行任何自动化操作。',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '提醒内容，例如"该刷体力了"或"该喝水了"'
        },
        delaySeconds: {
          type: 'number',
          description: '多少秒后提醒，例如用户说"10分钟后提醒我"就传600'
        }
      },
      required: ['message', 'delaySeconds']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const message = args.message as string
    const delaySeconds = Number(args.delaySeconds)

    if (!message?.trim() || !Number.isFinite(delaySeconds) || delaySeconds <= 0) {
      return '提醒设置失败：缺少提醒内容或时间。'
    }

    const record = scheduleReminder(message, delaySeconds, 'fairy')
    const fire = new Date(record.fireAt)
    const timeLabel = fire.toLocaleString('zh-CN', { hour12: false })
    const minutes = Math.round(delaySeconds / 60)
    const waitLabel =
      minutes >= 1 ? `约 ${minutes} 分钟` : `约 ${Math.round(delaySeconds)} 秒`

    return `已设置提醒（可在侧栏「定时任务」查看）：${waitLabel}后（${timeLabel}）会在右上角弹出 Fairy 提醒「${record.message}」。`
  }
}
