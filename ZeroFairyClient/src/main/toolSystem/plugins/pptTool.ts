// src/main/toolSystem/plugins/pptTool.ts
import pptxgen from 'pptxgenjs'
import { app } from 'electron'
import { join } from 'path'
import { BaseTool, ToolDefinition } from '../baseTool'

interface SlideContent {
  title: string
  bullets: string[]
}

/**
 * 和word/pdf共用同一套简化Markdown语法，但语义不同：
 * 每个"# 标题"代表开启一张新幻灯片(而不是文档里的一级标题)。
 * "## "、"- "、普通行都当作该幻灯片内的一条内容(统一渲染成项目符号)。
 * 空行在PPT场景没有视觉意义，直接跳过。
 */
function parseMarkdownToSlides(content: string): SlideContent[] {
  const lines = content.split('\n')
  const slides: SlideContent[] = []
  let current: SlideContent | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') continue

    if (line.startsWith('# ')) {
      current = { title: line.slice(2), bullets: [] }
      slides.push(current)
      continue
    }

    // 兜底：如果内容一开始没写"# 标题"，先建一张无标题页承接内容，避免丢失
    if (!current) {
      current = { title: '', bullets: [] }
      slides.push(current)
    }

    if (line.startsWith('## ')) {
      current.bullets.push(line.slice(3))
      continue
    }
    if (line.startsWith('- ')) {
      current.bullets.push(line.slice(2))
      continue
    }
    current.bullets.push(line)
  }

  return slides
}

export class GeneratePptTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'generate_ppt',
    description:
      '生成一个PowerPoint幻灯片(.pptx)。content参数用简化Markdown语法：每个"# 标题"代表新开一张幻灯片(标题就是这张幻灯片的标题)，标题下方的"- 内容"或普通行会成为这张幻灯片的条目。讲多个要点时应该拆成多张幻灯片(多个# )，不要把所有内容塞进一张。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '文件名（不含扩展名），例如"项目汇报"'
        },
        content: {
          type: 'string',
          description:
            '幻灯片内容，用简化Markdown语法：# 标题开启新的一页，- 内容或普通行是这一页的条目。例如："# 开场\\n- 大家好\\n\\n# 议程\\n- 进度回顾\\n- 下一步计划"'
        }
      },
      required: ['fileName', 'content']
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const fileName = args.fileName as string
    const content = args.content as string

    if (!fileName || !content) {
      return '生成失败：缺少文件名或幻灯片内容。'
    }

    try {
      const slides = parseMarkdownToSlides(content)
      if (slides.length === 0) {
        return '生成失败：解析后没有任何幻灯片内容。'
      }

      const pptx = new pptxgen()
      pptx.layout = 'LAYOUT_WIDE' // 13.33x7.5英寸，16:9宽屏

      for (const slideData of slides) {
        const slide = pptx.addSlide()

        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5,
            y: 0.4,
            w: 12.3,
            h: 1,
            fontSize: 32,
            bold: true,
            fontFace: 'Microsoft YaHei',
            color: '363636' // 注意：不能写成'#363636'，带#号会导致文件损坏打不开
          })
        }

        if (slideData.bullets.length > 0) {
          const bulletItems = slideData.bullets.map((text, index) => ({
            text,
            options: {
              bullet: true,
              breakLine: index < slideData.bullets.length - 1
            }
          }))
          slide.addText(bulletItems, {
            x: 0.7,
            y: 1.6,
            w: 11.9,
            h: 5.3,
            fontSize: 20,
            fontFace: 'Microsoft YaHei',
            color: '444444'
          })
        }
      }

      const outputDir = join(app.getPath('documents'), 'ZeroFairyClient')
      const fs = await import('fs')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
      const filePath = join(outputDir, `${safeFileName}.pptx`)

      await pptx.writeFile({ fileName: filePath })

      return `已生成PPT文档:"${safeFileName}.pptx"，保存在文档目录下的 ZeroFairyClient 文件夹里，共 ${slides.length} 页。`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `生成失败: ${message}`
    }
  }
}