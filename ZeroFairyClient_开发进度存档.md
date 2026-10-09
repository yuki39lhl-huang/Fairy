# ZeroFairyClient 开发进度存档

> 用途：开新对话时，把这份文件发给 Claude，即可无缝衔接开发进度。
> 权威依据：所有开发必须严格遵循项目根目录的《方案优化.pdf》，本文档不替代它，只记录实际进度和踩过的坑。
> 上次同步：2026-10-09（桌面壳对齐 Claude：Chat/Code 分会话、项目可挂多个文件夹；联网搜索改为深搜。Code 读改文件只写了第八节计划，尚未开发）

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
2. `web_search` - 联网搜索（Tavily）。2026-10-09 起为 `advanced` 深搜，最多 5 条，带回检索结论，并打开相关度最高的 2 页做摘录。详见第七节
3. `reminder` 技能 - 定时提醒的创建、查询、修改、删除。旧的 `set_reminder` 插件已删除
4. `translate_text` - 翻译（复用DeepSeek本身）
5. `add_account_record` / `get_account_summary` - 记账
6. `generate_excel` - Excel生成（exceljs）
7. `generate_word` - Word生成（docx）
8. `generate_pdf` - PDF生成（pdf-lib）
9. `generate_ppt` - PPT生成（pptxgenjs）

到点怎么说不交给对话模型。`src/main/skills/predictReminderPrompt.ts` 是内部技能（`expose: false`），保存提醒后自动调用，生成必须带「主人」的口语句。模型失败时用本地兜底句，不用「主人，提醒时间到了」。

### ✅ 阶段4：语音通话模块（主体完成）
- **TTS**：本地 GPT-SoVITS `api_v2.py`（`http://127.0.0.1:9880`），Fairy 参考音频已配置；含 `ttsTextSanitizer` 清洗
- **分句流式合成**：`sentenceSegmenter.ts` + 主进程队列；「存文件到本地」开启时改走整段合成
- **STT**：放弃 `whisper-node`（Windows 编译失败），改用官方 `whisper-cli.exe` + `ggml-small.bin`（见 `resources/whisper`、`resources/models`）
- **麦克风**：`micRecorder.ts` + VAD 自动断句；`whisper:transcribe-recording` IPC
- **通话窗**：独立全屏 `VoiceCall.vue`（`createVoiceCallWindow`），状态机 muted/listening/processing/waiting
- **配置项**：语音自动播放开关、存文件到本地开关（Config.vue）
- 详见根目录 `语音通话.md`（whisper-node → whisper-cli 决策记录）

### ✅ 阶段5：Fairy HDD 动态角色交互（主体完成，产品核心卖点）
- **渲染对象**：Fairy 是 HDD 电子眼，不套用人形 Live2D。空对话、桌面宠物、语音通话使用 `FairyEyeCanvas`（PixiJS 8）；聊起来之后主区是文字，不再铺电子眼背景。旧 Hiyori Live2D 链已移除。
- **可靠资源管线**：`live2d-fairy/build_fairy_layers_v4.py` 从无球源图确定性切出 `public/fairy/layers_v4/`。每层 RGBA 且含透明像素；不再用 ComfyUI 生成运行时图层。
- **固定分层契约**：不加载 L1；L2 仅顺时针旋转（约 13 s/圈）；L3–L7 作为同一 `eyeWhiteRoot` 一起平移注视；**仅 L3 与 L6 做呼吸缩放（2 s）**，L4、L5、L7 始终保持原比例。L7 贴 L6 外缘相切，不是可沿轨道移动的瞳孔。
- **交互链路**：无交互 3 秒后开始待机扫视；`[emotion:xxx]` 改变眼白组的注视目标与 L2 转速；`BroadcastChannel('fairy-mouth-sync')` 的 TTS 振幅只增强允许缩放的 L3/L6。
- **验收基线**：静态合成无多重圆盘叠影；L2 旋转时其余外层稳定；呼吸时只有 L3/L6 缩放；眼白位移不露黑缝。
- **待完善**：TTS 参考音频路径配置化。待机随机台词只在语音通话、并且 Fairy 被静音时说，在通话窗口里出声，不弹悬浮窗。平时不说。第一次打开仍用固定问候「主人，我正处在空闲中。」

### 🔶 阶段6：UI完整美化、配套管理页面（进行中，壳层已对齐 Claude）
当前路由：`/chat` `/history` `/schedule`，以及独立窗 `/voice-call` `/fairy-float` `/fairy-pet`。设置、个人资料、背景音乐嵌在设置浮层里，不再单独占路由。占位页 MemoryView / WorldBook / ToolPlugin 已删。

已落地：
- 侧栏颜色照 Claude 取样：展开侧栏 `#111111`，主区域 `#151515`，悬停预览 `#20201e`。主区域比展开侧栏浅
- 收起后只有鼠标完全停在展开按钮上才预览；预览不挤压主区域；点设置或语音通话会关掉预览
- 空对话居中：会动的 Fairy 眼 +「今天想聊点什么？」。开始聊天后输入框沉底，才显示免责声明
- Chat 与 Code 会话不共用。Chat 会话号 `s-`，Code 会话号 `c-`，都写在 `chat_history` + `chat_session_meta` 两张表里。Code 侧栏是「新会话」和可收起的「项目」，没有定时任务。项目用右侧 **+** 添加，可同时挂多个文件夹；每个文件夹可单独折叠，从文件夹打开的会话同时出现在该文件夹下和「会话」里。目前只保存路径、显示文件夹名，不读文件树和文件内容
- 对话可置顶、重命名、删除（直接删 SQLite）。放不下时进 `/history`
- 背景音乐页在设置里。播放时侧栏底部画频谱；脉冲扫到尽头会淡出，下一颗从左侧淡入
- 设置浮层内缩、背景变暗；「设置」和关闭按钮对齐，关闭按钮不压住滚动内容
- 默认窗口约为工作区的 62%，不再写死分辨率

仍待打磨：Code 模式还不能读、改项目文件。做法已写在第八节，先不开发。不要先做文件树或代码编辑器。

### 🔲 阶段7：测试打包发布（未开始）

---

## 三、关键技术债 / 已踩过的坑（新对话必读，避免复现）

1. **electron-store v9+ 导入方式**：必须 `require('electron-store').default`，不能用 `import`。

2. **UTF-8流式解析乱码**：DeepSeek API的SSE流用 `chunk.toString()` 直接转会在多字节字符被TCP分包切断时产生乱码。必须用 Node.js 的 `StringDecoder` 类（`import { StringDecoder } from 'string_decoder'`）逐块解码。

3. **DeepSeek V4 系列的DSML协议标签泄漏**：`deepseek-v4-flash` 模型在流式+工具调用组合场景下，有时会把内部协议标记（`<|DSML|tool_calls>` / `｜｜DSML｜｜` 等）当作普通文字输出，尤其在**参数结构复杂（嵌套数组/对象）**或**工具回传超长正文**时更容易触发。
   - 修复1：使用 `https://api.deepseek.com/beta` 端点
   - 修复2：流式侧**剥离**协议片段后继续下发干净文本；**禁止**命中后永久静音后续 chunk
   - 修复3（最重要）：**所有工具参数必须设计成扁平字符串结构，避免数组的数组这类嵌套**
   - 修复4：`web_search` 回传有总长度上限。2026-10-09 起整段约 2200 字（检索结论 + 5 条来源 + 2 页正文摘录），不能再放回整页 HTML
   - 修复5：工具执行后的跟进轮加 system 约束 + `tool_choice: 'none'`；若剥离后正文过短则再补一轮自然语言重试
   - 修复6：content 泄漏的完整 DSML/`<calls>` 工具块整段拦截，解析为正式 tool_calls 执行，绝不把 `<invoke>` 原文展示给用户

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

待办：`docs/idle-dialogues/hdd-idle.md` 已接入（`src/main/idleDialogue/index.ts`）。只在语音通话静音后约 45 秒无操作时抽一条，在通话窗口里说，不弹悬浮窗。平时不说。

---

## 六、当前必须先确认的事项（开新对话时最先做）

1. 让助手重新对照项目根目录《方案优化.pdf》
2. 把这份存档发给助手（已同步至 2026-10-09：壳层、分会话、深搜已落地）
3. 下一优先事项建议：
   - 第七节：把联网查询继续对齐 Claude（多轮检索还没做）
   - 阶段5：待机随机台词已接入。TTS 参考音频路径仍待配置化（打包前必做）
   - TTS 参考音频路径配置化（打包前必做）
   - 第八节：Code 模式按 Claude Code 的方式读、改项目文件。计划已写，先不开发；不要先做成 IDE 或文件树

---

## 七、对标 Claude 的联网查询（进行中）

Claude 公开流程：模型自己决定要不要搜 → 可以连续改词再搜 → 打开具体网页读正文 → 先筛掉无关段落再放进上下文 → 回答必须带来源。准，是因为这整条链路，不是因为换了一个搜索框。

Fairy 现在做不到多轮。工具执行完，跟进轮被 `tool_choice: 'none'` 锁死，只能用自然语言回答。这是为了挡住 DeepSeek 的 DSML 协议泄漏，不能为了多搜一次把这道锁拆掉。

### 已完成（2026-10-09）
- `webSearch.ts`：`search_depth: 'advanced'`，最多 5 条，`include_answer: true`
- 按相关度取前 2 个链接，调用 Tavily Extract 打开正文，每页摘录约 480 字
- 回传结构：检索结论、来源列表、已打开核对、以及「材料里没有的不要补充」
- `promptCore.ts` 要求搜索词带上作品名、版本或时间，用到的事实后面附来源网址
- 整段结果上限约 2200 字

### 还没做（按这个顺序）
1. **安全的第二轮搜索。** 只允许再调用 `web_search` 一次：模型看完第一轮材料后，若明确不够，用更具体的词再搜。第二次之后仍然 `tool_choice: 'none'`。跟进轮一旦出现 DSML，整段丢掉，不许展示给用户。
2. **摘录对准问题，而不是截前 480 字。** 打开网页后，按用户问题把相关段落留下来，导航、评论、无关栏目丢掉。这是 Claude「先筛选再进上下文」的对应物，仍然不要把整页 HTML 塞进去。
3. **回答里的来源要可点。** 现在只是提示模型在句后写网址。主聊天区应把这些网址渲染成来源，点得开，方便核对。
4. **查不到就承认。** 检索结论和正文都没有该事实时，界面和提示都保持「没查到」，禁止用训练记忆补一句听起来像查过的话。

不做的事：不在这一阶段换成别的搜索引擎；不把工具跟进轮全部放开；不把单次结果上限再放宽到整页。

---

## 八、对标 Claude Code 的项目读写（计划已写，先不开发）

依据：[How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)、[Tools reference](https://code.claude.com/docs/en/tools-reference)（2026-10-09 查阅）。

Claude Code 打开项目时不把文件树和全部源码装进上下文。会话一开始进上下文的是项目说明（根目录 `CLAUDE.md`，没有时可读 `AGENTS.md`），不是源码。真正看代码发生在动手的时候：模型自己决定调用工具，工具结果再喂回下一轮。工作目录就是项目根；读项目内的文件默认可做，读到项目外要询问；写入限制在启动时所在的文件夹及其子目录。

它靠几类工具，而不是一次列完目录：

- **找文件名**：`Glob`（Windows 默认有；macOS / Linux 上常常改用 shell 的 `find`）。按修改时间排序，一次最多约 100 个，超出就让模型缩小范围。
- **找内容**：`Grep`（ripgrep）。默认只回文件路径，要看命中行才改成带行号的内容模式。尊重 `.gitignore`。
- **读一个文件**：`Read`。带行号；太长就先给第一页，并用 `offset` / `limit` 续读。`Read` 不能读目录，列目录走 shell（如 `ls`）。
- **改已有文件**：`Edit`，用精确的 `old_string` → `new_string`，必须在文件里唯一命中。多数情况下必须先在本会话里读过这个文件。局部修改不用整文件覆盖。
- **新建或整文件覆盖**：`Write`。覆盖已有文件前通常也要先读过。
- 大范围翻找可以交给单独的子会话，主会话只收回摘要，避免把大量文件正文堆进当前对话。

Fairy 现在只存路径、侧栏显示最后一段文件夹名。会话能挂到这个路径上，模型看不到里面任何一个文件。工具跟进轮仍被 `tool_choice: 'none'` 锁住，只能用一次工具。读改文件需要「找 → 读 → 再改」连续几步，所以这道锁只能在 Code 模式、并且只对文件工具放宽。

### 还没做（按这个顺序，先不写代码）
1. **划定项目根。** 当前 Code 会话绑定的文件夹就是根。所有路径相对这个根解析，拒绝 `..` 和落到根以外的路径。跳过 `node_modules`、`.git` 和二进制文件。
2. **只做读取。** 三个扁平参数的工具：`list_dir`（只列一层名字）、`search_files`（按文件名或按内容返回路径和少量命中行，不返回整文件）、`read_file`（带行号，超长只回一页并说明还能续读）。单次结果设字数上限。不在提示词里预装文件树。
3. **会话开头只带短说明。** 若项目根有一份很短的说明文件，Code 会话开始时读入它（对标 `CLAUDE.md`）。没有就跳过。不要因此去扫源码。
4. **先读后改，并让主人确认。** `edit_file` 用精确原文片段替换，片段必须在文件里只出现一次；本会话没读过该文件就拒绝写入。新建文件才允许整文件写入。写入前在对话里给出文件路径和差异，主人确认后才落盘。
5. **只在 Code 项目会话里放开有限轮工具。** 允许连续调用上述文件工具，例如最多 4 轮（列目录或搜索 → 读文件 → 修改）。之后仍然 `tool_choice: 'none'`，用自然语言说明改了什么。Chat 模式不挂这些工具。跟进轮出现 DSML 就整段丢掉。
6. **聊天气泡标明文件。** 读过、改过的路径显示在回复旁，方便核对。这一阶段不做文件树，也不做代码编辑器。

不做的事：不把整个仓库或整文件树塞进上下文；不开放项目根以外的路径；不在这一阶段提供任意 shell、跑测试或语言服务；不把第七节的搜索跟进锁拆掉。
