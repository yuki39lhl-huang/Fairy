# ZeroFairyClient

绝区零 **Fairy** 桌面 AI 客户端：Electron + Vue3 + TypeScript。

把 Fairy 做成「新艾利都智能管家」——强约束人设对话、游戏知识检索、长期记忆、工具插件、语音通话与桌面宠物；视觉上以 **HDD 电子眼** 为核心（通话窗等），主聊天为深色 Agent 壳层。

## 功能一览

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 多模型对话 | ✅ | DeepSeek 流式输出（beta 端点），AG-UI 事件总线推送到渲染层 |
| 人设与身份 | ✅ | 个人设置：显示名 / 头像；主人哲·铃·自定义；助手二号联动；写入 Prompt 最高优先级 |
| RAG 世界书 | ✅ | `docs/worldbook/*.md` → SQLite，关键词检索注入上下文 |
| 长期记忆 | ✅ | 对话提炼存库；身份类事实以个人设置为准，避免本地昵称抢戏 |
| 工具插件 | ✅ | 时间、联网搜索、提醒、翻译、记账、Excel/Word/PDF/PPT 生成等 |
| TTS | ✅ | 厂家可切换：GPT-SoVITS（本地）、MiniMax、火山 seed-icl；分句流式合成；**新提问会打断旧语音** |
| STT | ✅ | 官方 `whisper-cli` + 本地模型（Windows 不用 whisper-node） |
| 语音通话 | ✅ | 独立全屏窗 + VAD；Fairy 电子眼口型联动 |
| 桌面宠物 | ✅ | 透明无背景 Fairy 宠物窗，可置顶 |
| 浮窗提醒 | ✅ | 游戏风右上角浮窗 + 可选播报 |
| Fairy 电子眼 | ✅ | PixiJS `layers_v4` 分层；素材由 `live2d-fairy` 导出 |
| 打包发布 | 🔲 | `electron-builder` 脚本已备，正式发布流程待完善 |

## 技术栈

- **桌面**：Electron + electron-vite + TypeScript  
- **界面**：Vue 3、Pinia、Vue Router、Naive UI、Tailwind  
- **渲染**：PixiJS 8（Fairy HDD 眼）  
- **数据**：better-sqlite3、electron-store（配置 / API Key / 个人资料，本地加密）  
- **语音**：Howler 播放；TTS Provider 注册表；SpeakScript 朗读编排  

## 目录要点

```
ZeroFairyClient/
├── docs/worldbook/          # RAG 世界书 Markdown
├── resources/
│   ├── voice/fairy/         # Fairy 克隆参考音频
│   └── whisper/ …           # STT 相关资源（按本机配置）
├── src/main/
│   ├── llmAdapter/          # 模型适配 + promptCore 人设
│   ├── memorySystem/        # 记忆提炼与检索
│   ├── toolSystem/          # MCP 风格工具
│   ├── voice/               # TTS / STT / SpeakScript
│   ├── userProfile/         # 主人 / 助手二号类型
│   ├── fairyPetWindow.ts    # 桌宠
│   └── fairyFloatWindow.ts  # 浮窗
└── src/renderer/            # Vue 页面：聊天、设置、通话、宠物等
```

## 环境要求

- Node.js（建议 LTS）
- Windows 为主开发环境（`npm run dev` 已处理控制台 UTF-8）
- 可选：
  - DeepSeek API Key（对话）
  - Tavily API Key（联网搜索）
  - 本地 GPT-SoVITS `api_v2`（默认 `http://127.0.0.1:9880`）
  - MiniMax / 火山密钥（云端 TTS）
  - whisper-cli 与模型文件（语音输入）

## 安装与运行

```bash
cd ZeroFairyClient
npm install
npm run dev
```

建议 IDE：[VS Code](https://code.visualstudio.com/) + ESLint + Prettier + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)。

### 常用脚本

```bash
npm run typecheck   # 主进程 + 渲染层类型检查
npm run build       # 构建
npm run build:win   # Windows 安装包（electron-builder）
```

## 使用提示

1. **首次使用**：在「设置」填写 DeepSeek API Key；需要搜索时再填 Tavily。  
2. **个人资料**：侧栏头像区域进入「我的资料」。显示名称只用于侧栏；对话身份以「主人 / 助手二号」为准。  
3. **语音**：在设置中切换 TTS 厂家、开关自动播放；开启「存文件到本地」时本轮改为整段合成。  
4. **世界书**：改 `docs/worldbook` 后需**完全重启** `npm run dev`（热更新不会重新导入库）。关键词请用 `<!-- keywords: a,b,c -->`（逗号分隔）。  
5. **本地数据**（Windows 开发 / 打包后同类路径）：  
   `%APPDATA%\zerofairyclient\`  
   - `fairy-config.json`：配置、密钥、个人资料（加密）  
   - `fairy.db`：聊天记忆、世界书等  

## Fairy 人设（摘要）

- Ⅲ 型总序式 AI，因空洞事故进入主角家 HDD  
- 聪明自信、效率优先、偶尔毒舌但不刻薄  
- 称用户为「主人」；哲 / 铃互为助手二号（或自定义）  
- 游戏专有名词无资料时诚实说不知道，不编造  

完整固定层 Prompt 见 `src/main/llmAdapter/promptCore.ts`。

## 电子眼素材

分层导出与契约见上级目录 [`live2d-fairy/README.md`](../live2d-fairy/README.md)。重新导出：

```powershell
python ..\live2d-fairy\build_fairy_layers_v4.py
```

## 相关文档

- 仓库根目录 [README](../README.md)：项目总览  
- `ZeroFairyClient_开发进度存档.md`：阶段进度与踩坑（开新对话衔接用）  
- 方案以项目《方案优化.pdf》为准  

## License / 声明

本项目为爱好向个人开发，与 miHoYo / HoYoverse 无官方关联。游戏设定与素材请遵守相关版权与使用规范。
