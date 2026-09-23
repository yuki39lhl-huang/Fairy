// src/main/toolSystem/plugins/wordTool.ts
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import { app } from 'electron'
import { join } from 'path'
import { BaseTool, ToolDefinition } from '../baseTool'

/**
 * 把极简Markdown子集解析成docx段落数组。
 * 只识别: # / ## 标题，- 列表项，空行，普通段落。
 * 刻意不做更复杂的语法（加粗/表格等），思路跟generateExcel的csvData一致：
 * 用一个扁平字符串承载结构化信息，工具内部自己解析，规避嵌套参数触发DSML泄漏。
 */
function parseMarkdownToDocxElements(content: string): Paragraph[] {
  const lines = content.split('\n')
  const paragraphs: Paragraph[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line === '') {
      paragraphs.push(new Paragraph({ text: '' }))
      continue
    }

    if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }))
      continue
    }

    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }))
      continue
    }

    if (line.startsWith('- ')) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: '• ' + line.slice(2) })] }))
      continue
    }

    paragraphs.push(new Paragraph({ text: line }))
  }

  return paragraphs
}

export class GenerateWordTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'generate_word',
    description: '生成一个Word文档(.docx)。当用户要求整理笔记、生成报告、总结成正式文档时使用。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '文件名（不含扩展名），例如"会议纪要"'
        },
        content: {
          type: 'string',
          description:
            '文档正文内容,用简化Markdown语法表示层级:一级标题用"# 标题"，二级标题用"## 标题"，列表项用"- 内容"，普通段落直接写文字，元素之间用换行符分隔。例如："# 会议纪要\\n## 议程\\n- 讨论进度\\n- 分配任务\\n\\n会议于下午三点召开。"'
        }
      },
      required: ['fileName', 'content']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const fileName = args.fileName as string
    const content = args.content as string

    if (!fileName || !content) {
      return '生成失败：缺少文件名或文档内容。'
    }

    try {
      const paragraphs = parseMarkdownToDocxElements(content)

      const doc = new Document({
        sections: [{ properties: {}, children: paragraphs }]
      })

      const buffer = await Packer.toBuffer(doc)

      const outputDir = join(app.getPath('documents'), 'ZeroFairyClient')
      const fs = await import('fs')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      // Windows文件名不允许这几个字符，口述整理场景下标题可能带冒号之类的符号，这里兜底过滤
      const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
      const filePath = join(outputDir, `${safeFileName}.docx`)

      await fs.promises.writeFile(filePath, buffer)

      return `已生成Word文档:"${safeFileName}.docx"，保存在文档目录下的 ZeroFairyClient 文件夹里。`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `生成失败: ${message}`
    }
  }
}