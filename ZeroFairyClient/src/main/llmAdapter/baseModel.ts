// src/main/llmAdapter/baseModel.ts
// 统一抽象基类——"先造车"
// 类比 Java：这是 abstract class，定义所有模型适配器必须实现的接口

export interface ToolCall {
    id: string
    name: string
    arguments: string // JSON字符串，执行前需要 JSON.parse
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    tool_call_id?: string    // role为'tool'时，标识这是哪次调用的返回结果
    tool_calls?: ToolCall[]  // role为'assistant'时，可能携带模型发起的工具调用请求
}

export interface StreamChunkCallback {
    onChunk: (text: string) => void               // 每收到一段文字时回调
    onEmotion?: (emotion: string) => void         // 识别到[emotion:xxx]标签回调一次(可选)
    onToolCall?: (toolCalls: ToolCall[]) => void   // 模型决定调用工具时回调（可选）
    onDone: () => void                              // 流式输出完成时回调
    onError: (error: Error) => void                 // 出错时回调
}

// 抽象基类（类比 Java abstract class）
export abstract class BaseModel {
    protected apiKey: string
    protected model: string

    constructor(apiKey: string, model: string) {
        this.apiKey = apiKey
        this.model = model
    }

    // 抽象方法：子类必须实现；tools 可选，只有需要Function Call能力时才传
    abstract chatStream(
        messages: ChatMessage[],
        callbacks: StreamChunkCallback,
        tools?: object[],
        options?: { toolChoice?: 'auto' | 'none' }
    ): Promise<void>

    hasApiKey(): boolean {
        return !!this.apiKey && this.apiKey.length > 0
    }
}