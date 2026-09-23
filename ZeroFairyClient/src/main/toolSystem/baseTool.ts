// src/main/toolSystem/baseTool.ts
// 工具抽象基类——方案文档要求的"可插拔MCP插件架构"核心

// 支持嵌套的JSON Schema属性定义（递归类型，能描述数组、数组的数组等复杂参数）
export interface JSONSchemaProperty {
  type: string
  description?: string
  items?: JSONSchemaProperty        // 数组类型专用：描述数组元素的类型
  properties?: Record<string, JSONSchemaProperty>  // 对象类型专用：描述嵌套对象的字段
  required?: string[]
  enum?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JSONSchemaProperty>
    required?: string[]
  }
}

export abstract class BaseTool {
  abstract definition: ToolDefinition
  abstract execute(args: Record<string, unknown>): Promise<string>
}