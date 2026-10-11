// src/main/voice/speakScript.ts
// 把 Fairy 展示文案编排成适合朗读的 SpeakScript（不影响聊天框原文）

/** 这些词保持英文原文，不改中文谐音，也不拆成字母 */
const KEEP_AS_WRITTEN = new Set(['ai', 'fairy', 'random', 'play', 'randomplay'])

/** 英文 / 缩写读法表。查找时会先转小写，不必再写大写项。 */
const LEXICON: Record<string, string> = {
  ok: '欧克',
  hp: '体力',
  mp: '法力',
  cpu: 'C P U',
  gpu: 'G P U',
  api: 'A P I',
  url: '链接',
  tts: '语音合成',
  npc: 'N P C'
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
    const lower = word.toLowerCase()
    if (KEEP_AS_WRITTEN.has(lower)) return word
    if (Object.prototype.hasOwnProperty.call(LEXICON, word)) {
      return LEXICON[word]
    }
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

const DOMAIN_BODY =
  '(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:com|cn|org|net|edu|gov|io|co|wiki|me|app|dev|ai|tv|cc|jp|kr|uk|de|fr|ru|info|xyz|top|site)'

function looksLikeDomain(text: string): boolean {
  return new RegExp(`^${DOMAIN_BODY}$`, 'i').test(text.trim())
}

/** 链接只留在屏幕上，朗读稿里整段拿掉，不读网址，也不读成「链接」。 */
function stripLinks(text: string): string {
  let result = text
  result = result.replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)\s]+\)/gi, (_m, label: string) => {
    const name = label.trim()
    if (!name || /^https?:\/\//i.test(name) || /^www\./i.test(name) || looksLikeDomain(name)) return ''
    return name
  })
  result = result.replace(/https?:\/\/[^\s，。！？、；：)）」』\]]+/gi, '')
  result = result.replace(/\bwww\.[^\s，。！？、；：)）」』\]]+/gi, '')
  result = result.replace(
    new RegExp(String.raw`\b${DOMAIN_BODY}(?:\/[^\s，。！？、；：)）」』\]]*)?`, 'gi'),
    ''
  )
  return result
}

function normalizeSymbols(text: string): string {
  let result = stripLinks(text)
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
export function toSpeakText(raw: string): string {
  let result = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!result) return ''

  result = result.replace(/\[emotion:[a-zA-Z]+\]/g, '')
  result = normalizeSymbols(result)
  result = applyLexicon(result)
  result = normalizeNumbersAndTime(result)
  result = result.replace(/\s{2,}/g, ' ').trim()
  result = result.replace(/\s+([。！？，、])/g, '$1')
  result = result.replace(/([。！？])\s*[；;，,]+\s*/g, '$1')
  result = result.replace(/\s*[；;]+\s*/g, '，')
  result = result.replace(/[，,]{2,}/g, '，')
  result = result.replace(/^，+|，+$/g, '').trim()
  return result
}
