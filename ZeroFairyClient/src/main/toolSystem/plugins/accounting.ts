// src/main/toolSystem/plugins/accounting.ts
import { BaseTool, ToolDefinition } from '../baseTool'
import { accountingDb } from '../../db/accounting'

export class AddAccountRecordTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'add_account_record',
    description: '记录一笔收入或支出。当用户说"记一下花了多少钱"、"记账"等时使用。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '类型："income"表示收入，"expense"表示支出' },
        amount: { type: 'number', description: '金额，正数' },
        category: { type: 'string', description: '分类，例如"餐饮"、"交通"、"工资"' },
        note: { type: 'string', description: '备注说明' }
      },
      required: ['type', 'amount', 'category']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const type = args.type as 'income' | 'expense'
    const amount = args.amount as number
    const category = args.category as string
    const note = (args.note as string) ?? ''

    if (!type || !amount || !category) {
      return '记账失败：缺少必要信息。'
    }

    accountingDb.add({ type, amount, category, note })
    const label = type === 'income' ? '收入' : '支出'
    return `已记录一笔${label}:${amount}元，分类"${category}"${note ? '，备注：' + note : ''}`
  }
}

export class GetAccountSummaryTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'get_account_summary',
    description: '查询当前的收支总览（总收入、总支出）。当用户问"我花了多少钱"、"账本情况怎么样"时使用。',
    parameters: { type: 'object', properties: {} }
  }

  async execute(): Promise<string> {
    const summary = accountingDb.getSummary()
    const balance = summary.totalIncome - summary.totalExpense
    return `总收入：${summary.totalIncome}元，总支出：${summary.totalExpense}元，结余：${balance}元`
  }
}