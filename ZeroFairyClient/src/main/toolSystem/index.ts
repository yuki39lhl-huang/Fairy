// src/main/toolSystem/index.ts
// 工具注册表：所有工具插件在这里注册，以后新增工具只需在这里加一行

import { BaseTool } from './baseTool'
import { GetCurrentTimeTool } from './plugins/getCurrentTime'
import { WebSearchTool } from './plugins/webSearch'
import { SetReminderTool } from './plugins/setReminder'
import { TranslateTool } from './plugins/translate'
import { AddAccountRecordTool, GetAccountSummaryTool } from './plugins/accounting'
import { GenerateExcelTool } from './plugins/generateExcel'
import { GenerateWordTool } from './plugins/wordTool'
import { GeneratePdfTool } from './plugins/pdfTool'
import { GeneratePptTool } from './plugins/pptTool'

export const allTools: BaseTool[] = [
    new GetCurrentTimeTool(),
    new WebSearchTool(),
    new SetReminderTool(),
    new TranslateTool(),
    new AddAccountRecordTool(),
    new GetAccountSummaryTool(),
    new GenerateExcelTool(),
    new GenerateWordTool(),
    new GeneratePdfTool(),
    new GeneratePptTool(),
]

export function getToolByName(name: string): BaseTool | undefined {
    return allTools.find(t => t.definition.name === name)
}