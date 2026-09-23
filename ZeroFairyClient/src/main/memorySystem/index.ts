// src/main/memorySystem/index.ts
// 职责：长期记忆管理——沉淀、检索、注入
// 对应方案文档：长期记忆&用户画像系统

import { memoryDb, MemoryRecord } from "../db/memoryBase"
import { chatHistoryDb } from "../db/chatHistory"
import { createLLMAdapter } from "../llmAdapter"

// 对话轮次计数器（每5轮提炼一次记忆）
let dialogRoundCount = 0
const MEMORY_EXTRACT_INTERVAL = 5

// 从记忆库检索最重要的记忆, 格式化成可注入 Prompt 的字符串
export function retrieveMemories(): string {
    const memories = memoryDb.getTopMemories(10)
    if (memories.length === 0) return ''
    // 身份一律以个人设置为准，记忆里的旧身份/显示名全部不注入，避免抢戏
    const filtered = memories.filter(
      (m) =>
        !/^主人显示名是/.test(m.content) &&
        !/^主人的身份是/.test(m.content) &&
        !/^助手二号是/.test(m.content) &&
        !/^主人曾口头声明/.test(m.content)
    )
    if (filtered.length === 0) return ''
    return filtered
      .slice(0, 5)
      .map((m) => `- ${m.content}`)
      .join('\n')
}

// 保存一轮对话到聊天记录
export function saveDailogHistory(
    session: string,
    userText: string,
    assistantText: string
): void {
    chatHistoryDb.save({ session, role: 'user', content: userText })
    chatHistoryDb.save({ session, role: 'assistant', content: assistantText })
}

// 提炼记忆: 对话结束后异步调用,让 LLM 分析这轮对话有没有值得记住的内容
export async function maybeExtractMemory(
    userText: string,
    assistantText: string
): Promise<void> {
    // 口头声明仍可捕获，但正式身份以个人设置页为准（见 promptCore [当前主人设定]）
    const identityMatch = userText.match(/我是(哲|铃)/)
    if (identityMatch) {
        const identity = identityMatch[1]
        console.log('[Memory] 检测到口头身份声明（仅作备忘，正式以个人设置为准）:', identity)
        if (!memoryDb.existsContent(`主人曾口头声明是${identity}`)) {
            memoryDb.save({
                type: 'fact',
                content: `主人曾口头声明是${identity}`,
                importance: 2
            })
        }
    }

    dialogRoundCount++

    //不到5轮, 不提取记忆
    if (dialogRoundCount % MEMORY_EXTRACT_INTERVAL !== 0) return // 非每5轮对话次, 不提取记忆

    try {
        const adapter = createLLMAdapter()
        if (!adapter.hasApiKey()) return

        //取最近10条历史记录作为分析材料
        const recentHistory = chatHistoryDb.getRecent(10)
        const historyText = recentHistory
          .reverse()
          .map(r => `${r.role === 'user' ? '主人' : 'Fairy'}: ${r.content}`)
        
        //让 LLM 分析对话, 提炼值得记住的内容
        const analysisMessages = [
            {
                role: 'system' as const,
                content: `你是一个记忆提炼助手,分析下面这段对话,判断是否值得长期记住的信息
                (比如用户的游戏偏好、习惯、重要事实)。可以提炼:
                - 主人的游戏偏好(喜欢的角色,玩法,进度)
                - 主人反复提及的事情、习惯
                严禁提炼以下内容（身份以客户端个人设置为准，不要写入记忆）:
                - 主人名字、显示名、昵称、我是谁
                - 助手二号是谁、哲/铃身份
                如果有值得记的非身份信息,请用JSON格式输出,否则输出null
                JSON格式: {"type": "preference|habit|fact|game", "content":"具体记忆内容","importance":1-5}
                只输出JSON或者null,不要其他内容.` 
            },
            {
                role: 'user' as const,
                content: `最近的对话记录：\n${historyText}`
            }
        ]
        let result = ''
        await adapter.chatStream(analysisMessages, {
            onChunk: (chunk) => {result += chunk},
            onDone: () => {
                try {
                    const trimed = result.trim()
                    if (trimed === 'null' || !trimed) return

                    //清理可能的 markdown代码块
                    const jsonStr = trimed.replace(/```json|```/g, '').trim()
                    const memory = JSON.parse(jsonStr) as MemoryRecord
                    if (memory.type && memory.content) {
                        const content = String(memory.content)
                        if (
                          /主人显示名|主人的身份|助手二号是|我是谁|显示名称|Yukimomo/i.test(
                            content
                          )
                        ) {
                            console.log('[Memory] 跳过身份类记忆:', content)
                            return
                        }
                        // 查重：避免同一条记忆被反复插入
                        if (memoryDb.existsContent(content)) {
                            console.log('[Memory] 已存在相同记忆，跳过:', content)
                            return
                        }
                        memoryDb.save({ ...memory, content })
                        console.log('[Memory] 已沉淀记忆', content)
                    }
                }catch {
                    //解析失败,忽略(不是每轮对话都有值得记忆的内容)
                }
            },
            onError: () => {} //记忆模块提炼失败不影响主进程
        })
    }catch{
        // 静默失败,记忆提炼是辅助功能,不影响主对话
    }
}