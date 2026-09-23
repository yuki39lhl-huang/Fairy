// src/main/voice/sentenceSegmenter.ts
// 把流式到达的文本chunk，按句子结束符切成完整句子，方便逐句丢给TTS合成，
// 不用等LLM把整段回复全部生成完才开始合成语音

const SENTENCE_END_PATTERN = /[。！？…]+/

export function createSentenceSegmenter(): {
  feed: (chunk: string) => string[]
  flush: () => string
} {
  let buffer = ''

  function feed(chunk: string): string[] {
    buffer += chunk
    const sentences: string[] = []

    while (true) {
      const match = buffer.match(SENTENCE_END_PATTERN)
      if (!match || match.index === undefined) break
      const endIndex = match.index + match[0].length
      const sentence = buffer.slice(0, endIndex).trim()
      buffer = buffer.slice(endIndex)
      if (sentence) sentences.push(sentence)
    }

    return sentences
  }

  function flush(): string {
    const remaining = buffer.trim()
    buffer = ''
    return remaining
  }

  return { feed, flush }
}