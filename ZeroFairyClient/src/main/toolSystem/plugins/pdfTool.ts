// src/main/toolSystem/plugins/pdfTool.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { BaseTool, ToolDefinition } from '../baseTool'

/**
 * 转义HTML特殊字符。docx不需要这步(Paragraph/TextRun是纯数据对象)，
 * 但这里是拼字符串生成HTML，content里如果出现 < > & 会破坏标签结构，必须转义。
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 和wordTool同一套极简Markdown语法解析，输出目标从docx段落换成HTML字符串。
 * 语法不变：# 一级标题，## 二级标题，- 列表项，空行，普通段落。
 */
function parseMarkdownToHtml(content: string): string {
  const lines = content.split('\n')
  const parts: string[] = []
  let inList = false

  const closeListIfOpen = () => {
    if (inList) {
      parts.push('</ul>')
      inList = false
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line === '') {
      closeListIfOpen()
      parts.push('<div class="spacer"></div>')
      continue
    }
    if (line.startsWith('## ')) {
      closeListIfOpen()
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      closeListIfOpen()
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>')
        inList = true
      }
      parts.push(`<li>${escapeHtml(line.slice(2))}</li>`)
      continue
    }
    closeListIfOpen()
    parts.push(`<p>${escapeHtml(line)}</p>`)
  }
  closeListIfOpen()
  return parts.join('\n')
}

function buildHtmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 14px; line-height: 1.8; color: #222; }
  h1 { font-size: 22px; margin: 20px 0 12px; }
  h2 { font-size: 18px; margin: 16px 0 10px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 24px; }
  li { margin: 4px 0; }
  .spacer { height: 10px; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export class GeneratePdfTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'generate_pdf',
    description:
      '生成一个PDF文档。content参数使用简化Markdown语法：# 一级标题，## 二级标题，- 列表项，普通行为正文段落，空行产生段落间距。适用于生成正式报告、说明文档等需要固定排版的场景。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '文件名（不含扩展名），例如"活动说明"'
        },
        content: {
          type: 'string',
          description:
            '文档正文内容，用简化Markdown语法表示层级：一级标题用"# 标题"，二级标题用"## 标题"，列表项用"- 内容"，普通段落直接写文字，元素之间用换行符分隔。'
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

    const fs = await import('fs')
    const tempHtmlPath = join(tmpdir(), `zerofairy-pdf-${randomUUID()}.html`)
    let win: BrowserWindow | null = null

    try {
      const bodyHtml = parseMarkdownToHtml(content)
      fs.writeFileSync(tempHtmlPath, buildHtmlDocument(bodyHtml), 'utf-8')

      // 隐藏窗口，纯粹借用Electron内置Chromium的排版+打印能力，不需要nodeIntegration
      // （这个页面不用访问Node API也不用和主进程通信，保持默认沙盒最安全）
      win = new BrowserWindow({ show: false })

      // 复用坑4学到的教训：不能在流程"刚启动"时就resolve，
      // 必须等真正的完成事件(did-finish-load)触发才行，否则printToPDF会打印出空白页
      await new Promise<void>((resolve, reject) => {
        win!.webContents.once('did-finish-load', () => resolve())
        win!.webContents.once('did-fail-load', (_event, code, description) => {
          reject(new Error(`页面加载失败: ${description} (${code})`))
        })
        win!.loadFile(tempHtmlPath)
      })

      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: false,
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } // 单位英寸，视觉效果不对就调这几个数
      })

      const outputDir = join(app.getPath('documents'), 'ZeroFairyClient')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
      const filePath = join(outputDir, `${safeFileName}.pdf`)
      await fs.promises.writeFile(filePath, pdfBuffer)

      return `已生成PDF文档:${safeFileName}.pdf,保存在文档目录下的 ZeroFairyClient 文件夹里。`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `生成失败: ${message}`
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
      await fs.promises.unlink(tempHtmlPath).catch(() => {})
    }
  }
}