// src/main/voice/ttsTextSanitizer.ts
/**
 * 把Fairy回复清洗成适合朗读的版本，只用于送进TTS前，
 * 不影响聊天框显示的原文（原文该有括号还是有括号）
 */
export function sanitizeTextForTTS(text: string): string {
  let result = text
  // 去掉连续2个及以上的装饰性符号：---- **** ==== 之类
  result = result.replace(/[-_*=~]{2,}/g, '')
  // 只清洗"贴着句末"的括号内容(舞台指示/表情描述通常这么用)
  // 句子中间嵌着的括号(比如"合法（大概）寄居"这种真实语义插入语)保留，正常朗读
  result = result.replace(/[（(][^）)]*[）)](?=[。！？…]|\s*$)/g, '')
  // 清理因为删除内容留下的多余空白
  result = result.replace(/\s{2,}/g, ' ').trim()
  return result
}