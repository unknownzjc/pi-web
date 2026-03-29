# Pi Web Workbench 后端实现计划（按 Architecture 稿）

## Summary

基于 [pi-web-workbench-architecture.md](/Users/unknownzjc/Documents/Code/pi-web/docs/designs/pi-web-workbench-architecture.md)，第一阶段只实现 `Workbench Service + LocalRuntimeAdapter`，把 Web 层、runtime 抽象、状态存储、HTTP/WS 契约一次定稳，但只落本地 runtime，不做 remote runtime、terminal、WS replay。

实现目标是得到一个可运行的 `Hono` 服务，具备以下能力：

- 管理 workspace 注册、恢复、删除与最近使用
- 基于 `LocalRuntimeAdapter` 创建 / 恢复 / 查询 session
- 提供 session state、消息分页、Git changes / diff
- 提供单一 WebSocket 实时流通道
- 统一使用稳定 DTO：`sessionHandle`、`entryId`、`SessionStateDto`、`SessionMessageDto`

## Implementation Changes

### 1. 服务骨架与依赖注入

建立 `src/server`, `src/routes`, `src/services`, `src/runtime`, `src/state`, `src/utils` 这 6 个模块域，并固定职责边界：

- `src/server`
  - 创建 `Hono` app、注册 routes、WS 升级入口、统一错误映射
- `src/routes`
  - 只负责 request parsing、schema 校验、调用 service、返回 envelope
- `src/services`
  - 实现 workspace/session/git/subscription 业务编排
- `src/runtime`
  - 定义 `AgentRuntime`、`RuntimeRegistry`、`LocalRuntimeAdapter`
- `src/state`
  - 实现 `state.json` 读写、schema version、原子写、损坏降级
- `src/utils`
  - 放路径安全、cursor 编解码等纯函数

服务启动时一次性组装依赖：

- `StateStore`
- `RuntimeRegistry`
- `LocalRuntimeAdapter`
- `WorkspaceService`
- `SessionService`
- `GitService`
- `SubscriptionService`

默认只注册一个 runtime：`local`。

### 2. 共享契约与 DTO 落地

先把架构稿中的契约落成共享类型，作为后续所有 route/service/runtime 的单一真相源：

- request DTO
  - `CreateWorkspaceRequestDto`
  - `CreateOrResumeSessionRequestDto`
  - `SessionListQueryDto`
  - `SessionMessagesQueryDto`
- response DTO
  - `WorkspaceDto`
  - `SessionSummaryDto`
  - `SessionStateDto`
  - `SessionMessageDto`
  - `SessionMessagesPageDto`
  - `GitChangesDto`
  - `GitDiffDto`
  - `OkResponseDto<T>`
  - `ErrorResponseDto`
  - `ErrorDto`
- WS DTO
  - `ClientWsEvent`
  - `ServerWsEvent`
- runtime contract
  - `AgentRuntime`
  - runtime inputs/results/events

固定以下协议，不允许实现阶段再漂移：

- `POST /api/workspaces` 请求体为 `{ runtimeId?: string, path, name? }`
- `POST /api/sessions` 请求体为 `{ workspaceId, sessionHandle?: string, name? }`
- 所有 session 路由和 WS 事件都只使用 `sessionHandle`
- 所有消息历史和最终消息都只使用 `entryId`
- 所有 HTTP 接口都返回 envelope，不返回裸 DTO

### 3. State Store 与 Workspace 管理

实现 `~/.pi-web/state.json` 的最小私有存储，只存：

- `schemaVersion`
- `workspaces`
- `lastUsedAt`
- `ui restore state`

行为约束：

- 原子写：`tmp + rename`
- 启动时容忍损坏文件，降级为空状态并打印告警
- 不把 session 列表、消息历史、agent 运行态写进 `state.json`

`WorkspaceService` 负责：

- 注册 workspace
  - 走 runtime `validateWorkspace`
  - 校验通过后生成 `workspaceId`
  - 保存 `runtimeId/path/name/isGitRepo/lastUsedAt`
- 列出 workspace
  - 按最近使用排序
- 删除 workspace
  - 只删 registry，不删真实目录
- 查找 workspace
  - 所有后续 session/git 请求都通过 `workspaceId` 找到 `runtimeId + path`

### 4. Runtime 抽象与 LocalRuntimeAdapter

按文档完整实现 `AgentRuntime` 接口，但第一版只有 `LocalRuntimeAdapter`。

`LocalRuntimeAdapter` 需要处理 4 类职责：

- workspace
  - 本地校验目录存在、是否可写、是否 Git repo
- session list
  - 使用 `.pi` session 信息枚举指定 `workspacePath` 下的 session
  - 生成稳定 `sessionHandle`
  - 返回 `SessionSummaryDto` 分页结果
- active session
  - 管理内存中的活跃 `AgentSession` 实例映射
  - 支持 create / resume / prompt / abort / state
- persisted session
  - 对非活跃 session 返回静态 `SessionStateDto`
  - `isStreaming = false`
  - `pendingToolCalls = []`

明确恢复语义：

- service 重启后，不尝试自动恢复旧的活跃内存实例
- 所有 session 初始以静态 persisted 视图暴露
- 用户再次恢复或继续会话时，才懒创建新的活跃 runtime session

### 5. Session Service、分页与 branch 语义

`SessionService` 负责把 workspace 维度和 runtime 维度拼起来：

- `listSessions(workspaceId, cursor, limit)`
- `createSession(workspaceId, name?)`
- `resumeSession(workspaceId, sessionHandle)`
- `getSessionState(sessionHandle)`
- `getSessionMessages(sessionHandle, beforeEntryId, limit)`
- `abort(sessionHandle)`
- `prompt(sessionHandle, text)`

固定消息读取语义：

- session 永远面向“当前 leaf”
- 消息列表返回从 root 到当前 leaf 的 resolved branch
- `beforeEntryId` 用于向前分页
- 默认返回最近一页
- 不做 branch 切换 API

分页规则：

- session list：opaque cursor，按 `updatedAt desc`
- messages：`beforeEntryId`
- 前端只消费 cursor，不参与排序逻辑

### 6. Git Service 与路径安全

`GitService` 只暴露两个能力：

- `GET /api/workspaces/:workspaceId/git/changes`
- `GET /api/workspaces/:workspaceId/git/diff?path=...`

实现要求：

- 输入路径必须是 workspace 内相对路径
- runtime 侧执行 `normalize + resolve + workspace boundary check`
- 越界返回 `path_out_of_workspace`
- 大 diff 和二进制文件做降级
- Git 缺失时返回 `git_unavailable`，不影响其他 API

### 7. Hono Routes 与统一错误处理

实现 4 组 routes：

- `workspaces`
- `sessions`
- `git`
- `health`

所有 route 统一遵守：

- 显式 schema 校验
- 失败返回 `{ ok: false, error }`
- 成功返回 `{ ok: true, data }`
- route 不直接调用底层 agent SDK，只调 service
- 内部异常统一映射为 `internal_error`

错误映射至少覆盖：

- `workspace_not_found`
- `workspace_invalid`
- `session_not_found`
- `session_busy`
- `runtime_unavailable`
- `git_unavailable`
- `path_out_of_workspace`
- `internal_error`

### 8. WebSocket 与订阅模型

实现单一 `/ws` 入口，由 `SubscriptionService` 负责：

- 管理浏览器连接
- 将 runtime event 广播给订阅中的客户端
- 处理 client event：
  - `session.prompt`
  - `session.abort`

事件转换规则：

- runtime 内部事件先标准化，再发 `ServerWsEvent`
- 前端只看到稳定事件，不看到 SDK 原始 event
- 支持以下事件：
  - `session.started`
  - `session.state`
  - `session.message_delta`
  - `session.message_done`
  - `session.tool_started`
  - `session.tool_updated`
  - `session.tool_finished`
  - `session.error`

连接语义：

- 不做 replay
- 断线后由前端自己走 HTTP 拉 `state + latest messages page`
- `message_done.entryId` 必须能和 HTTP 历史分页结果一一对上

## Public APIs / Interfaces

### HTTP

- `GET /api/workspaces`
- `POST /api/workspaces`
- `DELETE /api/workspaces/:workspaceId`
- `GET /api/workspaces/:workspaceId/sessions?cursor=&limit=`
- `POST /api/sessions`
- `GET /api/sessions/:sessionHandle/state`
- `GET /api/sessions/:sessionHandle/messages?beforeEntryId=&limit=`
- `POST /api/sessions/:sessionHandle/abort`
- `GET /api/workspaces/:workspaceId/git/changes`
- `GET /api/workspaces/:workspaceId/git/diff?path=...`
- `GET /api/health`

### Core Type Boundaries

- `sessionHandle`
  - 推荐 `<runtimeId>:<sessionId>`，但对外只视为 opaque string
- `entryId`
  - 持久化消息唯一键
- `SessionStateDto`
  - 只暴露 `AgentState` 的可传输子集
- `SessionMessageDto`
  - 统一承载历史消息和最终消息
- `ServerWsEvent`
  - 实时层唯一协议

## Test Plan

### 单元测试

- `state-store`
  - 原子写成功
  - 文件损坏时可降级读取
- `path-safety`
  - 正常相对路径通过
  - `../` 越界拒绝
- `cursor`
  - session list cursor 编解码稳定

### runtime 集成测试

- `LocalRuntimeAdapter.validateWorkspace`
  - 合法目录
  - 不存在路径
  - 非目录路径
- session 生命周期
  - create session
  - resume session
  - prompt
  - abort
- session list
  - 按 `workspacePath` 正确过滤
  - 生成稳定 `sessionHandle`
- session state
  - 活跃 session 返回实时状态
  - 非活跃 session 返回静态状态
  - service 重启后不自动恢复活跃实例
- message pagination
  - 默认返回最新页
  - `beforeEntryId` 向前分页
  - resolved branch 读取正确

### route / service 测试

- 所有 route 返回 envelope
- 非法 body / query 返回 `400`
- workspace 不存在返回 `workspace_not_found`
- 无效 `sessionHandle` 返回 `session_not_found`
- Git 不可用返回 `git_unavailable`
- diff 越界返回 `path_out_of_workspace`

### WebSocket 测试

- `session.prompt` 能触发 runtime prompt
- `session.message_delta` 和 `session.message_done` 顺序正确
- tool 事件能完整透传为稳定 `ServerWsEvent`
- 断开重连后不做 replay，但 HTTP 能补齐最终状态

## Assumptions And Defaults

- 运行时环境为 Node.js，服务框架固定为 `Hono`
- MVP 只实现 `LocalRuntimeAdapter`，`runtimeId` 默认 `local`
- `.pi` 是 session 真相源，`state.json` 不是
- 不实现 remote runtime、terminal、session tree UI、WS replay
- session 恢复与路由一律使用 `sessionHandle`
- 消息最终一致性靠 HTTP，WS 只负责实时增量
- service 重启后 session 默认先以静态已持久化视图恢复
