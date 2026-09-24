# Fairy

绝区零 **Fairy（仙灵）** 拟人桌面 AI 客户端的开发仓库。

Fairy 是游戏中的 Ⅲ 型总序式集成泛用人工智能、「新艾利都最强智能管家」。本项目把它做成可对话、可语音、可桌宠的本地 Electron 客户端：强约束人设 + 游戏知识 RAG + 长期记忆 + 工具插件，视觉核心是 **HDD 电子眼**（非人形 Live2D）。

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| [`ZeroFairyClient/`](./ZeroFairyClient/) | 主程序（Electron + Vue3）。开发、运行、打包都在这里，详见其 [README](./ZeroFairyClient/README.md) |
| [`live2d-fairy/`](./live2d-fairy/) | Fairy 电子眼分层素材与导出脚本（`layers_v4`） |
| `common/` / `mp3/` 等 | 参考素材与实验资源（非运行时必需） |

## 快速开始

```bash
cd ZeroFairyClient
npm install
npm run dev
```

完整功能说明、配置项与打包方式见 **[ZeroFairyClient/README.md](./ZeroFairyClient/README.md)**。

## 当前能力概览

- Fairy 人设对话（哲 / 铃 / 自定义主人与助手二号）
- DeepSeek 流式对话 + 工具调用（搜索、提醒、记账、办公文档生成等）
- 世界书 RAG + SQLite 长期记忆
- 多厂家 TTS（本地 GPT-SoVITS / MiniMax / 火山 seed-icl）与本地 Whisper STT
- 语音通话窗、桌面宠物、右上角浮窗提醒
- PixiJS Fairy HDD 电子眼（通话窗等场景）

## 开发进度

更细的阶段记录与踩坑说明见仓库内 `ZeroFairyClient_开发进度存档.md`（开新对话时可一并参考）。
