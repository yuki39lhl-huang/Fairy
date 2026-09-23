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
    const memories = memoryDb.getTopMemories(5)
    if (memories.length === 0) return ''
    return memories.map(m => `- ${m.content}`).join('\n')
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
    // 身份声明立即捕获，不等5轮
    const identityMatch = userText.match(/我是(哲|铃)/)
    if (identityMatch) {
        const identity = identityMatch[1]
        if (!memoryDb.existsContent(`主人的身份是${identity}`)) {
            memoryDb.save({ type: 'fact', content: `主人的身份是${identity}`, importance: 5 })
            console.log('[Memory] 立即沉淀身份信息:', identity)
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
                content: `你是一个记忆提炼助手,分析下main这段对话,判断是否值得长期记住的信息
                (比如用户的游戏偏好,习惯,重要事实),一定要提炼的信息有:
                - 主人的信息(名字,职业,习惯)
                - 主人的游戏偏好(喜欢的角色,玩法,进度)
                -主人反复提及的事情
                如果有,请用JSON格式输出,否则输出null
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
                        // 查重：避免同一条记忆被反复插入
                        if (memoryDb.existsContent(memory.content)) {
                            console.log('[Memory] 已存在相同记忆，跳过:', memory.content)
                            return
                        }
                        memoryDb.save(memory)
                        console.log('[Memory] 已沉淀记忆', memory.content)
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