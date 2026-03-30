# Claude Code VS Code Extension - 消息界面架构设计文档

> 本文档基于 Claude Code VS Code Extension v2.1.87 的 VSIX 包反编译分析。
> 目标读者：初级前端工程师，帮助理解如何设计一个类似的 AI 对话 Extension 消息界面。

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [Extension Host 与 Webview 的关系](#2-extension-host-与-webview-的关系)
3. [Webview HTML 模板与启动流程](#3-webview-html-模板与启动流程)
4. [消息通信协议](#4-消息通信协议)
5. [状态管理架构](#5-状态管理架构)
6. [消息输入组件 (Composer)](#6-消息输入组件-composer)
7. [消息列表渲染](#7-消息列表渲染)
8. [权限请求 UI](#8-权限请求-ui)
9. [Slash 命令系统](#9-slash-命令系统)
10. [@Mention 文件引用系统](#10-mention-文件引用系统)
11. [附件系统](#11-附件系统)
12. [语音输入 (Speech-to-Text)](#12-语音输入-speech-to-text)
13. [会话管理](#13-会话管理)
14. [样式与主题适配](#14-样式与主题适配)
15. [安全机制 (CSP)](#15-安全机制-csp)
16. [关键设计模式总结](#16-关键设计模式总结)
17. [开发建议与注意事项](#17-开发建议与注意事项)

---

## 1. 整体架构概览

Claude Code Extension 采用经典的 **Extension Host + Webview** 双进程架构：

```
┌──────────────────────────────────────────────────────────┐
│                    VS Code 主进程                         │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │   Extension Host    │    │       Webview (React)     │ │
│  │                     │    │                          │ │
│  │  extension.js       │◄──►│  webview/index.js        │ │
│  │  (~1.85 MB bundle)  │    │  (~4.77 MB bundle)       │ │
│  │                     │    │  webview/index.css        │ │
│  │  - 生命周期管理       │    │  (~367 KB)               │ │
│  │  - CLI 进程管理       │    │                          │ │
│  │  - 文件系统操作       │    │  - React UI              │ │
│  │  - Diff 视图         │    │  - 消息渲染              │ │
│  │  - MCP Server       │    │  - 输入组件              │ │
│  │  - 认证管理          │    │  - 状态管理              │ │
│  └─────────────────────┘    └──────────────────────────┘ │
│          │                                               │
│          │  child_process.spawn                           │
│          ▼                                               │
│  ┌─────────────────────┐                                 │
│  │   Claude CLI Binary │                                 │
│  │   (228 MB native)   │                                 │
│  │   实际的 AI 推理      │                                 │
│  └─────────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

### 文件结构

```
extension/
├── extension.js                    # Extension Host 入口 (~1.85 MB)
├── package.json                    # 扩展清单
├── claude-code-settings.schema.json # 设置 JSON Schema
├── resources/
│   ├── claude-logo.svg             # 图标
│   ├── native-binary/claude        # CLI 二进制 (228 MB)
│   └── walkthrough/                # 引导页
└── webview/
    ├── index.js                    # React 前端 bundle (~4.77 MB)
    └── index.css                   # 样式 (~367 KB)
```

### 四种 Webview 载体

Extension 注册了 **4 种** Webview 容器，但它们共享同一份 `index.js` + `index.css`：

| Webview ID | 类型 | 位置 | 用途 |
|---|---|---|---|
| `claudeVSCodePanel` | `WebviewPanel` | Editor Tab | 主对话面板 |
| `claudeVSCodeSidebar` | `WebviewViewProvider` | Activity Bar | 侧栏对话 |
| `claudeVSCodeSidebarSecondary` | `WebviewViewProvider` | Secondary Sidebar | 次级侧栏 |
| `claudeVSCodeSessionsList` | `WebviewViewProvider` | 侧栏视图 | 会话列表 |

Webview 启动时通过注入的全局变量区分自身身份：

```javascript
window.IS_SIDEBAR = true/false
window.IS_FULL_EDITOR = true/false
window.IS_SESSION_LIST_ONLY = true/false
```

---

## 2. Extension Host 与 Webview 的关系

### 2.1 Extension Host 端核心类

```
WQ (WebviewManager)
├── 管理所有 Webview 实例 (allComms Set)
├── 创建 Panel / 解析 Sidebar View
├── 广播会话状态 (broadcastSessionStates)
├── 字体配置同步 (notifyFontConfigurationChange)
└── 认证管理 (AuthManager)

a9 (Communication / 通信层)
├── 每个 Webview 实例对应一个 a9 实例
├── 管理与 CLI 进程的通信
├── 处理 Diff 视图、文件操作
├── 语音输入管理
├── 浏览器标签页集成
└── MCP Server 集成
```

### 2.2 一对一绑定关系

```
Webview Panel/View ──1:1──► a9 (Comms 实例)
                              │
                              ├── WebSocket ──► CLI Binary
                              ├── MCP Server 管理
                              └── 状态推送 (pushStateUpdate)
```

每当创建一个新的 Webview 面板，就会创建一个对应的 `a9` 通信实例，该实例：
- 接收 Webview 发来的消息 (`fromClient`)
- 通过 `webview.postMessage()` 向 Webview 推送状态
- 管理与 Claude CLI 的 WebSocket 连接

---

## 3. Webview HTML 模板与启动流程

### 3.1 HTML 模板

Extension Host 在 `getHtmlForWebview()` 方法中动态生成 HTML：

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <!-- CSP 安全策略 -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${cspSource} 'unsafe-inline';
                 font-src ${cspSource};
                 img-src ${cspSource} data:;
                 script-src 'nonce-${nonce}';
                 worker-src ${cspSource};">

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 样式文件 -->
  <link href="${cssUri}" rel="stylesheet">

  <!-- 动态 CSS 变量：继承 VS Code 字体设置 -->
  <style>
    :root {
      --vscode-editor-font-family: ${editorFontFamily} !important;
      --vscode-editor-font-size: ${editorFontSize}px !important;
      --vscode-editor-font-weight: ${editorFontWeight} !important;
      --vscode-chat-font-size: ${chatFontSize}px;
      --vscode-chat-font-family: ${chatFontFamily};
    }
  </style>
</head>
<body>
  <!-- 错误显示区域 -->
  <pre id="claude-error"></pre>

  <!-- React 挂载根节点 -->
  <div id="root"
       data-initial-prompt="${encodedPrompt}"
       data-initial-session="${encodedSessionId}"
       data-initial-auth-status="${encodedAuthStatus}">
  </div>

  <!-- 注入 Webview 身份标识 -->
  <script nonce="${nonce}">
    window.IS_SIDEBAR = ${isSidebar}
    window.IS_FULL_EDITOR = ${isFullEditor}
    window.IS_SESSION_LIST_ONLY = ${isSessionListOnly}
  </script>

  <!-- React 应用入口 -->
  <script nonce="${nonce}" src="${jsUri}" type="module"></script>
</body>
</html>
```

### 3.2 启动流程

```
1. VS Code 激活扩展 (onStartupFinished)
     │
2. 注册 WebviewViewProvider / WebviewPanelSerializer
     │
3. 用户打开面板 → getHtmlForWebview() 生成 HTML
     │
4. Webview 加载 index.js (ES Module)
     │
5. React 应用初始化
   ├── acquireVsCodeApi() 获取通信句柄 (只能调用一次！)
   ├── 读取 DOM 属性: data-initial-prompt, data-initial-session
   ├── 读取 window.IS_SIDEBAR 等标识
   └── 根据身份渲染不同 UI
     │
6. 通过 vscode.postMessage() 向 Extension Host 发送 ready
     │
7. Extension Host 推送初始状态 (config, auth, session)
```

**关键知识点**：`acquireVsCodeApi()` 在整个 Webview 生命周期中只能调用一次，返回的对象需要保存为全局引用。

---

## 4. 消息通信协议

### 4.1 通信机制

Webview 与 Extension Host 之间通过 `postMessage` API 进行双向通信：

```
Webview                              Extension Host
  │                                        │
  │──── vscode.postMessage({type, ...}) ──►│  fromClient(msg)
  │                                        │
  │◄─── webview.postMessage({type, ...}) ──│  send(msg) / pushStateUpdate()
  │                                        │
  │ window.addEventListener('message',     │
  │   (e) => handleMessage(e.data))        │
```

### 4.2 消息类型概览

**Webview → Extension Host (用户操作)：**

| 消息类型 | 用途 | 关键字段 |
|---|---|---|
| `submit` | 提交用户消息 | `text`, `attachedFiles` |
| `interrupt` | 中断 AI 响应 | - |
| `set_permission_mode` | 切换权限模式 | `mode` |
| `approve` | 批准工具调用 | `requestId` |
| `reject` | 拒绝工具调用 | `requestId`, `message` |
| `list_files` | 请求文件列表 (@mention) | `query` |
| `select_session` | 切换会话 | `sessionId` |
| `create_session` | 创建新会话 | - |
| `compact` | 压缩上下文 | - |
| `log_event` | 上报分析事件 | `eventName`, `eventData` |
| `start_speech_to_text` | 开始语音输入 | `channelId` |
| `stop_speech_to_text` | 停止语音输入 | `channelId` |

**Extension Host → Webview (状态推送)：**

| 消息类型 | 用途 | 关键字段 |
|---|---|---|
| `state_update` | 全量状态更新 | `messages`, `busy`, `config`, ... |
| `messages_update` | 增量消息更新 | `messages` |
| `config_update` | 配置变更 | `config` |
| `auth_status` | 认证状态 | `status`, `method` |
| `session_states` | 所有会话状态列表 | `sessions[]` |
| `speech_to_text_message` | 语音转文字片段 | `channelId`, `text` |
| `close_channel` | 关闭语音通道 | `channelId` |
| `font_config` | 字体配置变更 | `editorFontFamily`, ... |
| `usage_update` | 用量信息 | `utilization` |
| `selection_changed` | 编辑器选区变化 | `filePath`, `selectedText` |

### 4.3 postMessage 使用示例

```javascript
// Webview 端发送消息
const vscode = acquireVsCodeApi();

// 提交用户消息
vscode.postMessage({
  type: 'submit',
  text: 'Help me fix this bug',
  attachedFiles: [/* ... */]
});

// 批准工具调用
vscode.postMessage({
  type: 'approve',
  requestId: 'req_abc123'
});
```

```javascript
// Webview 端接收消息
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'state_update':
      updateConversation(message.messages);
      break;
    case 'auth_status':
      updateAuthUI(message.status);
      break;
  }
});
```

---

## 5. 状态管理架构

### 5.1 响应式信号 (Signals) 系统

Webview 前端使用了类似 Preact Signals 的响应式状态管理（而非 Redux 或 Context API）：

```javascript
// 核心状态对象结构 (session 对象上的信号)
session = {
  messages:          signal([]),      // 消息列表
  busy:              signal(false),   // 是否正在处理
  permissionMode:    signal('default'), // 权限模式
  config:            signal(null),    // 用户配置
  claudeConfig:      signal(null),    // Claude 服务端配置
  promptSuggestion:  signal(null),    // 提示建议
  autoModeAvailability: signal('unknown'), // auto 模式可用性
  // ...
}
```

### 5.2 派生计算 (Computed)

```javascript
// 使用 computed 派生状态
const slashCommands = computed(() => {
  return session.claudeConfig.value?.commands;
});

const useCtrlEnterToSend = computed(() => {
  return session.config.value?.useCtrlEnterToSend ?? false;
});
```

### 5.3 为什么选择 Signals 而不是 Redux？

| 特性 | Signals | Redux |
|---|---|---|
| 细粒度更新 | 只重渲染使用该 signal 的组件 | 需要 selector 优化 |
| 模板代码量 | 极少 | action/reducer/selector |
| 适用场景 | 高频更新（流式消息） | 复杂业务逻辑 |
| 学习成本 | 低 | 中等 |

**对于 AI 对话场景**，消息是高频流式更新的，Signals 的细粒度响应式更新能显著减少不必要的重渲染。

---

## 6. 消息输入组件 (Composer)

### 6.1 组件树结构

```
Dt1 (主 Composer 组件, forwardRef)
│
├── LA (错误/速率限制提示横幅)
│
├── Co1 (Slash 命令下拉菜单, 当 / 触发时显示)
│
├── zt1 (模型选择器下拉菜单)
│
├── Fo1 (@ 文件自动补全下拉菜单)
│
├── Kt1 (Slash 命令结果面板)
│
├── jt1 (Review Upsell 横幅)
│
├── <fieldset data-permission-mode={mode}>
│   │
│   ├── <div.messageInputContainer>
│   │   │
│   │   ├── <div contentEditable="plaintext-only"    ← 主输入区域
│   │   │        ref={I}
│   │   │        onInput={j2}
│   │   │        onKeyDown={C5}
│   │   │        onPaste={U4}
│   │   │        role="textbox"
│   │   │        aria-label="Message input"
│   │   │        aria-multiline="true"
│   │   │        data-placeholder={placeholder} />
│   │   │
│   │   ├── <div ref={b1}                           ← @mention 高亮镜像层
│   │   │        aria-hidden
│   │   │        className="mentionMirror" />
│   │   │
│   │   └── <div.micButtonWrapper>                   ← 语音按钮 (条件渲染)
│   │       └── <button onMouseDown onMouseUp />
│   │
│   ├── <div.attachedFilesContainer>                 ← 附件列表
│   │   └── CD[] (附件芯片组件)
│   │
│   └── qt1 (工具栏)
│       ├── mo1 (加号菜单: @mention, 附件, 浏览器)
│       ├── <button> (命令菜单开关, / 图标)
│       ├── Gt1 (Token 用量条 + compact 按钮)
│       ├── hT0 (选区切换按钮, 条件渲染)
│       ├── Xt1 (权限模式选择器)
│       └── <button type="submit"> (发送 / 中断按钮)
│
└── Wo1 (账户 & 用量弹窗)
```

### 6.2 为什么使用 contentEditable 而非 textarea？

```html
<div
  contentEditable="plaintext-only"
  role="textbox"
  aria-label="Message input"
  aria-multiline="true"
/>
```

**选择 `contentEditable="plaintext-only"` 的原因：**

1. **自动高度扩展**：`div` 元素可以通过 CSS 自然地随内容增长，不需要 JavaScript 计算高度
2. **@mention 芯片渲染**：可以在镜像层中精确定位并渲染高亮芯片
3. **`plaintext-only`**：防止用户粘贴富文本 HTML，保证纯文本输入
4. **光标控制**：比 `<textarea>` 更灵活的光标位置控制

**注意事项：**
- 需要手动实现 `aria-*` 无障碍属性
- 需要 `data-placeholder` + CSS `::before` 实现占位文本
- 需要通过 `textContent` 而非 `value` 读取内容

### 6.3 输入处理流程

```
用户打字
  │
  ▼
onInput (j2)
  │  读取 div.textContent
  │  同步到 React state
  │
  ├──► 检测 "/" 前缀 → 打开 Slash 命令下拉 (Co1)
  ├──► 检测 "@" 前缀 → 打开文件补全下拉 (Fo1)
  └──► 更新 @mention 镜像层

用户按 Enter
  │
  ▼
onKeyDown (C5)
  │
  ├── 检查 IME 输入中？ → 跳过 (防止中文输入法误触)
  ├── 检查 useCtrlEnterToSend？ → 需要 Ctrl/Cmd+Enter
  ├── 检查语音输入中？ → 先停止录音
  │
  ▼
_4() 提交函数
  │
  ├── 读取 textContent.trim()
  ├── 空内容？ → return
  ├── 超过 50,000 字符？ → 截断 + [truncated]
  ├── 清空输入框 (state + DOM)
  ├── 重置历史浏览位置
  └── 调用 onSubmit(text) → vscode.postMessage
```

### 6.4 完整快捷键表

| 快捷键 | 条件 | 行为 |
|---|---|---|
| `Enter` | 默认模式 | 提交消息 |
| `Ctrl/Cmd + Enter` | `useCtrlEnterToSend=true` | 提交消息 |
| `Shift + Enter` | 任何时候 | 插入换行 (浏览器默认行为) |
| `Shift + Tab` | 任何时候 | 循环切换权限模式 |
| `Tab` | 有 prompt suggestion | 接受建议 |
| `Escape` | 有下拉菜单打开 | 关闭下拉菜单 |
| `Escape × 2` | 输入框为空, 800ms 内双击 | 打开回退选择器 (Rewind) |
| `ArrowUp` | 光标在位置 0, 无下拉菜单 | 浏览上一条历史消息 |
| `ArrowDown` | 光标在末尾, 无下拉菜单 | 浏览下一条历史消息 |
| `ArrowUp/Down/Enter/Tab` | Slash 命令菜单打开 | 导航/选择命令 |
| `ArrowUp/Down/Enter/Tab` | 模型选择器打开 | 导航/选择模型 |

### 6.5 IME 输入法防护

中日韩输入法 (IME) 在组字过程中会触发 Enter 键。代码通过检查 `isComposing` 属性来防止误提交：

```javascript
if (event.key === "Enter" && !event.shiftKey) {
  if (event.nativeEvent.isComposing) return; // IME 组字中，跳过
  // ... 正常提交逻辑
}
```

### 6.6 历史消息浏览 (Vo1 Hook)

```javascript
// 原理：收集所有用户消息，通过 ArrowUp/Down 循环浏览
function useMessageHistory(messages) {
  // 1. 从 messages.value 中过滤出 type==="user" 的消息
  // 2. 排除合成消息和工具调用
  // 3. ArrowUp 在光标位置0时触发向前浏览
  // 4. ArrowDown 在光标位于末尾时触发向后浏览
  // 5. 首次触发时保存当前输入内容
  // 6. 回到 index=-1 时恢复保存的内容
}
```

---

## 7. 消息列表渲染

### 7.1 消息数据结构

```typescript
// 消息类型 (推断)
interface Message {
  type: 'user' | 'assistant';
  content: ContentBlock[];
  // user 消息:
  text?: string;
  attachedFiles?: AttachedFile[];
  // assistant 消息:
  toolUse?: ToolUseBlock[];
  // 通用:
  timestamp?: number;
  synthetic?: boolean;  // 合成消息标记
}

// 内容块类型
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: object }
  | { type: 'tool_result'; tool_use_id: string; content: any }
  | { type: 'image'; data: string; mimeType: string };
```

### 7.2 消息渲染策略

```
messages.value (Signal 数组)
  │
  ▼
消息列表组件
  │
  ├── 用户消息 → 简单文本 + 附件缩略图
  │
  ├── 助手消息
  │   ├── 文本内容 → Markdown 渲染器
  │   │   ├── 代码块 → 语法高亮 (含复制按钮)
  │   │   ├── 链接 → 可点击
  │   │   └── 内联代码 → monospace 样式
  │   │
  │   ├── 工具调用 → 可折叠面板
  │   │   ├── 工具名称 + 参数摘要
  │   │   ├── 执行状态 (pending/running/done/error)
  │   │   └── 结果展示 (文本/diff/图片)
  │   │
  │   └── 思考过程 → 可折叠的 "thinking" 区域
  │
  └── 系统消息 → 特殊样式 (如权限请求)
```

### 7.3 流式渲染

AI 响应是流式到达的，消息列表需要：

1. **增量更新**：每收到一个 token，追加到当前消息的 text 内容
2. **自动滚动**：新内容到达时自动滚动到底部
3. **性能优化**：使用 Signals 的细粒度更新，避免整个列表重渲染

```javascript
// 伪代码：流式消息更新
session.messages.value = [
  ...previousMessages,
  {
    type: 'assistant',
    content: [{ type: 'text', text: accumulatedText + newToken }]
  }
];
// Signal 的细粒度响应性确保只有最后一条消息组件重新渲染
```

### 7.4 工具调用渲染

工具调用是 Claude Code 的核心特性。每个工具调用显示为一个可展开的面板：

```
┌─────────────────────────────────────┐
│ ▶ Read file: src/utils/helper.ts    │  ← 折叠状态
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ▼ Edit file: src/utils/helper.ts    │  ← 展开状态
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ - const old = "foo";            │ │  ← Diff 视图
│ │ + const new = "bar";            │ │
│ └─────────────────────────────────┘ │
│                                     │
│        [Accept] [Reject]            │  ← 权限按钮
└─────────────────────────────────────┘
```

---

## 8. 权限请求 UI

### 8.1 权限模式

| 模式 | 标签 | 行为 |
|---|---|---|
| `default` | "Ask before edits" | 每次工具调用都需要用户确认 |
| `acceptEdits` | "Edit automatically" | 自动接受文件编辑 |
| `plan` | "Plan mode" | 仅规划，不执行 |
| `auto` | "Auto mode" | 完全自动执行 |
| `bypassPermissions` | "Bypass permissions" | 跳过所有权限检查 (危险) |

### 8.2 模式切换 UI

权限模式选择器 (`Xt1` 组件) 位于工具栏中，支持两种交互：
- **Shift+Tab**：快速循环切换
- **点击下拉**：选择具体模式

```javascript
// 模式循环逻辑
function cycleMode() {
  const modes = getAvailableModes(); // ['default', 'acceptEdits', 'plan', ...]
  const currentIndex = modes.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  session.setPermissionMode(modes[nextIndex], true);
}

// 可用模式受配置控制
function getAvailableModes() {
  const modes = ['default', 'acceptEdits', 'plan'];

  // auto 模式需要服务端支持
  if (autoModeAvailability === 'available') modes.push('auto');

  // bypass 需要显式配置允许
  if (config.allowDangerouslySkipPermissions &&
      !settings.disableBypassPermissionsMode) {
    modes.push('bypassPermissions');
  }

  return modes;
}
```

### 8.3 权限请求交互流程

```
Claude 请求执行工具 (如: 编辑文件)
     │
     ▼
Extension Host 发送权限请求消息
     │
     ▼
Webview 渲染权限请求 UI
┌──────────────────────────────────────┐
│  Claude wants to edit src/index.ts   │
│                                      │
│  [显示 diff 预览]                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Tell Claude what to do instead │  │  ← NT 组件 (contentEditable)
│  └────────────────────────────────┘  │
│                                      │
│      [Approve ✓]    [Reject ✗]       │
└──────────────────────────────────────┘
     │
     ├── Approve → postMessage({ type: 'approve', requestId })
     │
     └── Reject → postMessage({ type: 'reject', requestId, message })
              └── message 来自 NT 组件中用户的反馈文本
```

### 8.4 CSS 主题适配

权限模式通过 `data-permission-mode` 属性影响输入框样式：

```html
<fieldset data-permission-mode="acceptEdits">
  <!-- 输入框会有不同的边框颜色/背景来指示当前模式 -->
</fieldset>
```

---

## 9. Slash 命令系统

### 9.1 命令检测

当用户输入 `/` 时，`Ho1` hook 检测光标位置是否在斜杠命令 token 内：

```javascript
// 检测正则
const SLASH_REGEX = /(?:^|\s)\/[^\s/]*/gm;

function detectSlashCommand(text, cursorPosition) {
  const matches = Array.from(text.matchAll(SLASH_REGEX));
  for (const match of matches) {
    const start = text.indexOf('/', match.index);
    const end = match.index + match[0].length;
    if (cursorPosition >= start && cursorPosition <= end) {
      return {
        query: text.substring(start + 1, end), // "he" from "/he"
        start,
        end
      };
    }
  }
  return undefined;
}
```

### 9.2 命令来源

1. **服务端配置**：`session.claudeConfig.value?.commands` - 由 CLI 提供的命令列表
2. **动态注册**：`commandRegistry` - 通过 `registerAction()` 在组件内注册
3. **硬编码**：如 `/compact` 直接调用 `onSubmit("/compact")`

### 9.3 命令下拉菜单 (Co1)

```
┌─────────────────────────────────┐
│ / Commands                      │
│                                 │
│ ▸ /help     Get help            │  ← 当前选中项
│   /clear    Clear conversation  │
│   /compact  Compact context     │
│   /review   Review code         │
│   ...                           │
└─────────────────────────────────┘
```

- 支持模糊过滤 (`filterText`)
- 键盘导航：ArrowUp/Down + Enter/Tab 选择
- Escape 关闭

### 9.4 命令选择后的文本替换

```javascript
function replaceToken(text, tokenMatch, replacement, keepPrefix = false) {
  const before = text.substring(0, tokenMatch.start);
  const after = text.substring(tokenMatch.end);
  const prefix = keepPrefix ? text[tokenMatch.start] : '';
  const space = after.startsWith(' ') ? '' : ' ';
  return before + prefix + replacement + space + after;
}

// 示例: 输入 "please /he" + 选择 "/help"
// → replaceToken("please /he", {start:7, end:10}, "help")
// → "please /help "
```

---

## 10. @Mention 文件引用系统

### 10.1 检测机制

与 Slash 命令使用相同的 `Ho1` hook，但匹配 `@` 前缀：

```javascript
const AT_REGEX = /(?:^|\s)@[^\s]*/gm;
```

### 10.2 文件自动补全 (Fo1)

当检测到 `@` 后：

```
用户输入 "@src/u"
     │
     ▼
Fo1 组件打开，调用 onListFiles("src/u")
     │  (防抖 200ms)
     ▼
Extension Host 搜索文件
  ├── ripgrep 搜索工作区文件
  ├── 浏览器标签页 (browser:xxx)
  └── 终端 (terminal:xxx)
     │
     ▼
┌─────────────────────────────────┐
│ @ Files                        │
│                                 │
│ 📄 src/utils/helper.ts         │
│ 📄 src/utils/format.ts         │
│ 📁 src/utils/                  │  ← 目录可继续展开
│ ...                             │
└─────────────────────────────────┘
```

### 10.3 Mention 芯片渲染

确认选择的文件会在输入框内显示为高亮芯片。实现原理是**镜像层叠加**：

```
┌─────────────────────────────────────────────┐
│  层1 (下层): contentEditable div            │
│  "Check @src/utils/helper.ts for bugs"      │  ← 纯文本
│                                             │
│  层2 (上层): mentionMirror div (aria-hidden) │
│  "Check [src/utils/helper.ts] for bugs"     │  ← 芯片高亮
│                                             │
│  两层通过 scrollTop/scrollLeft 同步          │
└─────────────────────────────────────────────┘
```

```javascript
// 滚动同步
useEffect(() => {
  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollTop = inputRef.current.scrollTop;
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };
  inputRef.current?.addEventListener('scroll', syncScroll);
  return () => inputRef.current?.removeEventListener('scroll', syncScroll);
}, []);
```

### 10.4 Mention 状态管理

```javascript
// 已确认的 @mention 集合
const [confirmedMentions, setConfirmedMentions] = useState(new Set());

// 当文件被选择时
function handleFileSelect(item, isTab) {
  const newText = replaceToken(inputText, atMention, item.path, true);
  setInputText(newText);

  if (item.type === 'file') { // 文件则确认为芯片
    setConfirmedMentions(prev => new Set([...prev, item.path]));
  }
  // 目录则不确认，允许继续输入
}

// 文本变化时清理不存在的 mention
useEffect(() => {
  setConfirmedMentions(prev => {
    const next = new Set();
    for (const path of prev) {
      if (inputText.includes(`@${path}`)) next.add(path);
    }
    return next;
  });
}, [inputText]);
```

---

## 11. 附件系统

### 11.1 添加附件的两种方式

**方式一：剪贴板粘贴**

```javascript
function handlePaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;

  const files = [];
  let hasFiles = false;

  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file') {
      files.push(items[i].getAsFile());
      hasFiles = true;
    }
  }

  if (hasFiles && files.length > 0) {
    event.preventDefault(); // 阻止默认粘贴行为
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    onAddFiles(dt.files);
  }
  // 文本粘贴不拦截，走默认流程
}
```

**方式二：工具栏按钮**

```javascript
function handleAttachFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = () => {
    if (input.files?.length > 0) onAddFiles(input.files);
  };
  input.click(); // 触发系统文件选择器
}
```

### 11.2 附件芯片渲染 (CD 组件)

```
┌──────────────┐  ┌──────────────┐
│ 🖼️ photo.png │  │ 📄 data.csv  │
│     [×]      │  │     [×]      │
│  (缩略图)     │  │  (文件图标)   │
└──────────────┘  └──────────────┘
```

- **图片文件**：显示 `dataUrl` 缩略图预览
- **其他文件**：显示文档图标 + 文件名
- **删除按钮**：调用 `onRemoveFile(index)` 移除

---

## 12. 语音输入 (Speech-to-Text)

### 12.1 依赖条件

需要同时满足：
1. 环境变量 `CLAUDE_SPEECH_TO_TEXT=true`
2. 安装 `ms-vscode.vscode-speech` 扩展

### 12.2 交互模式

麦克风按钮支持两种交互：

```javascript
// Push-to-talk 检测
let pressStartTime;

function onMouseDown() {
  pressStartTime = Date.now();
  startRecording();
}

function onMouseUp() {
  const duration = Date.now() - pressStartTime;
  if (duration < 200) {
    // 短按 = 点击切换模式 (toggle)
    // 如果正在录音 → 停止；如果未录音 → 开始
  } else {
    // 长按 = Push-to-talk 模式
    // 松开即停止
    stopRecording();
  }
}
```

### 12.3 语音流程

```
用户按下麦克风按钮
     │
     ▼
postMessage({ type: 'start_speech_to_text', channelId })
     │
     ▼
Extension Host:
  1. 激活 ms-vscode.vscode-speech 扩展
  2. 打开临时文档
  3. 启动 editorDictation.start 命令
  4. 监听文档变化
     │
     ▼
文档变化 → postMessage({
  type: 'speech_to_text_message',
  channelId,
  text: '识别到的文字'
})
     │
     ▼
Webview 将文字填入输入框
```

---

## 13. 会话管理

### 13.1 多会话架构

```
WQ (WebviewManager)
│
├── allComms: Set<a9>           // 所有通信实例
├── sessionPanels: Map<id, Panel> // sessionId → Panel 映射
├── sessionStates: Map<id, State> // sessionId → 状态映射
└── activeSessionId: string       // 当前活跃会话
```

### 13.2 会话状态

```typescript
interface SessionState {
  sessionId: string;
  state: 'idle' | 'busy' | 'waiting_input';
  title?: string;
}
```

### 13.3 会话列表 Badge

```javascript
// 在 Session List View 上显示等待输入的会话数
function updateSessionListBadge(sessions) {
  const waitingCount = sessions
    .filter(s => s.state === 'waiting_input')
    .length;

  sessionListView.badge = waitingCount > 0
    ? { tooltip: `${waitingCount} session(s) waiting`, value: waitingCount }
    : { value: 0, tooltip: '' };
}
```

### 13.4 会话生命周期

```
创建新面板
  │
  ├── createPanel(sessionId?, prompt?, viewColumn?)
  │   ├── 检查是否有同 sessionId 的面板已存在
  │   ├── 选择 ViewColumn (Beside / 未使用列 / 指定列)
  │   └── 调用 setupPanel()
  │
  ├── setupPanel()
  │   ├── 生成 HTML (getHtmlForWebview)
  │   ├── 创建 a9 通信实例
  │   ├── 注册消息监听
  │   └── 注册 dispose 清理
  │
  └── 面板关闭
      ├── a9.shutdown()
      ├── 从 allComms 移除
      ├── 从 sessionPanels/sessionStates 移除
      └── 广播更新 (broadcastSessionStates)
```

---

## 14. 样式与主题适配

### 14.1 VS Code 主题集成

Webview 自动继承 VS Code 的 CSS 变量，实现主题适配：

```css
/* VS Code 自动注入的变量 (部分) */
--vscode-editor-background
--vscode-editor-foreground
--vscode-input-background
--vscode-input-border
--vscode-button-background
--vscode-button-foreground
--vscode-focusBorder
--vscode-badge-background
--vscode-sideBar-background
/* ... 数百个 */
```

### 14.2 字体配置同步

Extension Host 监听 VS Code 字体配置变更并推送到 Webview：

```javascript
// 监听的配置项
'chat.editor.fontFamily'  → --vscode-editor-font-family
'chat.editor.fontSize'    → --vscode-editor-font-size
'chat.editor.fontWeight'  → --vscode-editor-font-weight
'chat.fontSize'           → --vscode-chat-font-size
'chat.fontFamily'         → --vscode-chat-font-family
```

### 14.3 CSS Modules

Webview 使用 CSS Modules 避免样式冲突：

```javascript
// 编译后的类名映射
const styles = {
  messageInput: "messageInput_cKsPxg",
  messageInputContainer: "messageInputContainer_xxx",
  mentionMirror: "mentionMirror_xxx",
  inputMentionChip: "inputMentionChip_xxx",
  micButton: "micButton_xxx",
  recording: "recording_xxx",
  // ...
};
```

### 14.4 暗色/亮色主题

Extension 提供了独立的 welcome-art 资源：

```javascript
// 资源 URI 映射 (light/dark 双版本)
const assetUris = {
  welcomeArt: {
    light: 'resources/welcome-art-light.svg',
    dark: 'resources/welcome-art-dark.svg'
  }
};
```

---

## 15. 安全机制 (CSP)

### 15.1 Content Security Policy

```
default-src 'none';           ← 默认禁止所有
style-src ${cspSource} 'unsafe-inline';  ← 允许扩展资源 + 内联样式
font-src ${cspSource};        ← 仅允许扩展目录字体
img-src ${cspSource} data:;   ← 扩展资源 + data URI (附件预览)
script-src 'nonce-${nonce}';  ← 仅允许带 nonce 的脚本
worker-src ${cspSource};      ← Web Worker
```

### 15.2 Nonce 机制

每次渲染 HTML 模板都生成新的随机 nonce：

```javascript
function generateNonce() {
  // crypto.randomUUID() 或类似实现
  return randomString;
}
```

只有带有对应 nonce 的 `<script>` 标签才会执行，防止 XSS 注入。

### 15.3 HTML 转义

所有注入 HTML 属性的动态值都经过转义：

```javascript
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

---

## 16. 关键设计模式总结

### 16.1 单向数据流

```
用户操作 → postMessage → Extension Host → CLI/处理 → postMessage → 状态更新 → UI 渲染
```

### 16.2 关注点分离

| 层 | 职责 | 技术 |
|---|---|---|
| Webview (React) | UI 渲染、用户交互 | React + Signals + CSS Modules |
| Extension Host | 业务逻辑、VS Code API | Node.js + VS Code API |
| CLI Binary | AI 推理 | Native Binary |
| MCP Server | IDE 工具能力 | WebSocket + JSON-RPC |

### 16.3 渐进式权限

从严格 (`default`) 到宽松 (`bypassPermissions`)，让用户根据信任度逐步放宽。

### 16.4 多入口统一代码

4 种 Webview 容器共享一套代码，通过运行时标识 (`IS_SIDEBAR` 等) 条件渲染。

### 16.5 镜像层 (Mirror Overlay) 模式

```
contentEditable (接受输入) + 镜像 div (渲染装饰)
```
这是在 contentEditable 中实现富文本装饰（如 @mention 芯片）的常见模式，避免直接操作 contentEditable 的 DOM。

---

## 17. 开发建议与注意事项

### 17.1 如果你要从头构建类似界面

1. **选择 contentEditable 还是 textarea**
   - 如果需要 @mention 芯片、内联装饰 → `contentEditable="plaintext-only"`
   - 如果只需要纯文本输入 → `<textarea>` 更简单可靠

2. **通信协议设计**
   - 定义清晰的消息类型枚举
   - 区分"请求-响应"和"单向通知"两种模式
   - 预留版本兼容字段

3. **状态管理选择**
   - 高频更新场景 (流式消息) → Signals / Jotai / Zustand
   - 复杂业务逻辑 → Redux / Zustand

4. **性能关注点**
   - 长对话的虚拟滚动
   - 流式渲染的防抖/节流
   - Markdown 渲染的懒加载/缓存

### 17.2 常见陷阱

| 陷阱 | 说明 | 解决方案 |
|---|---|---|
| `acquireVsCodeApi()` 多次调用 | 会抛异常 | 全局调用一次，保存引用 |
| CSP 阻止资源加载 | 外部 CDN、内联脚本被拦截 | 使用 nonce、webview.asWebviewUri() |
| IME 输入法误触 | 中日韩输入法 Enter 键 | 检查 `isComposing` |
| contentEditable 粘贴富文本 | 粘贴 HTML 导致样式错乱 | 使用 `plaintext-only` |
| 滚动位置丢失 | 状态更新导致重渲染跳动 | 锚定滚动、保存/恢复位置 |
| Webview 重启丢失状态 | 面板隐藏后被销毁 | `retainContextWhenHidden: true` |

### 17.3 推荐的技术栈 (2025+)

| 层 | 推荐 | 备注 |
|---|---|---|
| 框架 | React 18+ / Preact | Vue 3 也可以 |
| 状态管理 | @preact/signals / Jotai | 轻量、细粒度 |
| 样式 | CSS Modules / Tailwind | 避免全局污染 |
| Markdown | react-markdown + remark | 可定制渲染器 |
| 代码高亮 | Shiki / Prism | Shiki 更现代 |
| 构建 | esbuild / Vite | 快速打包 |
| 通信 | 自定义 postMessage 协议 | 可加 TypeScript 类型 |

### 17.4 最小可行产品 (MVP) 检查清单

- [ ] Webview 基础搭建 (HTML 模板 + React 挂载)
- [ ] postMessage 通信层 (类型安全)
- [ ] 文本输入组件 (基础提交)
- [ ] 消息列表渲染 (用户/助手消息)
- [ ] Markdown 渲染 (代码块高亮)
- [ ] 流式响应处理
- [ ] 自动滚动
- [ ] 主题适配 (VS Code CSS 变量)
- [ ] CSP 安全策略
- [ ] 错误处理与提示

---

*文档版本：v1.0 | 基于 Claude Code Extension v2.1.87 分析*
*生成日期：2026-03-30*
