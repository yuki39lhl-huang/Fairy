// Fairy 内置参考音资产：开发态读项目 resources，打包后读 process.resourcesPath

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface FairyAssets {
  /** 云克隆用（≥10s） */
  refAudioPath: string
  /** 本地 GPT-SoVITS 用（短片段 + 精确文案） */
  localRefAudioPath: string
  promptText: string
  lang: string
}

const DEFAULT_PROMPT =
  '你好，叶顺光小姐，我已经将您的生活偏好数据分析报告发送给了助手二号。'

function resourcesRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')
}

export function getFairyAssets(): FairyAssets {
  const dir = path.join(resourcesRoot(), 'voice', 'fairy')
  const metaPath = path.join(dir, 'meta.json')

  let promptText = DEFAULT_PROMPT
  let lang = 'zh'
  let refFile = 'ref.wav'
  let localRefFile = 'ref_local.wav'

  try {
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        promptText?: string
        lang?: string
        refFile?: string
        localRefFile?: string
      }
      if (meta.promptText?.trim()) promptText = meta.promptText.trim()
      if (meta.lang?.trim()) lang = meta.lang.trim()
      if (meta.refFile?.trim()) refFile = meta.refFile.trim()
      if (meta.localRefFile?.trim()) localRefFile = meta.localRefFile.trim()
    }
  } catch (err) {
    console.warn('[fairyAssets] 读取 meta.json 失败，使用默认文案:', err)
  }

  const refAudioPath = path.join(dir, refFile)
  if (!fs.existsSync(refAudioPath)) {
    throw new Error(`Fairy 参考音频缺失: ${refAudioPath}`)
  }

  const localCandidate = path.join(dir, localRefFile)
  const localRefAudioPath = fs.existsSync(localCandidate) ? localCandidate : refAudioPath

  return { refAudioPath, localRefAudioPath, promptText, lang }
}
