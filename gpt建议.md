我会重点看你这个 Fairy 项目的实际技术栈和现有 Agent 调用链，再决定工作区应该接入哪一层，而不是直接给你套一份通用 Electron 文件树代码。

这次实现有三个核心目标：

1. 选择本地项目目录后，能递归展示文件树并读取文件内容。

2. 在 Code 模式下，让 Agent 能搜索、读取和修改当前项目的代码。

3. 所有文件操作都受工作区授权约束，并且支持修改预览和撤销。

## 一、我在你的仓库里确认到的现状

我已经查看了 [Fairy 主仓库](https://github.com/yuki39lhl-huang/Fairy?utm_source=chatgpt.com)、[ZeroFairyClient 技术说明](https://github.com/yuki39lhl-huang/Fairy/blob/main/ZeroFairyClient/README.md?utm_source=chatgpt.com) 和 [开发进度存档](https://github.com/yuki39lhl-huang/Fairy/blob/main/ZeroFairyClient_%E5%BC%80%E5%8F%91%E8%BF%9B%E5%BA%A6%E5%AD%98%E6%A1%A3.md?utm_source=chatgpt.com)。

你的项目已经具备几个关键基础：

* Electron + electron-vite + TypeScript，适合直接访问本地文件系统。

* Vue 3 + Pinia，适合管理 Code 会话和项目状态。

* 主进程 IPC 与 AG-UI 事件总线，适合传递工具执行状态。

* 已有 MCP 风格工具系统，以及 DeepSeek 流式对话和工具调用。

* Code 会话已经与 Chat 会话分开，项目可以挂载多个文件夹，但目前保存的主要是路径和文件夹名称，还没有读取源码。

这些现状在你的开发文档中有明确记录。

![](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub

+2

所以，你不需要推倒重写 Agent，也不需要先做一个 IDE。 最合理的方案是先给现有 Code Agent 增加受控的文件工具，让它真的能完成“查找 → 读取 → 修改”的任务。

你的开发进度文档第八节已经规划了这条路线：三个读取工具、精确编辑、修改前确认，以及仅在 Code 模式放开有限轮工具调用。建议把它作为第一阶段的实现基线。

![](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub

## 二、我建议你采用的实现架构

### Code 会话

当前会话绑定的一个或多个项目目录

### Code 专属工具注册表

list_dir · search_files · read_file · edit_file

复用现有工具定义和参数校验，不与 Chat 工具混用。

### 本地文件执行服务

项目根目录校验、读取限制、写入审批、文件变更检查

### 用户授权的本地项目

只访问当前 Code 会话已授权的目录

这里有一个关键点：项目可以挂载多个文件夹，但每次工具调用必须明确使用哪个项目的根目录。

不能让模型传入任意绝对路径来选择文件。最好由当前 Code 会话保存项目 ID，工具参数只接收相对路径；本地执行层再把相对路径解析到该项目根目录下。

## 三、具体应该改哪些地方？

根据你仓库的目录说明和现有工具系统，我建议分成四个改造点。这里需要说明：我能核对公开的 README、开发进度文档和 `package.json`，但 GitHub 页面没有成功返回 `toolSystem` 等目录的源码内容，因此下面是针对你现有架构的改造方案，不会把未经核实的函数名当成现有代码。

### 1. 新增本地文件工具

在 `src/main/toolSystem/` 下增加独立的文件工具模块。不要把文件操作代码混入现有的联网搜索、记账等工具里。

第一版只实现这四个工具：

| 工具             | 参数                               | 返回结果          |
| -------------- | -------------------------------- | ------------- |
| `list_dir`     | `path`                           | 当前目录的文件名、类型   |
| `search_files` | `query`、`path`、`mode`            | 匹配的文件路径和少量命中行 |
| `read_file`    | `path`、`offset`、`limit`          | 带行号的文本内容      |
| `edit_file`    | `path`、`old_string`、`new_string` | 待应用的修改及执行结果   |

这里特意使用扁平参数。你的开发记录已经提到，DeepSeek 的 DSML 工具调用对复杂嵌套参数存在兼容性问题，因此没必要给文件工具设计复杂的嵌套 JSON。

![](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub

文件工具的执行逻辑应该类似这样：

```
模型发起 read_file
       ↓
检查当前 Code 会话
       ↓
获取会话绑定的项目根目录
       ↓
校验相对路径与访问权限
       ↓
读取文本并限制返回长度
       ↓
把工具结果交给模型
```

不要让模型通过 `read_file` 读取任意绝对路径。 即使用户挂载了多个项目，也必须验证请求中的项目标识属于当前会话的授权范围。

### 2. 改造现有 Agent 工具调用循环

这是最关键的一步。

你现在的项目有一个特殊限制：工具执行后的跟进轮使用 `tool_choice: 'none'`，用于防止 DeepSeek 输出内部 DSML 协议片段。这种设计对于普通 Chat 是合理的，但 Code Agent 需要连续调用工具。

例如，修复一个 Java Bug，至少可能需要：

```
第 1 轮：list_dir / search_files
第 2 轮：read_file
第 3 轮：edit_file
第 4 轮：根据执行结果给出总结
```

因此，不应该直接修改全局的工具跟进逻辑，而应该在现有 Agent 调用链中增加一个按模式隔离的工具策略。

| 行为        | Chat 模式 | Code 模式         |
| --------- | ------- | --------------- |
| 普通对话工具    | 保持现有逻辑  | 按需保留            |
| 文件读取工具    | 不注册     | 允许              |
| 文件修改工具    | 不注册     | 经过审批后允许         |
| 工具连续调用    | 保持现有限制  | 最多 4 轮文件工具调用    |
| DSML 异常处理 | 保持现有逻辑  | 同样拦截，不向用户泄漏原始协议 |

注意，“最多 4 轮”是你文档中规划的初始策略，不是说每个任务都必须用完四轮。还应该设置总工具调用数、总耗时和返回内容大小上限。

当 Code Agent 完成工具调用，或触及轮数限制后，再切换到自然语言总结。不要为了实现 Code 而拆掉已有的 DSML 安全处理。

### 3. 实现先读后改与用户确认

不要直接让模型覆盖源文件。

`edit_file` 可以采用精确字符串替换：

TypeScript

```
interface EditFileRequest {
  path: string;
  old_string: string;
  new_string: string;
}
```

执行前必须检查：

* 文件属于当前授权的项目。

* 文件在当前会话中已经读取过。

* `old_string` 在当前文件中恰好出现一次。

* 文件没有在读取后被用户或其他程序修改。

* 修改内容符合文件大小和写入限制。

通过检查后，先生成修改预览，再让用户确认。

LoginService.java

1 个文件待修改

待确认

+ 新增行

Java

```
return tokenService.generate(user);
```

- 删除行

Java

```
return null;
```

查看实现方案设计修改工具

这里的代码只是交互示意，不是你仓库里真实的修改结果。实际界面可以在现有聊天消息中显示 Diff，不需要第一版就引入完整的代码编辑器。

### 4. 把项目根目录与 Code 会话关联起来

你现在已经支持一个会话挂载多个文件夹，因此不应该简单地把一个全局 `currentProjectPath` 作为所有 Agent 会话的工作目录。

建议引入类似这样的数据关系：

TypeScript

```
interface CodeWorkspace {
  id: string;
  rootPath: string;
  displayName: string;
}

interface CodeSessionWorkspace {
  sessionId: string;
  workspaceId: string;
}
```

这些是建议新增的类型，不代表你当前数据库已经存在同名字段。

实际设计中：

* 一个工作区对应一个用户授权的目录。

* 一个 Code 会话可以关联多个工作区。

* 每次工具调用明确指定工作区 ID 和相对路径。

* 服务端或 Electron 主进程校验工作区归属后才执行操作。

* Chat 会话不会因为 Code 会话绑定了项目而获得文件读取能力。

你的 SQLite 已经保存聊天历史和会话元数据，可以在现有结构上增加项目关联，而不是把项目路径重复塞进每一条消息中。

## 四、那文件树到底什么时候做？

我的建议是分两期，而不是把它当作 Code Agent 的前置条件。

第一期：先让 Agent 能读写项目

优先

实现文件工具、调用循环、项目路径校验、修改审批和 Diff 结果。即使暂时没有文件树，用户也能让 Fairy 检查和修改代码。

第二期：完善可视化工作区

实现文件树、点击查看源码、编辑器、修改标记、Diff 和刷新机制。复用第一期的本地文件服务，不要重新实现另一套读写逻辑。

这也符合你开发进度文档中“先做 Code 工具，不先做文件树或编辑器”的原有规划。

![](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub

如果你的目标已经明确升级为 Codex 那样的可视化体验，可以把第二期紧接着做，但底层仍然应复用同一个文件服务。

## 五、接下来怎样才能落实到你的真实代码？

我建议下一步直接在你本地的 `ZeroFairyClient` 项目里检查以下内容：

1. `src/main/toolSystem/`：工具注册、工具 Schema、工具执行器。

2. `src/main/llmAdapter/`：DeepSeek 工具调用和 `tool_choice` 控制。

3. `src/preload/` 及主进程 IPC：现有通信接口如何暴露给 Vue。

4. Code 页面及相关 Pinia Store：项目目录、会话和文件夹绑定状态。

然后按照现有实现逐个修改，优先复用已有接口和类型，避免破坏 Chat、提醒、联网搜索、记忆及语音功能。

你可以先把 Fairy 仓库拉到本地，用 Cursor 打开 `ZeroFairyClient`，再把上述四个目录中负责工具注册、模型调用、IPC 和 Code 页面状态的文件发给我。 我就能继续给你精确到文件和函数的修改方案，而不是让你照着通用示例自行猜测项目接口。
