// src/main/toolSystem/plugins/getCurrentTime.ts
// 第一个测试工具：获取当前时间（不依赖任何外部API，用于验证整个Function Call链路）

import { BaseTool, ToolDefinition } from '../baseTool'

export class GetCurrentTimeTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'get_current_time',
        description: '获取当前的真实日期和时间。当用户询问现在几点、今天星期几、当前日期时使用此工具，不要凭猜测回答。',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    async execute(): Promise<string> {
        const now = new Date()
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
        return `当前时间：${now.toLocaleString('zh-CN')}，${weekdays[now.getDay()]}`
    }
}