// src/main/toolSystem/plugins/generateExcel.ts
import ExcelJS from 'exceljs'
import { app } from 'electron'
import { join } from 'path'
import { BaseTool, ToolDefinition } from '../baseTool'

export class GenerateExcelTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'generate_excel',
    description: '生成一个Excel表格文件。当用户要求制作表格、汇总数据、生成清单时使用。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '文件名（不含扩展名），例如"本周开支清单"'
        },
        csvData: {
          type: 'string',
          description: '表格数据，用CSV格式表示：第一行是表头，后续每行是一条数据，字段用英文逗号分隔，行之间用换行符分隔。例如："日期,项目,金额\\n周一,午餐,30\\n周二,晚餐,45"'
        }
      },
      required: ['fileName', 'csvData']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const fileName = args.fileName as string
    const csvData = args.csvData as string

    if (!fileName || !csvData) {
      return '生成失败：缺少文件名或数据。'
    }

    try {
      // 把CSV文本解析成行列数据（扁平字符串参数，规避复杂嵌套结构触发的协议泄漏问题）
      const lines = csvData.trim().split('\n').map((line) => line.split(','))

      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Sheet1')

      lines.forEach((line, index) => {
        sheet.addRow(line)
        if (index === 0) sheet.getRow(1).font = { bold: true }
      })

      sheet.columns.forEach((col) => {
        col.width = 18
      })

      const outputDir = join(app.getPath('documents'), 'ZeroFairyClient')
      const fs = await import('fs')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const filePath = join(outputDir, `${fileName}.xlsx`)
      await workbook.xlsx.writeFile(filePath)

      return `已生成表格文件："${fileName}.xlsx"，保存在文档目录下的 ZeroFairyClient 文件夹里。`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `生成失败: ${message}`
    }
  }
}