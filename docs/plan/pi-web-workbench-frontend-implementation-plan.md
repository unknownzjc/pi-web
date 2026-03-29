# Pi Web Workbench Frontend Implementation Plan

## Goal

基于 [Pi Web Workbench Frontend Design](../designs/pi-web-workbench-frontend.md) 落地一版可交付的前端 MVP，技术栈为：

- React
- Zustand
- Tailwind CSS
- BaseUI

这版实现优先保证：

- 工作台主链路完整可用
- 状态边界清晰
- 流式消息与工具执行状态可正确呈现
- Git changes 作为辅助区域稳定可用
- 桌面端体验优先，同时移动端不崩

## Scope

本计划覆盖：

- 前端工程初始化
- 应用壳层与页面结构
- 状态管理拆分
- HTTP / WebSocket 数据接入
- 关键组件实现
- 空态、加载态、错误态
- 响应式和可访问性
- 联调与测试

本计划不包含：

- 多 tab 会话
- command / mention 菜单
- 复杂富文本渲染
- terminal panel
- session tree UI
- 主题自定义

## Implementation Principles

- 先打通主链路，再补增强功能
- 状态主键明确，不引入复杂状态机
- WebSocket 逻辑集中，不散落到叶子组件
- 优先从后端 DTO 推导 UI，避免维护平行缓存
- 用最小可维护方案实现，不做额外抽象

## Recommended Stack

### Core

- `react`
- `react-dom`
- `typescript`
- `vite`

### State

- `zustand`

### UI

- `tailwindcss`
- `@tailwindcss/typography`
- `baseui`
- `styletron-engine-atomic`
- `styletron-react`

### App Infrastructure

- `react-router-dom`
- `clsx`

### Testing

- `vitest`
- `@testing-library/react`
- `@testing-library/user-event`
- `jsdom`

## Project Structure

建议目录结构：

```text
src/
  app/
    providers/
      app-providers.tsx
    router/
      index.tsx
    store/
      app-store.ts
      session-store.ts
      ui-store.ts
      request-store.ts
  api/
    transport.ts
    client.ts
    workspaces.ts
    sessions.ts
    git.ts
    ws.ts
  features/
    shell/
      app-shell.tsx
      header-bar.tsx
      workspace-sidebar.tsx
      git-changes-drawer.tsx
    sessions/
      session-main.tsx
      session-header.tsx
      message-timeline.tsx
      message-item.tsx
      composer.tsx
    workspaces/
      workspace-switcher.tsx
      add-workspace-dialog.tsx
      session-list.tsx
      session-list-item.tsx
    git-changes/
      git-changes-toolbar.tsx
      git-file-tree.tsx
      git-diff-pane.tsx
  components/
    feedback/
    layout/
    ui/
  styles/
    globals.css
    tokens.css
  types/
    dto.ts
    view-model.ts
```

## UI Architecture

前端整体采用单页工作台结构：

- Header：展示当前 workspace、session、模型、连接状态、agent 状态
- Sidebar：负责 workspace 切换、注册 workspace、session 列表导航
- Main：负责 session header、timeline、composer
- Git Drawer：负责 Git 文件树和 diff 查看

路由建议保持轻量：

- `/` 作为默认工作台入口
- 可选支持 `/workspace/:workspaceId`
- 可选支持 `/workspace/:workspaceId/session/:sessionHandle`

原则：

- 路由只做 URL 同步
- 页面主状态仍由 store 控制
- 不让路由承担复杂状态恢复逻辑

## State Model

按 4 层状态拆分 Zustand store。

### 1. App Store

职责：

- `workspaces`
- `selectedWorkspaceId`
- `activeSessionHandle`
- `connectionStatus`
- 启动恢复逻辑

### 2. Session Store

按 `sessionHandle` 维护 session cache：

- `summary`
- `state`
- `messages`
- `nextBeforeEntryId`
- `hasLoadedInitialPage`
- `isLoadingHistory`
- `streamingDraft`
- `toolDrafts`

关键规则：

- `sessionHandle` 是 session 维度唯一主键
- `entryId` 是消息唯一主键
- `streamingMessageId` 只用于临时流式状态

### 3. UI Store

职责：

- `gitDrawerOpen`
- `selectedGitPath`
- `sidebarOpen` 或移动端 drawer 状态
- `messageListScrollState`

### 4. Request Store

职责：

- workspace 注册 pending
- session list loading
- session state loading
- history loading
- prompt sending
- abort pending

## Data Layer

### HTTP Transport

统一在 `transport.ts` 做 envelope 解包：

- 输入：`OkResponseDto<T> | ErrorResponseDto`
- 输出：业务 `data`
- 错误：统一转换成结构化前端错误对象

规则：

- 页面和组件不直接处理 envelope
- API module 只返回业务数据
- 区域错误在对应区域内展示，不依赖全局 toast

### API Modules

建议拆分：

- `workspaces.ts`
- `sessions.ts`
- `git.ts`

每个模块只负责：

- 请求组装
- 返回值类型
- 调用 transport

不负责 UI 状态。

### WebSocket Adapter

在 `ws.ts` 内集中处理连接、重连、事件分发，不在组件内直接订阅原始事件。

事件处理规则：

- `session.state`：覆盖 session state
- `session.message_delta`：聚合到 `streamingDraft`
- `session.message_done`：写入稳定消息并清理 draft
- `session.tool_started`：创建或更新 `toolDraft`
- `session.tool_updated`：更新工具临时结果
- `session.tool_finished`：合并稳定消息并标记完成
- `disconnect`：只标记连接状态，不清空当前视图
- `reconnect`：重拉 active session state 和最新消息页

## Design Tokens

使用 Tailwind + CSS variables 统一 token，BaseUI 组件在主题层与 token 对齐。

首批 token 建议覆盖：

- color
- spacing
- radius
- border
- layout width
- font family
- focus ring

建议默认值：

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

## Component Plan

### AppShell

职责：

- 管理三段式布局
- 处理桌面 / 平板 / 移动端退化
- 承载 header、sidebar、main、drawer

### HeaderBar

展示：

- workspace chip
- session title
- model badge
- runtime badge
- connection status
- agent status

要求：

- 信息密度高
- 不放复杂主操作

### WorkspaceSidebar

包含：

- `WorkspaceSwitcher`
- `AddWorkspaceButton`
- `SessionList`

要求：

- session 项紧凑
- 长标题和 preview 可截断
- 当前 active session 高亮明显但克制

### SessionMain

包含：

- `SessionHeader`
- `MessageTimeline`
- `Composer`

### MessageTimeline

重点处理：

- 初始历史消息加载
- 向前加载更多
- prepend 时滚动位置保持
- streaming draft 合并展示
- tool draft 临时卡片展示

要求：

- streaming 消息和已落盘消息视觉接近，但状态明确区分
- 非关键 message type 先做兼容型渲染

### Composer

MVP 范围：

- 多行输入
- 发送
- streaming 时 abort
- 错误内联展示

明确不做：

- slash menu
- mentions
- markdown toolbar

### GitChangesDrawer

包含：

- `GitChangesToolbar`
- `GitFileTree`
- `GitDiffPane`

要求：

- 记住开关状态
- 窄屏退化为覆盖式 panel
- 大 diff、二进制 diff 有降级 UI

## Delivery Phases

### Phase 1: Scaffold

目标：初始化可开发工程。

任务：

- 初始化 Vite React TypeScript
- 接入 Tailwind
- 接入 BaseUI 与 Styletron
- 建立全局 providers
- 建立基础目录结构
- 建立 token 和全局样式

完成标准：

- 项目可启动
- 页面能渲染基础壳层
- 样式系统和 BaseUI 可以同时工作

### Phase 2: App Shell

目标：完成工作台骨架和静态布局。

任务：

- 实现 `AppShell`
- 实现 `HeaderBar`
- 实现 `WorkspaceSidebar`
- 实现 `SessionMain` 静态结构
- 实现 `GitChangesDrawer` 静态结构
- 补空态和 skeleton 占位

完成标准：

- 三段式布局稳定
- 窄屏不会崩
- 空态、加载态可见

### Phase 3: State and Data Layer

目标：建立可联调的数据骨架。

任务：

- 实现 transport unwrap
- 实现 API modules
- 实现 app/session/ui/request 四层 store
- 实现启动恢复逻辑
- 接入 workspace 列表和 session 列表请求

完成标准：

- workspace 和 session 可从接口加载
- 当前选中状态可恢复
- 页面不直接依赖接口 envelope

### Phase 4: Session Flow

目标：打通会话主链路。

任务：

- 打开 session 时拉取 state
- 拉取最新消息页
- 支持无 active session 状态
- 实现 session header
- 实现 timeline 基础消息渲染
- 实现 composer 发送

完成标准：

- 用户可进入一个 session
- 能看到历史消息
- 能发送新消息

### Phase 5: Streaming and Tool Drafts

目标：打通 WebSocket 和流式交互。

任务：

- 建立 WS 连接与重连
- 接入 `session.message_delta`
- 接入 `session.message_done`
- 接入 `session.tool_started`
- 接入 `session.tool_updated`
- 接入 `session.tool_finished`
- 实现 streaming 中止

完成标准：

- assistant 回复可以流式显示
- 工具执行状态可在 timeline 内临时展示
- message 落盘后不会重复渲染

### Phase 6: Git Changes

目标：完成辅助 Git 面板。

任务：

- 拉取当前 workspace Git changes
- 实现文件树
- 实现文件选择
- 实现 diff 预览
- 实现大 diff / 二进制文件降级
- 记住 drawer 开关状态

完成标准：

- 用户可边聊天边查看变更
- Git 区域不会抢主会话焦点

### Phase 7: Responsive and Accessibility

目标：补齐可用性底线。

任务：

- sidebar 移动端改抽屉
- Git drawer 移动端改全屏覆盖
- 补齐 keyboard 操作
- 补齐 focus state
- 补齐 ARIA 语义
- 让 loading / error 被辅助技术感知

完成标准：

- 桌面端体验稳定
- 移动端可用
- 关键交互可键盘操作

### Phase 8: Testing and Hardening

目标：降低回归风险，完成交付前收尾。

任务：

- store 单元测试
- transport 测试
- WebSocket 事件归并测试
- timeline prepend 与去重测试
- 关键页面状态测试
- 联调修正错误态和断线恢复

完成标准：

- 关键状态流有自动化覆盖
- 主要主链路完成联调

## Testing Focus

优先测试这些点：

- 启动时恢复上次 workspace / session
- 切换 workspace 后 session 列表刷新
- 打开 session 后 state 和消息加载
- `message_delta` 正确聚合到 `streamingDraft`
- `message_done` 正确替换临时消息
- `toolDrafts` 生命周期正确
- 历史消息 prepend 后滚动位置稳定
- 断线重连后视图保留且数据重新同步
- Git drawer 开关状态可记忆

## Risks and Controls

### 1. BaseUI 和 Tailwind 样式冲突

控制方式：

- BaseUI 只承担复杂交互组件
- 视觉 token 统一到 CSS variables
- 避免同时在两个系统里重复定义主题规则

### 2. WebSocket 事件导致消息重复或错序

控制方式：

- 明确 `entryId` 去重规则
- `streamingDraft` 和稳定消息分层存储
- 对同一 `streamingMessageId` 做幂等合并

### 3. Timeline prepend 破坏滚动体验

控制方式：

- 在 prepend 前后记录滚动高度差
- 只在“向前加载更多”场景修正滚动位置

### 4. 状态散落导致维护成本上升

控制方式：

- WebSocket 只进 adapter
- 业务状态只进 store
- 展示组件只消费 view state

## Suggested Milestones

- M1：工程初始化 + 静态壳层
- M2：workspace / session 主链路
- M3：streaming 与工具执行状态
- M4：Git changes drawer
- M5：响应式、可访问性、测试收尾

## Open Decisions

实现前建议确认：

- session list 是否按“今天 / 本周 / 更早”分组
- workspace 名称是否允许覆盖路径名
- URL 深链是否进入 MVP
- 移动端是正式支持还是仅保证可用
- Git diff 接口是否已经定义大文件降级规则
