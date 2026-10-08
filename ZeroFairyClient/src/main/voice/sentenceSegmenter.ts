// src/main/voice/sentenceSegmenter.ts
// 按完整句子切给 TTS。逗号不切开，避免听起来一段一段；只有特别长才在逗号处收一刀。

const SENTENCE_END = /[。！？!?…]+/

/** 短句并进下一句，减少「好的。」这种碎音 */
const MIN_EMIT = 18
/** 超过这个长度仍没有句号时，才允许在逗号处切开 */
const FORCE_AT = 120

function visibleLen(text: string): number {
  return text.replace(/\s+/g, '').length
}

function findCut(buffer: string): number {
  const hard = buffer.match(SENTENCE_END)
  if (hard && hard.index !== undefined) {
    return hard.index + hard[0].length
  }

  if (visibleLen(buffer) < FORCE_AT) return -1

  let lastComma = -1
  const re = /[，、；;]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(buffer))) {
    const end = match.index + match[0].length
    if (visibleLen(buffer.slice(0, end)) <= FORCE_AT) lastComma = end
    else break
  }
  if (lastComma > 0) return lastComma
  return Math.min(buffer.length, FORCE_AT)
}

export function createSentenceSegmenter(): {
  feed: (chunk: string) => string[]
  flush: () => string
} {
  let buffer = ''
  let held = ''

  function take(raw: string, force: boolean): string | null {
    const piece = `${held}${raw}`.replace(/\s+/g, ' ').trim()
    held = ''
    if (!piece) return null
    if (!force && visibleLen(piece) < MIN_EMIT) {
      held = piece
      return null
    }
    return piece
  }

  function feed(chunk: string): string[] {
    buffer += chunk.replace(/\r\n/g, '\n')
    const sentences: string[] = []

    while (buffer.length > 0) {
      const cut = findCut(buffer)
      if (cut < 0) break
      const raw = buffer.slice(0, cut)
      buffer = buffer.slice(cut)
      const sentence = take(raw, false)
      if (sentence) sentences.push(sentence)
    }

    return sentences
  }

  function flush(): string {
    const rest = `${held}${buffer}`.replace(/\s+/g, ' ').trim()
    held = ''
    buffer = ''
    return rest
  }

  return { feed, flush }
}
