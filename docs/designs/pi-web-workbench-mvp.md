# Pi Web Workbench MVP

## Summary

详细实现设计见：

- [Pi Web Workbench Architecture](./pi-web-workbench-architecture.md)
- [Pi Web Workbench Frontend Design](./pi-web-workbench-frontend.md)

目标是做一个“本地单服务 + 浏览器访问”的 `pi-coding-agent` 工作台，复用 `pi-coding-agent` 的 Node SDK 能力，在浏览器中完成最小可用闭环：

- 注册 workspace
- 按 workspace 查看和恢复历史 session
- 创建新 session 并进行流式消息交互
- 查看当前 workspace 的 Git 变更

MVP 只解决“本地代码工作区里的 agent 会话管理和只读变更查看”，不追求一次覆盖完整桌面工作台能力。

核心产品定义：

- 单机单用户，本地启动一个服务，浏览器访问
- 架构上区分控制面（Workbench Service）和执行面（Agent Runtime）
- MVP 默认使用本地 `Agent Runtime`，与 `Workbench Service` 同机部署
- `Workbench Service` 通过 runtime 抽象驱动 agent，不把 Web API 直接耦合到某一种运行方式
- 复用现有 `~/.pi/agent` 配置、模型、鉴权和 session 持久化
- 第一版优先保证稳定、可恢复、可调试，不追求富交互和大而全 UI
- Web UI 以“单个当前激活 session”为中心，不做多 tab 并发工作台
- 变更视图第一版只做 `Git Changes`，不做 `Session Files`

## MVP Scope

### In Scope

- workspace 手动注册与最近使用
- 按 workspace 聚合的 session 列表
- 新建 session
- 恢复已有 session
- 消息历史加载
- 流式消息输出
- 中止当前执行
- 当前 workspace 的 Git Changes 与 unified diff 查看

### Out of Scope

- 多 session tab 并发工作台
- 独立 PTY 终端
- `Session Files` 文件追踪与文件树
- 输入框 `/` 命令补全
- 输入框 `@文件` 搜索补全
- `steer` / `follow_up`
- WYSIWYG 或富文本编辑器
- provider 设置中心、登录页、多用户鉴权、远程共享

## Key Changes

### 1. 本地服务职责

- 提供一个 TypeScript Node 服务，同时负责 API、WebSocket、静态前端资源
- 服务只负责 Workbench 控制面：浏览器请求处理、UI 状态、workspace 注册、runtime 路由
- agent 相关能力通过 `AgentRuntime` 抽象访问，不把 Web 层直接绑到 `createAgentSession` / `SessionManager`
- 服务自有元数据单独持久化到本地，例如 `~/.pi-web/state.json`
- `state.json` 只保存服务自己的轻量元数据：
  - `schemaVersion`
  - 已注册 workspace 列表
  - 最近使用时间
  - 少量 UI 恢复状态，例如最近打开的 workspace / session
- `state.json` 不是 session 索引真相源，只保存服务自己的 cache 和 UI 状态
- agent 正文消息和历史继续沿用 `~/.pi/agent/sessions`，不重复发明会话存储
- session 与 workspace 的归属关系以 runtime 返回的 session 信息为准；对于 `LocalRuntimeAdapter`，其内部通过 `.pi` session header 中的 `cwd` 和 `SessionManager.list(cwd)` / `listAll()` 实现，不在 `state.json` 中维护权威映射
- `state.json` 所有写操作通过单一 write queue 串行执行，并采用“写临时文件后 rename”的原子写策略
- 启动时如果 `state.json` 损坏，服务应回退到空状态并记录告警日志，不阻塞启动

服务端约束：

- 不修改 `.pi` session 文件格式
- 不向 `.pi` session header 注入 Web 专用字段
- Web 工作台补充元数据仅保存在自己的私有状态中

### 1.1 Runtime 抽象

- 定义统一的 `AgentRuntime` 接口，负责：
  - workspace 校验
  - session 列表与恢复
  - session state 获取
  - prompt / abort
  - 消息分页读取
  - Git changes / diff
- MVP 只实现 `LocalRuntimeAdapter`
  - 与 `Workbench Service` 同机
  - 内部可直接使用 `createAgentSession`、`SessionManager`、本地 Git 和文件系统
- 长期演进预留 `RemoteRuntimeAdapter`
  - 通过 RPC 或其他进程间协议连接远端 agent 设备
  - workspace、session、Git、终端都归远端 runtime 所有
- Web API 面向 `AgentRuntime` 设计，不暴露“本地文件系统直读”这一实现假设

建议最小接口：

- `validateWorkspace(inputPath) -> { normalizedPath, isDirectory, isWritable, isGitRepo }`
- `listSessions(workspacePath, cursor, limit) -> { sessions, nextCursor }`
- `createSession(workspacePath, name?) -> { sessionHandle }`
- `resumeSession(sessionHandle) -> { sessionHandle }`
- `getSessionState(sessionHandle) -> SessionStateDto`
- `getSessionMessages(sessionHandle, beforeEntryId, limit) -> { messages, nextBeforeEntryId }`
- `prompt(sessionHandle, text) -> void`
- `abort(sessionHandle) -> void`
- `getGitChanges(workspacePath) -> GitChange[]`
- `getGitDiff(workspacePath, relativePath) -> DiffResult`

约束：

- `Workbench Service` 只依赖上述语义接口，不依赖 `LocalRuntimeAdapter` 的具体类或本地目录结构
- runtime 返回的数据必须已经是 Web 可消费 DTO，不把本地 SDK 类型直接泄漏到 API 层

### 2. Workspace 与 Session 行为

- Workspace 以“手动注册路径”为入口
- workspace 逻辑上隶属于某个 runtime；MVP 默认只有一个本地 runtime，因此 UI 暂不暴露 runtime 选择
- workspace 路径始终解释为“相对于所属 runtime 的路径”，不是 `Workbench Service` 自身文件系统的全局概念
- 后端在新增 workspace 时校验：
  - 路径存在
  - 是目录
  - 可读写
  - 是否是 Git 仓库单独标记，不强制必须是 Git 仓库
- UI 支持：
  - 新增 workspace
  - 查看最近使用 workspace
  - 以 workspace 维度列出历史 session
  - 新建 session
  - 恢复并继续某个已有 session
- Session 列表按 workspace 聚合，信息至少包含：
  - `sessionHandle`
  - `sessionId`
  - `sessionFile`
  - `sessionName`
  - `createdAt`
  - `updatedAt`
  - `lastMessagePreview`
- session 默认展示 runtime 当前 leaf 对应的 resolved branch 历史
- MVP 不暴露 tree UI，但所有读取消息、恢复会话、继续会话的行为都基于同一个 resolved branch 语义
- 后端允许同一 workspace 存在多个 session；但前端 MVP 同一时刻只聚焦一个 active session，不做 tab 化并发呈现
- agent 运行态完全以 `pi-coding-agent` 暴露的 `AgentState` 为准，不额外发明服务端 session 生命周期枚举
- 页面连接状态与 agent 状态分离：
  - agent 状态来自 `AgentState`，例如 `isStreaming`、`pendingToolCalls`、`error`
  - UI 状态由前端单独维护，例如 `connecting`、`connected`、`disconnected`、`hydrating`
- 服务重启或前端断线后，不尝试推断历史“运行中”状态；前端重新加载时以最新 `AgentState` 快照和消息历史为准

数据归属约束：

- workspace 路径、session 文件、Git 状态都属于 runtime 管辖范围
- `Workbench Service` 不要求直接访问 runtime 背后的真实文件系统
- 在本地 runtime 模式下，以上能力可由同机实现直接完成；在远端 runtime 模式下，统一通过 runtime 接口转发

### 3. 前端工作台布局

- 左侧：workspace 切换、当前 workspace 的 session 列表
- 中间：当前 active session 的消息区和输入区
- 右侧：可折叠 `Git Changes` 面板
- 顶部：当前 workspace、当前 session 名称、当前模型、agent 运行状态

MVP 原则：

- 默认只保留一个主要任务区，减少多面板同时抢焦点
- 右侧 `Git Changes` 可折叠，默认记住上次开关状态
- 不做底部终端面板

### 4. 输入框定义

- 不做 Notion 式富文本
- 第一版优先用简单可控实现，普通 `textarea` 或轻量编辑器均可；CodeMirror 不是必须前置条件
- 第一版必须支持：
  - 多行输入
  - 发送当前消息
  - 执行中显示禁用态或 loading 态
  - 手动 `abort`
- 第一版不包含：
  - `/` 自动补全
  - `@` 文件引用搜索
  - `steer`
  - `follow_up`
  - 复杂 Markdown 工具栏

### 5. 变更与 Diff 定义

- `Git Changes`：
  - 基于 runtime 所属 workspace 的真实 Git 工作区展示 `M/A/D/??`
  - 树状显示目录与文件
  - 点击文件可看 unified diff
  - 环境需安装 Git ≥ 2.x；若 Git 不存在，`Git Changes` 面板展示不可用提示，不影响其他功能
- 性能与降级约束：
  - 忽略 `.git`、`node_modules` 等明显不应展示的路径
  - 单次 diff 返回大小需设上限，超限时给出“文件过大，无法预览”的降级提示
  - 二进制文件不展示文本 diff，只展示文件状态
- 第一版不实现 `Session Files`

### 6. 安全与运行约束

- 服务默认只监听 `127.0.0.1`
- 同时校验 `Origin`，拒绝跨站请求
- 服务默认监听 `3000` 端口；端口冲突时启动报错退出，不自动切换端口
- 第一版不提供公网访问能力，不支持局域网共享

## Public APIs / Interfaces

### HTTP

**Workspaces**
- `GET /api/workspaces`
- `POST /api/workspaces` with `{ runtimeId?, path, name? }`
  - MVP 默认 `runtimeId = "local"`
- `DELETE /api/workspaces/:workspaceId` — 注销 workspace（不删除本地文件）

所有 HTTP 接口统一返回：

- 成功：`{ ok: true, data: ... }`
- 失败：`{ ok: false, error: { code, message } }`

返回对象建议至少包含：

- `workspaceId`
- `runtimeId`
- `path`
- `name`
- `isGitRepo`

**Sessions**
- `GET /api/workspaces/:workspaceId/sessions?cursor=&limit=`
  - 默认按 `updatedAt desc` 返回
  - 服务端分页，避免每次全量返回
- `POST /api/sessions` with `{ workspaceId, sessionHandle?, name? }`
  - 不传 `sessionHandle` 表示新建
  - 传 `sessionHandle` 表示恢复
  - 返回稳定 `sessionHandle`
  - 若 `sessionHandle` 对应的 session 不存在，返回 `404`
- `GET /api/sessions/:sessionHandle/messages?beforeEntryId=&limit=`
  - 按 entry 游标向前分页返回消息片段
  - 默认返回最近一页
- `GET /api/sessions/:sessionHandle/state`
  - 返回基于 `AgentState` 的稳定 DTO，例如 `{ model, thinkingLevel, isStreaming, pendingToolCalls, error }`
  - 字段语义与 `pi-coding-agent` 暴露状态保持一致
  - `pendingToolCalls` 在传输层表示为数组，不直接暴露 `Set`
- `POST /api/sessions/:sessionHandle/abort`

Session DTO 约束：

- `sessionHandle` 是 Web 层稳定标识，必须能唯一定位某个 runtime 上的某个 session
- 推荐格式：`<runtimeId>:<sessionId>`，也可以是服务端生成的 opaque handle
- 前端不依赖裸 `sessionId` 做路由

Message DTO 约束：

- 每条消息必须包含稳定 `entryId`
- HTTP 分页和 WS 增量都使用同一 `entryId` 语义
- 如果消息还未真正持久化成 entry，只能作为临时 streaming item 存在，不能冒充已落盘 entry

**Git**
- `GET /api/workspaces/:workspaceId/git/changes`
- `GET /api/workspaces/:workspaceId/git/diff?path=...`
  - `path` 必须是 workspace 内相对路径
  - runtime 对路径做 `normalize + resolve + workspace boundary check`

### WebSocket

浏览器维护单一全局 WebSocket 连接。所有 session 事件通过同一连接按 `sessionHandle` 路由分发。重连后通过 HTTP 拉取最新消息和状态，再继续订阅后续事件。

- Client events:
  - `session.prompt` — `{ sessionHandle, text }`
- Server events:
  - `session.started` — `{ sessionHandle }`
  - `session.state` — `{ sessionHandle, model?, thinkingLevel?, isStreaming, pendingToolCalls?, error? }`
  - `session.message_delta` — `{ sessionHandle, turnIndex, streamingMessageId, delta }`
  - `session.message_done` — `{ sessionHandle, turnIndex, entryId, message }`
  - `session.tool_started` — `{ sessionHandle, toolCallId, toolName, args }`
  - `session.tool_updated` — `{ sessionHandle, toolCallId, toolName, partialResult }`
  - `session.tool_finished` — `{ sessionHandle, toolCallId, toolName, entryId?, message? }`
  - `session.error` — `{ sessionHandle, message }`

设计约束：

- WS 只承担实时增量事件，不承担完整历史回放
- 历史消息和断线后的状态同步统一走 HTTP
- 不做 WS 断点续传或 replay；重连后允许丢失中间 partial delta，但最终消息必须可通过 HTTP 补齐
- 服务端对外发送稳定事件模型，不直接透传 SDK 原始事件对象
- 所有传输层字段必须可 JSON 序列化；例如 `pendingToolCalls` 使用数组而不是 `Set`
- WebSocket 连接属于浏览器与 `Workbench Service` 之间；`Workbench Service` 如何连接 runtime 是内部实现细节
- `session.message_done.entryId` 必须与 HTTP 消息列表中的同一条消息使用相同标识
- `session.message_delta` 使用临时 `streamingMessageId` 聚合增量；只有 `message_done` 后才形成稳定 entry
- tool 执行过程通过独立 WS 事件实时下发，不要求前端等到下一次 HTTP 补拉才看到工具进度

## Test Plan

- SDK 集成测试：
  - 新建 session
  - 恢复 session
  - 流式 prompt
  - abort
- Workspace 测试：
  - 注册合法路径
  - 拒绝不存在路径
  - 拒绝非目录路径
  - 最近使用排序
  - 按 workspace 列出 session
  - 注销 workspace 后不再出现在列表
- Runtime 抽象测试：
  - `LocalRuntimeAdapter` 满足统一 runtime 接口
  - Web API 不依赖 runtime 的本地文件系统细节
- Session 列表来源测试：
  - `LocalRuntimeAdapter` 下，workspace session 列表来自 `.pi` session header 中的 `cwd`
  - `state.json` 丢失后仍可从 `.pi` session 文件重建列表
- Session 标识测试：
  - 同一前端会话中所有 session API 和 WS 事件都使用 `sessionHandle`
  - 前端不依赖裸 `sessionId` 做路由
- State 持久化测试：
  - `state.json` 原子写成功
  - `state.json` 损坏后服务可降级启动
  - workspace 注册与 UI 恢复状态可正确恢复
- Service 重启恢复测试：
  - service 重启后，之前活跃 session 默认按“静态已恢复”状态加载
  - 只有用户重新打开或继续会话时，才重新附着活跃 runtime session 实例
- 消息分页测试：
  - 默认返回最近一页消息
  - 使用 `beforeEntryId` 可继续向前翻页
  - 翻页结果无重复、无遗漏
  - `message_done.entryId` 与后续 HTTP 拉取结果一致
- Tool 实时事件测试：
  - tool 开始、增量、结束都能通过 WS 收到
  - tool 完成后如产生持久化消息，其 `entryId` 与 HTTP 历史一致
- Branch 语义测试：
  - 恢复 session 时默认读取当前 leaf 对应的 resolved branch
  - 同一 session 的 state、messages、继续会话都基于同一个 leaf 语义
- Git 测试：
  - 修改/新增/删除/untracked 文件树
  - 单文件 diff 返回正确
  - 二进制文件降级展示
  - 超大 diff 降级展示
  - Git 不存在时面板降级展示
  - workspace 外路径请求被拒绝
- 前端 E2E：
  - 新增 workspace、注销 workspace
  - 新建 session、恢复 session
  - 发送消息并接收流式输出
  - 中止执行
  - 查看 `Git Changes` 和 diff
  - WebSocket 断线后通过 HTTP 恢复消息和状态

## Assumptions

- 浏览器目录选择器不作为第一版核心方案，因为它拿不到可直接给后端使用的真实 `cwd`；workspace 通过“在 UI 中注册 runtime 可解析的路径”解决
- 第一版默认 Chrome 系浏览器，但不依赖浏览器文件系统写能力
- 复用 `~/.pi/agent` 的鉴权和模型配置；Web UI 只展示当前状态，不做完整登录页
- 单机单用户，不做多用户鉴权、权限隔离、远程共享
- 后端允许多个 session 共存，但 MVP 前端不暴露多 tab 并发工作台
- `LocalRuntimeAdapter` 可通过 `simple-git` 库封装 Git 操作，不直接 shell exec；环境无 Git 时相关功能降级展示
- `.pi` session 文件中的 `cwd` 可作为 workspace 归属判断依据
- 断线恢复优先保证最终一致，不保证重连窗口内的每个流式 delta 都可补播
- MVP 只实现本地 runtime，但接口设计需允许未来接入远端 runtime
- `LocalRuntimeAdapter` 可以使用 `SessionManager`、本地 Git 和文件系统作为实现手段，但这些不属于 Web API 契约的一部分
- service 重启后不尝试自动恢复之前的活跃内存 session 实例；MVP 默认恢复为静态已持久化视图

## Post-MVP

以下能力明确延后，不混入第一版验收范围：

- 远端 runtime / remote agent 接入
- 多 session tab 与并发会话工作台
- 独立 PTY 终端与 transcript 持久化
- `Session Files` 追踪
- `/` 命令补全、`@文件` 搜索
- `steer` / `follow_up`
- 更复杂的状态恢复与后台运行可视化
