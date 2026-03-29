# Pi Web Workbench Frontend Design

## Purpose

这份文档定义 `Pi Web Workbench` 的前端设计与实现边界，覆盖：

- 前端信息架构
- 页面和组件结构
- 状态模型
- 数据获取与 WebSocket 集成
- 交互流
- 响应式和可访问性要求
- 视觉方向与设计约束

后端与接口契约以以下文档为准：

- [Pi Web Workbench MVP](./pi-web-workbench-mvp.md)
- [Pi Web Workbench Architecture](./pi-web-workbench-architecture.md)

传输前提：

- 所有 HTTP 接口统一返回 `OkResponseDto<T> | ErrorResponseDto`
- 前端在 transport / API client 层统一解包 `data` 或抛出结构化错误
- 业务组件、页面状态和渲染逻辑不直接处理 envelope 结构

## Design Context

当前仓库没有现成的品牌上下文、目标用户访谈或视觉规范，因此先采用以下默认前提：

- 目标用户：高频使用代码 agent 的工程师
- 使用场景：在浏览器中管理 workspace、恢复 session、查看输出和代码变更
- 气质：专业、克制、高信息密度、偏工具型而非营销型
- 成功标准：信息定位快、状态清晰、长时间使用不疲劳、和代码工作流一致

这意味着第一版优先做：

- 清晰的信息层级
- 稳定的状态反馈
- 良好的长列表与长消息阅读体验
- 强结构而不是重装饰

## Product UX Principles

### 1. Single Focus

- 同一时刻只强调一个 active session
- 其他信息都是辅助，不抢主会话焦点
- 不用多 tab 工作台，不用多栏同时争夺视觉中心

### 2. Fast Orientation

- 用户进入页面后，3 秒内必须知道：
  - 当前在哪个 workspace
  - 当前是哪个 session
  - agent 是否正在运行
  - 最近的消息和变更在哪里

### 3. Stable Mental Model

- session 列表、消息历史、Git changes 都围绕当前 active session / workspace 组织
- UI 不暴露底层 session tree，但所有会话操作语义保持一致
- streaming 是“当前回复正在生成”，不是“消息已经持久化完成”

### 4. Explicit States

- loading、empty、running、error、disconnected 必须显式可见
- 不依赖动画或隐式位置变化传达关键状态

## Visual Direction

### Tone

- 工程工作台
- 克制、冷静、密度高
- 偏编辑器/IDE 辅助面板，而不是聊天应用或 AI 营销页面

### Layout Character

- 左侧固定导航
- 中间主会话区
- 右侧按需展开的 Git changes
- 全局背景和装饰极简，重点通过排版、间距、边界和状态色建立层级

### Typography

- 不追求花哨显示字体
- 使用一组稳健、易读、适合长时间阅读的 sans font 作为主体
- 代码、路径、ID、状态值用 monospace
- 强调层级靠字重、大小、间距，不靠大面积彩色块

### Color

- 以浅色主题为默认设计目标
- 中性底色带轻微冷灰或蓝灰偏色
- 只有少量强调色：
  - 运行态：偏蓝
  - 成功/完成：偏绿
  - 警告：偏橙
  - 错误：偏红
- Git 状态色保持工具型语义：
  - modified
  - added
  - deleted
  - untracked

### Motion

- 只在 3 类场景使用动画：
  - 页面初次进入
  - Git drawer 展开/收起
  - streaming 状态变化
- 动画必须短、克制、服务状态表达

## Information Architecture

## App Shell

```text
+----------------------------------------------------------------------------------+
| Header                                                                           |
+------------------------+----------------------------------+----------------------+
| Workspace Sidebar      | Session Main Area                | Git Changes Drawer   |
|                        |                                  | (collapsible)        |
| - workspace switcher   | - session header                 | - toolbar            |
| - recent workspaces    | - message timeline               | - file tree          |
| - session list         | - composer                       | - diff preview       |
|                        |                                  |                      |
+------------------------+----------------------------------+----------------------+
```

### Regions

#### 1. Header

展示全局上下文与系统状态：

- 当前 workspace 名称
- 当前 session 名称
- 当前模型
- agent 运行状态
- 连接状态

Header 目标是“快速定向”，不放重操作按钮。

#### 2. Workspace Sidebar

承担导航和切换职责：

- workspace selector
- add workspace
- 当前 workspace 的 session 列表
- 最近使用 workspace

Sidebar 永远存在，不做临时弹层式导航。

#### 3. Session Main Area

主任务区：

- session header
- 消息时间线
- 输入框

所有主要操作都在这个区域完成。

#### 4. Git Changes Drawer

辅助区：

- 默认可折叠
- 跟随当前 workspace
- 展示变更文件树和 diff

它是 secondary surface，不应该压过主消息区。

## Routes

MVP 建议只保留极少页面：

### `/`

主页 / 默认工作台。

状态分支：

- 未注册 workspace
- 已注册 workspace 但未选中 session
- 已选中 session

### Optional: `/workspace/:workspaceId`

如果需要 URL 深链，可映射到当前 workspace。

### Optional: `/workspace/:workspaceId/session/:sessionHandle`

如果需要 URL 深链，可映射到当前 active session。

建议：

- UI 内部可以先按单页应用实现
- URL 深链做轻量同步，不让路由驱动复杂状态机

## Core Screens

### 1. Empty Workspace State

触发条件：

- 系统中没有已注册 workspace

内容：

- 标题：说明这是一个本地 / runtime workspace 工作台
- 一个主操作：注册 workspace
- 一段极短说明：路径由所属 runtime 解析

设计要求：

- 不要用大插画
- 不要做营销式空状态
- 让用户快速进入第一次成功路径

### 2. Workspace Selected, No Active Session

触发条件：

- 已选择 workspace
- 当前没有 active session

内容：

- 当前 workspace 信息
- 最近 session 列表
- 主操作：新建 session
- 辅助操作：恢复最近 session

### 3. Active Session

主界面状态。

内容：

- session header
- timeline
- composer
- 可选展开的 Git changes

## Component Design

### AppShell

职责：

- 组织全局布局
- 承载 header、sidebar、main、drawer
- 管理响应式断点行为

### HeaderBar

职责：

- 展示全局状态
- 不做复杂交互

建议字段：

- workspace chip
- session title
- model badge
- runtime badge
- connection status badge
- agent status badge

### WorkspaceSidebar

子组件：

- `WorkspaceSwitcher`
- `AddWorkspaceButton`
- `SessionList`

设计要求：

- session 项高度紧凑
- 必须能承受较长 session 名称和 preview
- 当前 active session 高亮明显但克制

### SessionListItem

每项至少包含：

- sessionName
- updatedAt
- lastMessagePreview
- 是否当前选中

避免：

- 展示过多二级元数据
- 把 `sessionId` 当用户主要可读信息

### SessionMain

子组件：

- `SessionHeader`
- `MessageTimeline`
- `Composer`

### SessionHeader

展示：

- sessionName
- workspacePath
- model
- agent state

操作：

- abort
- refresh state

第一版不放设置类操作。

### MessageTimeline

职责：

- 展示 resolved branch 历史
- 支持长消息阅读
- 支持“向前加载更多”
- 接入 streaming 临时消息
- 接入 tool execution 临时状态与最终结果

要求：

- streaming 消息和已持久化消息样式相近，但状态上可区分
- `entryId` 只作为内部 key，不必在 UI 暴露
- tool 正在执行时可显示独立中的执行卡片，不要求伪装成已落盘消息

### MessageItem

按 role 分化：

- `user`
- `assistant`
- `toolResult`
- `bashExecution`
- `custom`
- `branchSummary`
- `compactionSummary`

MVP 可只精细处理前 3 类，其余先做兼容型渲染。

### Composer

职责：

- 多行输入
- 发送
- streaming 时 abort

MVP 第一版：

- 使用简单文本输入结构
- 不做 slash menu
- 不做 mentions
- 不做复杂 markdown toolbar

### GitChangesDrawer

子组件：

- `GitChangesToolbar`
- `GitFileTree`
- `GitDiffPane`

交互要求：

- Drawer 默认记住开关状态
- 在窄屏下退化为覆盖式 panel

### GitFileTree

展示：

- 文件状态标记
- 树形路径
- 当前选中项

要求：

- 支持长路径截断
- 保持可扫描性优先于完整展开

### GitDiffPane

要求：

- 统一等宽字体
- 长 diff 可滚动
- 二进制和超大 diff 有明确降级 UI

## Frontend State Model

建议拆成 4 层状态：

### 1. App State

- workspaces
- selectedWorkspaceId
- activeSessionHandle
- connectionStatus

### 2. Session Cache

按 `sessionHandle` 维护：

- `state`
- `messagesPage`
- `hasMoreHistory`
- `streamingDraft`
- `loadingFlags`

### 3. UI State

- gitDrawerOpen
- selectedGitPath
- sidebarCollapsed
- messageListScrollState

### 4. Request State

- add workspace pending
- session list loading
- session history loading
- prompt sending
- abort pending

## Suggested Client Types

```ts
export interface FrontendAppState {
  workspaces: WorkspaceDto[];
  selectedWorkspaceId?: string;
  activeSessionHandle?: string;
  connectionStatus: "connecting" | "connected" | "disconnected" | "hydrating";
}

export interface FrontendSessionState {
  summary: SessionSummaryDto;
  state?: SessionStateDto;
  messages: SessionMessageDto[];
  nextBeforeEntryId?: string;
  hasLoadedInitialPage: boolean;
  isLoadingHistory: boolean;
  streamingDraft?: {
    streamingMessageId: string;
    turnIndex: number;
    role: "assistant";
    text: string;
  };
  toolDrafts?: Array<{
    toolCallId: string;
    toolName: string;
    status: "running" | "done";
    partialResult?: unknown;
    entryId?: string;
  }>;
}

export interface FrontendUiState {
  gitDrawerOpen: boolean;
  selectedGitPath?: string;
}
```

## Data Fetching Model

### Initial Boot

1. 拉取 workspace 列表
2. 恢复上次 workspace / session
3. 建立 WS
4. 拉取 active session 的 state 和最新消息页

补充约束：

- 所有初始 HTTP 请求都先在 transport 层解包 `OkResponseDto`
- 如果 service 返回 `ErrorResponseDto`，页面只消费标准错误对象，不依赖 route 级特殊格式

### Switch Workspace

1. 更新 selectedWorkspaceId
2. 拉取该 workspace session 列表
3. 清空当前 active session 视图或切到默认 session
4. 刷新 Git changes

### Open Session

1. 设置 activeSessionHandle
2. 拉取 session state
3. 拉取最近消息页
4. 清空旧的 streamingDraft

### Load More Messages

1. 读取 `nextBeforeEntryId`
2. 请求上一页
3. prepend 到 timeline
4. 保持滚动位置稳定

## WebSocket Integration

### Handling `session.state`

- 覆盖 `FrontendSessionState.state`
- 如果当前 active session 匹配，则同步更新 header 状态

### Handling `session.message_delta`

- 以 `streamingMessageId` 聚合到 `streamingDraft`
- 不直接写入已持久化 `messages`

### Handling `session.message_done`

- 删除对应 `streamingDraft`
- 将稳定 `message` 写入 `messages`
- 使用 `entryId` 去重

### Handling `session.tool_started`

- 按 `toolCallId` 创建或更新 `toolDrafts`
- 状态记为 `running`
- 在时间线中以临时执行卡片展示工具名和输入摘要

### Handling `session.tool_updated`

- 按 `toolCallId` 更新已有 `toolDrafts`
- 增量写入 `partialResult`
- 不直接伪造持久化 `messages`

### Handling `session.tool_finished`

- 若事件内带 `entryId + message`，将该消息并入 `messages`
- 对应 `toolDraft` 标记为 `done`
- 若该工具结果已被持久化成消息，则可在下一轮渲染中移除临时卡片

### Handling Disconnect

- `connectionStatus = disconnected`
- 当前视图保留
- 不清空历史
- 重连后重新拉取 `state + latest messages page`

### Handling Service Restart

- service 重启后，前端应允许 session 先以“静态已恢复”视图显示
- 此时历史消息仍可见，但 `isStreaming = false`，且不假设存在活跃 runtime 执行实例
- 只有用户重新继续会话或显式恢复后，前端才将其视为重新附着到活跃 runtime

## Core User Flows

### Flow 1: First Use

1. 进入空状态页
2. 输入 workspace 路径
3. 成功后展示 workspace 视图
4. 点击新建 session
5. 进入 active session 界面

### Flow 2: Resume Existing Session

1. 从 sidebar 选择 workspace
2. 从 session list 选择一项
3. 加载历史和状态
4. 继续发送消息

### Flow 3: Inspect Git Changes While Chatting

1. 打开 Git drawer
2. 选择文件
3. 查看 diff
4. 保持当前 session 上下文不变

### Flow 4: Reconnect After Network Drop

1. 顶部显示 disconnected
2. 自动重连
3. 成功后进入 hydrating
4. 拉 state 和消息
5. 回到 connected

## Empty / Error / Loading States

### Loading

- workspace list skeleton
- session list skeleton
- message timeline skeleton
- diff skeleton

### Empty

- no workspace
- no sessions in workspace
- no git changes

### Error

- workspace register failed
- session load failed
- prompt failed
- git unavailable
- disconnected

要求：

- 错误必须和用户当前操作绑定
- 不用全局 toast 滥发错误
- 尽量在对应区域内内联展示

## Responsive Strategy

### Desktop

- 三段式布局：sidebar / main / drawer

### Tablet

- 保留 sidebar
- Git drawer 改窄

### Mobile

- sidebar 改抽屉
- Git changes 改全屏覆盖 panel
- header 保留最关键状态
- timeline 和 composer 优先级最高

MVP 即使先以 desktop 为主，也要保证移动端不崩。

## Accessibility

### Required

- 所有交互元素有清晰 focus state
- keyboard 可操作：
  - session list
  - message input
  - send
  - abort
  - Git file selection
- 颜色不是唯一状态来源
- loading 和 error 可被辅助技术感知

### Semantics

- sidebar 用导航语义
- timeline 用列表语义
- diff 作为内容区，不做假表格

## Frontend Implementation Guidelines

### Component Rules

- 容器组件和展示组件分离
- 每个组件只处理一个清晰职责
- 不把 WS 逻辑散落在多个叶子组件里

### State Rules

- `sessionHandle` 是 session 相关所有状态的唯一主键
- `entryId` 是消息列表唯一主键
- `streamingMessageId` 只用于临时流式状态

### Rendering Rules

- 消息列表要支持增量插入和向前 prepend
- 任何 derived UI 都优先从 DTO 推导，不手写平行缓存

### Styling Rules

- 使用设计 token
- 颜色、边框、间距、字号有统一变量
- 避免组件局部随意定义视觉规则

## Suggested Design Tokens

```ts
export const tokens = {
  radius: {
    sm: "8px",
    md: "12px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
  },
  layout: {
    sidebar: "280px",
    gitDrawer: "360px",
    contentMax: "980px",
  },
};
```

## Post-MVP Frontend

- multi-tab sessions
- command / mention menus
- richer message rendering
- terminal panel
- session tree UI
- runtime switcher
- theme customization

## Open Questions

这几项不阻塞文档，但值得在实现前确认：

- session list 是否需要分组到“今天 / 本周 / 更早”
- workspace 名称是否允许用户手工覆盖路径名
- active session 是否需要 URL 深链
- 移动端是否作为正式支持目标还是仅保证可用
