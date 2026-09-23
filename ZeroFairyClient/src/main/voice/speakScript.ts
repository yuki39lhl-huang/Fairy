// src/main/voice/speakScript.ts
// 把 Fairy 展示文案编排成适合朗读的 SpeakScript（不影响聊天框原文）

export interface SpeakScriptContext {
  /** 场景：聊天句 / 提醒 / 空闲问候 —— 便于后续差异化规则 */
  scene?: 'chat' | 'reminder' | 'idle' | 'generic'
}

/** 英文 / 缩写读法表（可继续扩充；查不到再走通用拉丁规则） */
const LEXICON: Record<string, string> = {
  ok: '欧克',
  OK: '欧克',
  fairy: '菲莉',
  Fairy: '菲莉',
  FAIRY: '菲莉',
  hp: '体力',
  HP: '体力',
  mp: '法力',
  MP: '法力',
  cpu: 'C P U',
  CPU: 'C P U',
  gpu: 'G P U',
  GPU: 'G P U',
  api: 'A P I',
  API: 'A P I',
  url: '链接',
  URL: '链接',
  http: '链接',
  https: '链接',
  www: '',
  ai: 'A I',
  AI: 'A I',
  tts: '语音合成',
  TTS: '语音合成',
  npc: 'N P C',
  NPC: 'N P C'
}

const DIGIT_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function digitsToZh(numStr: string): string {
  return [...numStr].map((ch) => (/[0-9]/.test(ch) ? DIGIT_ZH[Number(ch)] : ch)).join('')
}

function numberToZh(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n < 0) return `负${numberToZh(-n)}`
  if (n < 10) return DIGIT_ZH[n]
  if (n < 20) return n === 10 ? '十' : `十${DIGIT_ZH[n % 10]}`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `${DIGIT_ZH[tens]}十${ones ? DIGIT_ZH[ones] : ''}`
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    if (rest === 0) return `${DIGIT_ZH[hundreds]}百`
    if (rest < 10) return `${DIGIT_ZH[hundreds]}百零${DIGIT_ZH[rest]}`
    return `${DIGIT_ZH[hundreds]}百${numberToZh(rest)}`
  }
  // 过大数字逐位读，避免乱念
  return digitsToZh(String(Math.trunc(n)))
}

function applyLexicon(text: string): string {
  return text.replace(/\b[A-Za-z][A-Za-z0-9+._-]{0,31}\b/g, (word) => {
    if (Object.prototype.hasOwnProperty.call(LEXICON, word)) {
      return LEXICON[word]
    }
    const lower = word.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(LEXICON, lower)) {
      return LEXICON[lower]
    }
    // 纯大写缩写：逐字母
    if (/^[A-Z]{2,6}$/.test(word)) {
      return [...word].join(' ')
    }
    // 普通英文词：空格隔开字母，减轻「粘成乱音」；短词保留尝试整词
    if (word.length <= 4 && /^[A-Za-z]+$/.test(word)) {
      return word
    }
    if (/^[A-Za-z]+$/.test(word) && word.length > 4) {
      return [...word].join(' ')
    }
    return word
  })
}

function normalizeSymbols(text: string): string {
  let result = text
  result = result.replace(/https?:\/\/\S+/gi, '链接')
  result = result.replace(/\bwww\.\S+/gi, '链接')
  result = result.replace(/[（(][^）)]*[）)](?=[。！？…]|\s*$)/g, '')
  result = result.replace(/[-_*=~]{2,}/g, '，')
  result = result.replace(/[—–―−]+/g, '，')
  result = result.replace(/…+/g, '，')
  result = result.replace(/[~～]+/g, '')
  result = result.replace(/[*#`|>{}[\]\\\/]+/g, ' ')
  result = result.replace(/[【】「」『』《》〈〉]/g, '')
  result = result.replace(/@/g, '艾特')
  result = result.replace(/&/g, '和')
  result = result.replace(/%/g, '百分之')
  result = result.replace(/\+/g, '加')
  result = result.replace(/=/g, '等于')
  return result
}

function normalizeNumbersAndTime(text: string): string {
  let result = text
  // 17:30 / 7:05
  result = result.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_m, h: string, m: string) => {
    const hour = numberToZh(Number(h))
    const minute = Number(m)
    if (minute === 0) return `${hour}点`
    return `${hour}点${numberToZh(minute)}`
  })
  // 20秒 / 5分钟
  result = result.replace(/(\d+)\s*秒/g, (_m, n: string) => `${numberToZh(Number(n))}秒`)
  result = result.replace(/(\d+)\s*分钟/g, (_m, n: string) => `${numberToZh(Number(n))}分钟`)
  result = result.replace(/(\d+)\s*小时/g, (_m, n: string) => `${numberToZh(Number(n))}小时`)
  // 独立整数（避免改掉已处理片段里的数字汉字）
  result = result.replace(/\b(\d{1,4})\b/g, (m) => numberToZh(Number(m)))
  return result
}

/**
 * 展示文案 → 朗读稿。
 * 后续加厂家时仍应先走这一层，再交给具体 TTS Provider。
 */
export function toSpeakText(raw: string, _ctx: SpeakScriptContext = {}): string {
  let result = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!result) return ''

  result = normalizeSymbols(result)
  result = applyLexicon(result)
  result = normalizeNumbersAndTime(result)
  result = result.replace(/\s{2,}/g, ' ').trim()
  result = result.replace(/[，,]{2,}/g, '，')
  result = result.replace(/^，+|，+$/g, '').trim()
  return result
}
