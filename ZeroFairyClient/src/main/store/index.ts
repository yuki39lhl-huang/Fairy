// src/main/store/index.ts
// 职责：加密存储 API Key、全局配置等敏感数据
// 类比：Java 里加密的 application.properties / Vault

const ElectronStore = require('electron-store').default
import { createHash } from 'crypto'

// 定义存储的数据结构
interface StoreSchema {
  apiKeys: {
    deepseek?: string
    openai?: string
    anthropic?: string
    tavily?: string // 联网搜索工具的 API Key
  }
  activeProvider: string  // 当前激活的模型厂商
  activeModel: string     // 当前激活的模型名
  voiceEnabled: boolean       // 新增：是否自动合成语音
  voiceSaveToFile: boolean    // 新增：是否额外保存音频文件到本地
}

// 生成加密密钥（基于机器特征，防止配置文件被直接复制到其他机器解密）
const encryptionKey = createHash('sha256')
  .update('ZeroFairyClient-secret-salt')
  .digest('hex')
  .substring(0, 32)

// 创建加密存储实例 不能直接在这里调用StoreSchema泛型,electron-store
//  用 require 拿到的类失去了 TS 泛型支持，解决办法是用类型断言绕过去
const store = new ElectronStore({
  name: 'fairy-config',        // 配置文件名（存在用户数据目录下）
  encryptionKey,               // 开启 AES 加密
  defaults: {
    apiKeys: {},
    activeProvider: 'deepseek',
    activeModel: 'deepseek-v4-flash',
    voiceEnabled: true, // 默认打开,保持现在的行为不变
    voiceSaveToFile: false   // 默认关，保持现在"不落盘"的行为不变
  }
  /*这样 StoreSchema 的类型约束通过类型断言挂上去，既不报错，IDE 也有类型提示 */
}) as unknown as import('electron-store').default<StoreSchema>

// 到处操作方法(不直接暴露 store 实例, 只暴露需要的操作)
export const storeManager = {
  // 存储 API Key
  setApiKey(provider: string, key: string): void {
    const apiKeys = store.get('apiKeys')
    store.set('apiKeys', { ...apiKeys, [provider]: key })
  },

  //读取 API Key
  getApiKey(provider: string): string | undefined {
    return store.get('apiKeys')[provider]
  },

  // 设置当前使用的模型
  setActiveProvider(provide: string, model: string): void {
    store.set('activeProvider', provide)
    store.set('activeModel', model)
  },

  // 获取当前模型配置
  getActiveConfig(): { provider: string, model: string } {
    return {
      provider: store.get('activeProvider'),
      model: store.get('activeModel')
    }
  },

  //新增:
  setVoiceEnabled(enabled: boolean): void {
    store.set('voiceEnabled', enabled)
  },
  getVoiceEnabled(): boolean {
    return store.get('voiceEnabled')
  },

  setVoiceSaveToFile(enabled: boolean): void {
    store.set('voiceSaveToFile', enabled)
  },

  getVoiceSaveToFile(): boolean {
    return store.get('voiceSaveToFile')
  }
}
