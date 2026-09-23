// src/main/toolSystem/plugins/setReminder.ts
// 定时弹窗提醒——方案文档明确要求"仅弹窗通知，无批量自动执行任务"
// 用 Electron 原生 Notification API 弹出系统通知

import { Notification } from 'electron'
import { BaseTool, ToolDefinition } from '../baseTool'

export class SetReminderTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'set_reminder',
    description: '设置一个定时提醒，到时间后弹出系统通知。用于游戏活动提醒、日程提醒等。只负责弹窗提示，不执行任何自动化操作。',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '提醒内容，例如"该刷体力了"'
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
    const delaySeconds = args.delaySeconds as number

    if (!message || !delaySeconds || delaySeconds <= 0) {
      return '提醒设置失败：缺少提醒内容或时间。'
    }

    // 用最基础的 setTimeout 定时，时间到了就弹系统通知
    // 注意：这是内存级定时器，应用重启后会丢失，符合"轻量化"定位
    setTimeout(() => {
      new Notification({
        title: 'Fairy 提醒',
        body: message
      }).show()
    }, delaySeconds * 1000)

    const minutes = Math.round(delaySeconds / 60)
    return `已设置提醒，约${minutes > 0 ? minutes + '分钟' : delaySeconds + '秒'}后会弹窗提醒你："${message}"`
  }
}