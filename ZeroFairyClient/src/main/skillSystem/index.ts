// Fairy 技能注册表。技能通过现有函数调用交给模型，一个技能对应一个入口。
import { BaseTool, ToolDefinition } from '../toolSystem/baseTool'
import type { FairySkill } from './types'
import { reminderSkill } from './reminderSkill'

export const allSkills: FairySkill[] = [reminderSkill]

class SkillTool extends BaseTool {
  definition: ToolDefinition

  constructor(private readonly skill: FairySkill) {
    super()
    this.definition = {
      name: skill.name,
      description: skill.description,
      parameters: skill.parameters
    }
  }

  execute(args: Record<string, unknown>): Promise<string> {
    return this.skill.execute(args)
  }
}

export function skillsToTools(): BaseTool[] {
  return allSkills.filter((skill) => skill.expose !== false).map((skill) => new SkillTool(skill))
}
