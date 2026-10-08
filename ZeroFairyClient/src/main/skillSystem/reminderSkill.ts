// 定时任务 skill：增删改查都走 reminder，避免再新建一条把错误提醒留着。
import type { FairySkill } from './types'
import {
  cancelReminder,
  listReminders,
  resolvePendingReminder,
  scheduleReminder,
  updateReminder
} from '../reminderSystem'

function remainLabel(fireAt: number): string {
  const sec = Math.max(0, Math.round((fireAt - Date.now()) / 1000))
  if (sec < 60) return `${sec} 秒`
  const minutes = Math.round(sec / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`
}

function describePending(): string {
  const pending = listReminders().filter((r) => r.status === 'pending')
  if (pending.length === 0) return '当前没有进行中的提醒。'
  return pending
    .map((r) => `id=${r.id} | 约 ${remainLabel(r.fireAt)} 后 | ${r.message}`)
    .join('\n')
}

function describeAll(): string {
  const all = listReminders()
  if (all.length === 0) return '还没有任何提醒。'
  return all
    .map((r) => {
      const state = r.status === 'pending' ? '进行中' : r.status === 'cancelled' ? '已取消' : '已提醒'
      const when =
        r.status === 'pending' ? `约 ${remainLabel(r.fireAt)} 后` : new Date(r.fireAt).toLocaleString('zh-CN', { hour12: false })
      return `id=${r.id} | ${state} | ${when} | ${r.message}`
    })
    .join('\n')
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === 'string' ? (args[key] as string) : undefined
}

async function createReminder(args: Record<string, unknown>): Promise<string> {
  const message = str(args, 'message')
  const delaySeconds = Number(args.delaySeconds)
  if (!message?.trim() || !Number.isFinite(delaySeconds) || delaySeconds <= 0) {
    return '新建失败：需要提醒内容 message，以及大于 0 的 delaySeconds。'
  }
  const record = scheduleReminder(message.trim(), delaySeconds, 'fairy')
  const fire = new Date(record.fireAt)
  const timeLabel = fire.toLocaleString('zh-CN', { hour12: false })
  const minutes = Math.round(delaySeconds / 60)
  const waitLabel = minutes >= 1 ? `约 ${minutes} 分钟` : `约 ${Math.round(delaySeconds)} 秒`
  return `已新建提醒：${waitLabel}后（${timeLabel}）会按「${record.message}」来说。到点的那句话由你根据这件事组织，不会只念标题，也不会套「主人，提醒时间到了」。这是新增的一条，没有改动或删除其他提醒。`
}

async function updateOne(args: Record<string, unknown>): Promise<string> {
  const id = str(args, 'id')
  const match = str(args, 'match')
  const latest = args.latest === true
  const message = str(args, 'message')
  const delaySeconds = args.delaySeconds == null ? undefined : Number(args.delaySeconds)
  const target = resolvePendingReminder({
    id,
    match,
    latest: latest || (!id && !match)
  })
  if (!target) return `没有找到要修改的进行中提醒。\n${describePending()}`

  const result = updateReminder(target.id, {
    message,
    delaySeconds: Number.isFinite(delaySeconds) ? delaySeconds : undefined
  })
  if (!result.ok) return `${result.error}\n${describePending()}`

  const fire = new Date(result.record.fireAt).toLocaleString('zh-CN', { hour12: false })
  const timeNote = result.keptTime ? `到点时间未改，仍是 ${fire}` : `到点时间已改为 ${fire}`
  return `已修改原提醒，没有新建。${timeNote}。现在的内容是「${result.record.message}」。`
}

async function deleteOne(args: Record<string, unknown>): Promise<string> {
  const id = str(args, 'id')
  const match = str(args, 'match')
  const latest = args.latest === true
  if (!id?.trim() && !match?.trim() && !latest) {
    return `删除需要 id、match 或 latest。\n${describePending()}`
  }
  const target = resolvePendingReminder({ id, match, latest })
  if (!target) return `没有找到要删除的进行中提醒。\n${describePending()}`
  const message = target.message
  if (!cancelReminder(target.id)) {
    return `删除失败，这条提醒可能已经响过。\n${describePending()}`
  }
  return `已删除提醒「${message}」，到点不会再弹出。`
}

export const reminderSkill: FairySkill = {
  name: 'reminder',
  title: '定时任务',
  description:
    'Fairy 的定时任务技能，增删改查都用这一个入口。action 只能是 create（增）、list（查）、update（改）、delete（删）。主人要纠正、修改或取消已有提醒时，用 update 或 delete，禁止用 create 再加一条把错误的留着。只改文案时不要传 delaySeconds。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'update', 'delete'],
        description: 'create 新建，list 查询，update 修改原提醒，delete 删除原提醒'
      },
      message: {
        type: 'string',
        description:
          '提醒事项本身，例如「洗澡」「关窗」。到点怎么说会另按这件事组织，不要写成「主人，提醒时间到了」。create 必填；update 改文案时填写'
      },
      delaySeconds: {
        type: 'number',
        description: '多少秒后提醒。create 必填。update 不传则保持原来的到点时间'
      },
      id: { type: 'string', description: '要修改或删除的提醒 id，优先用系统提示里给出的 id' },
      match: {
        type: 'string',
        description: '用原文片段定位，例如「书记奥」。有多条命中时取最近创建的那条'
      },
      latest: {
        type: 'boolean',
        description: '为 true 时修改或删除最近创建的一条进行中提醒'
      },
      scope: {
        type: 'string',
        enum: ['pending', 'all'],
        description: '仅 list 使用。pending 只看进行中，all 含已提醒和已取消。默认 pending'
      }
    },
    required: ['action']
  },
  async execute(args) {
    const action = str(args, 'action')
    switch (action) {
      case 'create':
        return createReminder(args)
      case 'list':
        return str(args, 'scope') === 'all' ? describeAll() : describePending()
      case 'update':
        return updateOne(args)
      case 'delete':
        return deleteOne(args)
      default:
        return '定时任务技能需要 action：create、list、update、delete 四选一。'
    }
  }
}
