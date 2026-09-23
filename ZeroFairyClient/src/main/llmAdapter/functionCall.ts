// src/main/llmAdapter/functionCall.ts
// 统一函数调用解析：把我们自己的工具格式，转换成模型能理解的标准格式
// 方案文档要求：独立文件，抹平各厂商Function Call格式差异

import { BaseTool } from '../toolSystem/baseTool'

// 转换成 OpenAI-compatible 格式（DeepSeek 等主流厂商都兼容这套格式）
export function toolsToOpenAIFormat(tools: BaseTool[]): object[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.definition.name,
            description: tool.definition.description,
            parameters: tool.definition.parameters
        }
    }))
}