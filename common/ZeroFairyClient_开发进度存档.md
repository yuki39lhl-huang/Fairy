# ZeroFairyClient 开发进度存档

> 用途：开新对话时，把这份文件发给 Claude，即可无缝衔接开发进度。
> 权威依据：所有开发必须严格遵循项目根目录的《方案优化.pdf》，本文档不替代它，只记录实际进度和踩过的坑。
> 上次同步：2026-09-23（主聊天改为 Codex/ChatGPT 风格 Agent UI；FairyEyeCanvas 仅保留在语音通话窗）

---

## 一、项目定位

绝区零 Fairy 拟人桌面 AI 客户端，仿照 Bilibili UP主 Playa0 的开源项目"昔涟"。核心是 Live2D 情绪神态交互 + Fairy 专属强约束人设对话 + 多模型插件适配。

**技术栈**：Electron + Electron-Vite + TypeScript，Vue3 + Pinia + VueRouter，PixiJS（Fairy HDD 分层电子眼），sqlite3（better-sqlite3），DeepSeek API（beta端点），本地 GPT-SoVITS TTS，本地 whisper-cli STT。

**开发者背景**：Yuki，有 Vue 经验、Java 背景，无 Electron/LLM API 经验，需要逐步教学、小步推进。

---

## 二、当前完成进度

### ✅ 阶段1：基础桌面 + 多模型适配器（完成）
- Electron-Vite + TS 工程搭建
- Vue3 + Pinia + VueRouter 渲染层
- 主/渲染进程 IPC 双向通信（invoke/handle）
- AG-UI 事件总线（`agentEventBus.ts`，主进程主动推送）
- DeepSeek 适配器接入，SSE流式输出
- API密钥加密存储（electron-store）

### ✅ 阶段2：四层Prompt + RAG知识库 + 长期记忆（完成）
- `promptCore.ts` 四层架构：固定人设层、RAG知识层、对话上下文层（滚动窗口）、工具指令层
- SQLite三表：`chat_history`、`memory`、`worldbook`
- RAG知识库：`docs/worldbook/*.md` 文档，关键词标注用 `<!-- keywords: a,b,c -->` 格式（逗号分隔，不能用空格！）
- 长期记忆：每5轮对话LLM提炼一次，存入`memory`表，检索时取Top5按重要度排序

### ✅ 阶段3：MCP工具插件系统（全部完成，含文档四件套）
已实现工具：
1. `get_current_time` - 获取当前时间
2. `web_search` - 联网搜索（Tavily API）
3. `set_reminder` - 定时弹窗提醒（Electron Notification）
4. `translate_text` - 翻译（复用DeepSeek本身）
5. `add_account_record` / `get_account_summary` - 记账
6. `generate_excel` - Excel生成（exceljs）
7. `generate_word` - Word生成（docx）
8. `generate_pdf` - PDF生成（pdf-lib）
9. `generate_ppt` - PPT生成（pptxgenjs）

### ✅ 阶段4：语音通话模块（主体完成）
- **TTS**：本地 GPT-SoVITS `api_v2.py`（`http://127.0.0.1:9880`），Fairy 参考音频已配置；含 `ttsTextSanitizer` 清洗
- **分句流式合成**：`sentenceSegmenter.ts` + 主进程队列；「存文件到本地」开启时改走整段合成
- **STT**：放弃 `whisper-node`（Windows 编译失败），改用官方 `whisper-cli.exe` + `ggml-small.bin`（见 `resources/whisper`、`resources/models`）
- **麦克风**：`micRecorder.ts` + VAD 自动断句；`whisper:transcribe-recording` IPC
- **通话窗**：独立全屏 `VoiceCall.vue`（`createVoiceCallWindow`），状态机 muted/listening/processing/waiting
- **配置项**：语音自动播放开关、存文件到本地开关（Config.vue）
- 详见根目录 `语音通话.md`（whisper-node → whisper-cli 决策记录）

### ✅ 阶段5：Fairy HDD 动态角色交互（主体完成，产品核心卖点）
- **渲染对象**：Fairy 是 HDD 电子眼，不套用人形 Live2D。主聊天页与通话页均使用 `FairyEyeCanvas`（PixiJS 8）；旧 Hiyori Live2D 链已移除。
- **可靠资源管线**：`live2d-fairy/build_fairy_layers_v4.py` 从无球源图确定性切出 `public/fairy/layers_v4/`。每层 RGBA 且含透明像素；不再用 ComfyUI 生成运行时图层。
- **固定分层契约**：不加载 L1；L2 仅顺时针旋转（约 13 s/圈）；L3–L7 作为同一 `eyeWhiteRoot` 一起平移注视；**仅 L3 与 L6 做呼吸缩放（2 s）**，L4、L5、L7 始终保持原比例。L7 贴 L6 外缘相切，不是可沿轨道移动的瞳孔。
- **交互链路**：无交互 3 秒后开始待机扫视；`[emotion:xxx]` 改变眼白组的注视目标与 L2 转速；`BroadcastChannel('fairy-mouth-sync')` 的 TTS 振幅只增强允许缩放的 L3/L6。
- **验收基线**：静态合成无多重圆盘叠影；L2 旋转时其余外层稳定；呼吸时只有 L3/L6 缩放；眼白位移不露黑缝。
- **待完善**：接入 `docs/idle-dialogues/hdd-idle.md` 待机台词；TTS 路径配置化。

### 🔶 阶段6：UI完整美化、配套管理页面（进行中）
已有页面路由：`/chat` `/config` `/memory` `/worldbook` `/toolplugin` `/voice-call`
- 主界面：`AppShell` 左侧导航 + 聊天主区，深灰 Agent 风格（参考 Codex/ChatGPT），**无电子眼背景**
- 语音通话窗仍全屏使用 `FairyEyeCanvas`
- MemoryView / WorldBook / ToolPlugin / Config 已挂入侧栏
- 管理页视觉与侧栏体系统一对齐仍待打磨

### 🔲 阶段7：测试打包发布（未开始）

---

## 三、关键技术债 / 已踩过的坑（新对话必读，避免复现）

1. **electron-store v9+ 导入方式**：必须 `require('electron-store').default`，不能用 `import`。

2. **UTF-8流式解析乱码**：DeepSeek API的SSE流用 `chunk.toString()` 直接转会在多字节字符被TCP分包切断时产生乱码。必须用 Node.js 的 `StringDecoder` 类（`import { StringDecoder } from 'string_decoder'`）逐块解码。

3. **DeepSeek V4 系列的DSML协议标签泄漏**：`deepseek-v4-flash` 模型在流式+工具调用组合场景下，有时会把内部协议标记（`<|DSML|tool_calls>` / `｜｜DSML｜｜` 等）当作普通文字输出，尤其在**参数结构复杂（嵌套数组/对象）**或**工具回传超长正文**时更容易触发。
   - 修复1：使用 `https://api.deepseek.com/beta` 端点
   - 修复2：流式侧**剥离**协议片段后继续下发干净文本；**禁止**命中后永久静音后续 chunk（旧逻辑会导致回复被截断、像卡住报错）
   - 修复3（最重要）：**所有工具参数必须设计成扁平字符串结构，避免数组的数组这类嵌套**。例如Excel生成工具最初用 `headers: string[]` + `rows: string[][]` 两个数组参数会稳定触发泄漏，改成单一 `csvData: string`（CSV格式文本，工具内部自己split解析）后完全稳定。**这是一条对后续所有新工具都适用的设计原则。**
   - 修复5：工具执行后的跟进轮加 system 约束 + `tool_choice: 'none'`；若剥离后正文过短则再补一轮自然语言重试

4. **chatStream的Promise时序bug**：早期实现里，`chatStream` 方法在HTTP流刚建立连接时就return了，不会等流真正结束。这导致任何"调用chatStream后立刻读取拼接结果"的代码（如翻译工具）会读到空字符串。修复：把整个流程包进 `new Promise<void>((resolve) => {...})`，只有流真正的 `finalize()`（对应 `[DONE]` 或 `end` 事件）触发时才 `resolve()`。

5. **onDone重复触发**：`[DONE]`标记和流的`end`事件可能都会各自调用一次onDone，需要用 `isDone` 标志位包装成 `safeOnDone`/`finalize`防止重复。

6. **记忆提炼的JSON.parse截断问题**：本质是问题2（UTF-8分包）导致的字符串截断，修好StringDecoder后一并解决。

7. **记忆去重**：`memoryDb` 需要 `existsContent(content)` 方法，插入前查重，避免LLM重复提炼同一条信息导致数据库堆积重复记录。

8. **RAG检索逻辑**：不能用整句用户输入去 `LIKE '%query%'` 匹配文档正文（几乎不可能命中）。正确做法是关键词数组匹配：`keywords.split(',').map(k=>k.trim()).some(kw => userQuery.includes(kw))`。文档的keywords标注要写"正文中出现的具体专有名词"，不能写"文档类型标签"（比如不能写"主线剧情"，要把文档里提到的人名地名都列出来）。

9. **importWorldBookFromDocs() 只在完全重启时执行**，改了md文件后必须 `Ctrl+C` 完全停掉 `npm run dev` 重启，热更新不会重新导入。

10. **ToolDefinition类型需要支持递归嵌套**（虽然后来发现应尽量避免让LLM用嵌套参数），`baseTool.ts`里的`JSONSchemaProperty`接口要支持`items`自引用。

11. **strict模式不要轻易全局开**：给所有工具的function定义加`strict: true`会因为部分工具schema不完全合规（如无`required`字段的空properties）导致请求直接失败，现在保持不加strict，用兜底泄漏检测代替。

12. **Windows终端UTF-8编码**：不要改`.vscode/settings.json`里的`terminal.integrated.profiles`（会和Trae任务系统冲突报错）。正确做法是在`package.json`的`dev`脚本里加：`"dev": "chcp 65001 >nul && electron-vite dev"`。

13. **Config.vue的Tavily Key输入框要放在`config-card`内部**，不能写在外层，否则没有卡片样式。

14. **whisper-node 在 Windows 不可用**：自动编译 whisper.cpp 需要 GCC/`make`/`uname` 等 Unix 工具链，MSVC 环境会失败。已改为官方预编译 `whisper-cli.exe` + 同模型 `ggml-small.bin`（决策详见根目录 `语音通话.md`）。

15. **Live2D 必须手动接管 update 循环**：`Live2DModel.from(..., { autoUpdate: false })`，再在 Pixi ticker 里 `model.update(deltaMS)`，否则模型可能「装上了但不动」。优先 `preference: 'webgl'`，避免误走 WebGPU。

16. **TTS 参考音频路径写死在本机绝对路径**（`ttsClient.ts` 里 `REF_AUDIO_PATH`），换机器/打包前必须改成可配置或相对 resources。

17. **情绪标签解析与流式输出抢字节**：deepseek 适配器开头用 `emotionBuffer` 缓冲，匹配 `^\s*\[emotion:([a-zA-Z]+)\]`；超时兜底直接当普通文字吐出，避免卡死首包。

---

## 四、Fairy人设关键设定（已写入promptCore.ts固定层，不可丢失）

- 身份：绝区零的Fairy（仙灵），Ⅲ型总序式集成泛用人工智能，新艾利都最强智能管家
- 因空洞事故进入主角家的HDD系统
- 性格：聪明自信、效率优先、偶尔毒舌但不刻薄、反差萌、一本正经地荒诞
- 称呼用户"主人"；用户自称"哲"则称呼"铃"为"助手二号"，反之亦然，需持续到用户切换身份
- 关于主人背景：法厄同兄妹（哥哥哲、妹妹铃），旧艾利都出身，赫利俄斯机关，恩师卡洛丝·阿尔娜，经营录像店「Random Play」，绳匠身份
- 语气范例（few-shot）：自嘲式抱怨、先抑后扬冷吐槽、表面安慰实则调侃、一本正经作弊+夸张吹捧、面对威胁的自信嘲讽
- 防幻觉规则：涉及游戏专有名词且RAG资料没有时，要诚实说不知道，绝不编造；生成文件类需求必须真实调用工具，不能自己在聊天里写假markdown表格

---

## 五、RAG知识库现状（docs/worldbook/）

已导入文档：
- `云岆山.md` / `云岿山.md`（青溟剑传承相关）
- `法厄同兄妹.md`
- `空洞与以骸.md`
- `叶瞬光.md`
- `剧情.md`（主线剧情梗概，含大量NPC/势力名）

待办：`docs/idle-dialogues/hdd-idle.md` 已建立台词骨架，用于阶段5待机状态机（**台词文件在，代码逻辑尚未接入**）

---

## 六、当前必须先确认的事项（开新对话时最先做）

1. 让助手重新对照项目根目录《方案优化.pdf》
2. 把这份存档发给助手（已同步至阶段5主体完成）
3. 下一优先事项建议：
   - 阶段5收尾：正式 Fairy 模型替换、待机台词状态机接入、清理 Live2D 诊断日志
   - 或进入阶段6：按「主屏幕呈现的样子.png」做 UI 美化与管理页打磨
   - TTS 参考音频路径配置化（打包前必做）
