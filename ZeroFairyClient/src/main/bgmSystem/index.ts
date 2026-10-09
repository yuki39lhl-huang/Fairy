// src/main/bgmSystem/index.ts
// 扫描本地背景音乐目录；播放数据经 IPC 读成 Buffer（Blob URL），避免自定义协议无声

import { app } from 'electron'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { basename, extname, join } from 'path'
import { is } from '@electron-toolkit/utils'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a'])

export type BgmPlayMode = 'loop-one' | 'loop-all' | 'shuffle'

export interface BgmTrack {
  id: string
  fileName: string
  title: string
  artist: string
}

export interface BgmSettings {
  enabled: boolean
  playMode: BgmPlayMode
  bgmVolume: number
  fairyVoiceVolume: number
  lastTrackId: string | null
  /** 用户拖出来的曲目顺序，元素是文件名 */
  trackOrder: string[]
}

/** 网易云常见命名：作者 - 歌名.ext */
export function parseTrackMeta(fileName: string): { title: string; artist: string } {
  const base = basename(fileName, extname(fileName))
  const sep = ' - '
  const idx = base.indexOf(sep)
  if (idx <= 0) {
    return { title: base || fileName, artist: '未知艺术家' }
  }
  return {
    artist: base.slice(0, idx).trim() || '未知艺术家',
    title: base.slice(idx + sep.length).trim() || base
  }
}

export function getBgmDir(): string {
  if (is.dev) {
    const candidates = [
      join(app.getAppPath(), '..', 'mp3', 'back-music'),
      join(process.cwd(), '..', 'mp3', 'back-music'),
      join(process.cwd(), 'mp3', 'back-music'),
      'E:\\Fairy\\Phaethon\\mp3\\back-music'
    ]
    for (const dir of candidates) {
      if (existsSync(dir)) return dir
    }
    return candidates[0]
  }

  const packaged = join(process.resourcesPath, 'bgm')
  if (existsSync(packaged)) return packaged
  return join(app.getPath('userData'), 'bgm')
}

export function listBgmTracks(): BgmTrack[] {
  const dir = getBgmDir()
  if (!existsSync(dir)) {
    console.warn('[bgm] 目录不存在:', dir)
    return []
  }

  const files = readdirSync(dir)
    .filter((name) => AUDIO_EXT.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))

  return files.map((fileName) => {
    const meta = parseTrackMeta(fileName)
    return {
      id: fileName,
      fileName,
      title: meta.title,
      artist: meta.artist
    }
  })
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.flac':
      return 'audio/flac'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.m4a':
      return 'audio/mp4'
    default:
      return 'application/octet-stream'
  }
}

/** 读取曲目二进制，供渲染进程 Blob 播放 */
export function readBgmTrack(fileName: string): { data: Buffer; mime: string; fileName: string } {
  const safe = basename(String(fileName || ''))
  if (!safe || safe !== fileName) {
    throw new Error('非法曲目名')
  }
  const filePath = join(getBgmDir(), safe)
  if (!existsSync(filePath)) {
    throw new Error(`找不到曲目: ${safe}`)
  }
  const data = readFileSync(filePath)
  return { data, mime: mimeForExt(extname(safe)), fileName: safe }
}

