// Fairy 自己的技能：一个技能收一组方法，由对话里的函数调用触发。
import type { ToolDefinition } from '../toolSystem/baseTool'

export interface FairySkill {
  /** 模型调用时使用的名字 */
  name: string
  /** 界面上显示的技能名 */
  title: string
  description: string
  parameters: ToolDefinition['parameters']
  /**
   * 是否交给对话里的模型调用。
   * 缺省为 true。内部技能设为 false，只由系统自动执行。
   */
  expose?: boolean
  execute(args: Record<string, unknown>): Promise<string>
}
