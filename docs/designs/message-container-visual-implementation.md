# Claude Code Extension - 消息容器 UI 视觉实现指南

> 基于 Claude Code VS Code Extension v2.1.87 反编译分析
> 聚焦：消息容器的视觉布局、样式、交互动效的具体实现

---

## 1. 整体页面布局

整个聊天界面是一个 flex 纵向容器，从上到下依次排列：

```
┌─ chatContainer (flex column, flex:1, overflow:hidden) ──────────────┐
│                                                                      │
│  ┌─ dropInfoOverlay (absolute, z:100, 拖拽文件时出现) ─────────────┐ │
│  │  dashed orange border + 半透明橙色背景                           │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ errorBanner (顶部错误横幅，条件渲染) ──────────────────────────┐ │
│  │  红色背景 + 错误文本 + dismiss ×                                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ messagesContainer (flex:1, overflow-y:auto) ───────────────────┐ │
│  │                                                                  │ │
│  │  [当无消息 + 非加载] → emptyState (欢迎屏)                      │ │
│  │  [当加载中]          → loadingState (全屏居中 Loading...)        │ │
│  │  [当有消息]          →                                          │ │
│  │    ┌─ turn ──────────────────────────────────────────────┐      │ │
│  │    │  ┌─ message (user, stickyHeader) ─────────────────┐ │      │ │
│  │    │  │  用户消息 (置顶吸附)                            │ │      │ │
│  │    │  └────────────────────────────────────────────────┘ │      │ │
│  │    │  ┌─ message (assistant, timelineMessage) ─────────┐ │      │ │
│  │    │  │  助手消息 (时间线样式)                           │ │      │ │
│  │    │  └────────────────────────────────────────────────┘ │      │ │
│  │    │  ┌─ message (assistant, timelineMessage) ─────────┐ │      │ │
│  │    │  │  工具调用 / 更多助手内容                         │ │      │ │
│  │    │  └────────────────────────────────────────────────┘ │      │ │
│  │    └─────────────────────────────────────────────────────┘      │ │
│  │    ┌─ turn ──────────────────────────────────────────────┐      │ │
│  │    │  ...下一轮对话                                      │      │ │
│  │    └─────────────────────────────────────────────────────┘      │ │
│  │                                                                  │ │
│  │  ┌─ spinnerRow (加载指示器，常驻 DOM) ─────────────────┐        │ │
│  │  └────────────────────────────────────────────────────┘        │ │
│  │  ┌─ spacer (高度 = inputContainer 高度) ──────────────┐        │ │
│  │  └────────────────────────────────────────────────────┘        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ messageGradient (absolute, 底部渐变遮罩, pointer-events:none) ─┐ │
│  │  height:150px, 从 transparent 到 背景色                          │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ inputContainer (输入区域) ─────────────────────────────────────┐ │
│  │  权限请求面板 + Composer                                         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 关键 CSS

```css
.chatContainer {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  line-height: 1.5;
}

.messagesContainer {
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: var(--app-primary-background);
  padding: 20px 20px 40px;
  gap: 0;
  min-width: 0;
}

/* 底部渐变遮罩 —— 让消息列表底部有淡出效果 */
.messageGradient {
  position: absolute;
  pointer-events: none;
  z-index: 2;
  height: 150px;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--app-primary-background) 100%
  );
}
```

---

## 2. 消息分组："Turn" 模型

消息不是扁平列表，而是按 **Turn (回合)** 分组。每个 Turn = 一条用户消息 + 其后所有助手消息，直到下一条用户消息。

```
Turn 1
├── [User] "帮我修复这个 bug"
├── [Assistant] 思考...
├── [Assistant] 读取文件 src/index.ts
├── [Assistant] 编辑文件 src/index.ts
└── [Assistant] "已修复，修改了第 42 行"

Turn 2
├── [User] "再加个单元测试"
├── [Assistant] ...
```

```css
.turn {
  display: flex;
  flex-direction: column;
}
```

---

## 3. 用户消息视觉实现

### 3.1 基本结构

用户消息是一个**左对齐的带边框气泡**，不是传统聊天的右对齐设计：

```
┌──────────────────────────────────────────────────┐
│ [附件缩略图] [附件缩略图]                          │ ← attachments (可选)
│                                                    │
│ 帮我修复 src/index.ts 里的 TypeError bug           │ ← 消息文本
│ @src/index.ts                                      │ ← @mention 芯片
│                                                    │
│                                            [↩]    │ ← hover 时出现操作按钮
└──────────────────────────────────────────────────┘
```

### 3.2 CSS 实现

```css
/* 外层定位 */
.message.userMessageContainer {
  text-align: left;
  align-items: flex-start;
  margin-left: 0;
}

.userMessageContainer {
  display: inline-block;
  position: relative;
  margin: 4px 0;
}

/* 消息气泡 */
.userMessage {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--app-input-border);
  border-radius: var(--corner-radius-medium); /* 通常 8px */
  background-color: var(--app-input-background);
  display: inline-block;
  overflow-x: hidden;
  overflow-y: hidden;
  user-select: text;
  max-width: 100%;
  padding: 4px 6px;
}

/* 附件横向滚动条 */
.userMessageAttachments {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: thin;
  gap: 4px;
  padding: 0 0 6px;
}
```

### 3.3 Sticky Header (置顶吸附)

用户消息启用了 **sticky 定位**，滚动时会吸附在顶部，让用户始终能看到当前 Turn 的问题：

```css
.message.stickyHeader {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-top: 14px;
  padding-bottom: 12px;
  align-items: stretch;

  /* 双层渐变背景：实现吸附时的毛玻璃淡出效果 */
  background-image:
    linear-gradient(
      var(--sticky-bg) 0%,
      var(--sticky-bg) calc(100% - 10px),
      transparent 100%
    ),
    linear-gradient(
      var(--sticky-bg) 0%,
      var(--sticky-bg) calc(100% - 10px),
      transparent 100%
    );
}

/* stickyMode 下容器需要 isolation 防止 z-index 穿透 */
.messagesContainer.stickyMode {
  isolation: isolate;
  padding: 0 20px 40px;
}
.messagesContainer.stickyMode::before {
  content: '';
  height: 20px; /* 顶部留白 */
}
```

### 3.4 可折叠长文本

用户消息超过 60px 高度时自动折叠，显示渐变遮罩和 "Show more" 按钮：

```
┌──────────────────────────────────────────┐
│ 这是一段很长的消息文本...               │
│ 第二行...                               │
│ ▓▓▓▓▓▓ (渐变遮罩) ▓▓▓▓▓▓               │
│              [Show more]                 │
└──────────────────────────────────────────┘
```

```css
.expandableContainer {
  /* 包裹层 */
}

.content.collapsed {
  max-height: 60px;
  overflow: hidden;
  transition: max-height 0.3s ease-in-out;
}

/* 底部渐变遮罩 */
.truncationGradient {
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--app-input-background) 100%
  );
  height: 50px;
  /* 绝对定位在 content 底部 */
}

.expandButton, .collapseButton {
  /* 按钮样式 */
}
```

### 3.5 Hover 操作菜单

鼠标悬停用户消息时，右上角浮现一个操作按钮（回退箭头图标），点击展开菜单：

```css
/* 操作按钮 —— 默认隐藏 */
.actionButton {
  opacity: 0;
  transition: opacity 0.2s ease-in-out, background-color 0.15s;
  border: 0.5px solid var(--app-secondary-foreground);
  background-color: var(--app-secondary-background);
  border-radius: 14px;
  width: 20px;
  height: 20px;
}

/* hover / focus / 展开时显示 */
.container:hover .actionButton,
.actionButton:hover,
.actionButton:focus,
.actionButton[aria-expanded="true"],
.actionButton.visible {
  opacity: 1;
}

/* 弹出菜单 */
.popup {
  position: absolute;
  background: var(--app-primary-background);
  backdrop-filter: blur(10px);
  border: 1px solid var(--app-primary-border-color);
  border-radius: 8px;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1);
}

.popupVisible {
  animation: fadeIn 0.1s ease-out forwards;
}

/* 菜单项 */
.popupOption {
  /* "Fork conversation from here"
     "Rewind code to here"
     "Fork conversation and rewind code" */
}
```

---

## 4. 助手消息视觉实现：时间线设计

### 4.1 核心视觉：竖线 + 圆点

助手消息采用**时间线 (Timeline)** 样式，左侧有一条竖线连接各步骤，每个步骤有一个状态圆点：

```
     ●──── [Assistant] 分析问题...
     │
     ●──── [Tool: Read] src/index.ts
     │
     ●──── [Tool: Edit] src/index.ts  (diff 展示)
     │
     ●──── [Assistant] 已修复！
```

### 4.2 CSS 实现

```css
.timelineMessage {
  user-select: text;
  align-items: flex-start;
  padding-left: 30px;  /* 为竖线和圆点腾出空间 */
}

/* 圆点指示器 (::before 伪元素) */
.timelineMessage::before {
  content: '';
  position: absolute;
  border-radius: 50%;
  width: 7px;
  height: 7px;
  top: 15px;
  left: 9px;
  background-color: var(--app-secondary-foreground); /* 默认灰色 */
}

/* 竖线连接器 (::after 伪元素) */
.timelineMessage::after {
  content: '';
  position: absolute;
  width: 1px;
  top: 0;
  bottom: 0;
  left: 12px; /* 与圆点居中对齐: 9px + 7px/2 ≈ 12px */
  background-color: var(--app-primary-border-color);
}
```

### 4.3 四种状态圆点

| 状态 | 类名 | 颜色 | 含义 |
|---|---|---|---|
| 成功 | `dotSuccess` | `#74c991` (绿) | 步骤完成 |
| 失败 | `dotFailure` | `#c74e39` (红) | 步骤出错 |
| 警告 | `dotWarning` | `#e1c08d` (琥珀) | 需要注意 |
| 进行中 | `dotProgress` | 默认色 + 闪烁动画 | 正在执行 |

```css
.timelineMessage.dotSuccess::before {
  background-color: #74c991;
}

.timelineMessage.dotFailure::before {
  background-color: #c74e39;
}

.timelineMessage.dotWarning::before {
  background-color: #e1c08d;
}

/* 进行中 —— 呼吸闪烁 */
.timelineMessage.dotProgress::before {
  animation: blink 1s linear infinite;
}

@keyframes blink {
  0%   { opacity: 1; }
  50%  { opacity: 0; }
  100% { opacity: 1; }
}
```

### 4.4 Dimmed 模式

当有权限请求待处理时，非相关消息变半透明，突出权限请求：

```css
.messagesContainer.dimmed > :not(.highlightedMessage) {
  opacity: 0.4;
}

.highlightedMessage {
  opacity: 1;
  position: relative;
  z-index: 10;
}
```

---

## 5. 内容块渲染

每条助手消息包含多个内容块 (content blocks)，按类型分发渲染：

### 5.1 文本内容 → Markdown 渲染

使用 `react-markdown` + `remark-gfm` 插件，**无语法高亮库**（代码块为纯文本）。

```css
/* Markdown 根容器 */
.markdownRoot {
  text-wrap: auto;
  overflow-x: hidden;
  width: 100%;
}

/* 段落 */
.markdownRoot p {
  white-space: pre-wrap;
  margin-top: 0.1em;
  margin-bottom: 0.2em;
}

/* 列表 */
.markdownRoot ol, .markdownRoot ul {
  padding-inline-start: 2em;
}

/* 表格 */
.markdownRoot table {
  border-collapse: collapse;
  border: 1px solid var(--app-input-border);
}
.markdownRoot th, .markdownRoot td {
  border: 1px solid var(--app-input-border);
  padding: 2px;
}

/* 内联代码 */
.markdownRoot code {
  font-family: var(--app-monospace-font-family);
  word-break: break-word;
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 0.9em;
}
```

### 5.2 代码块 → 带复制按钮

```
┌─────────────────────────────────────────┐
│                                   [📋]  │ ← 复制按钮 (hover 显示)
│  function hello() {                     │
│    console.log("world");               │
│  }                                      │
└─────────────────────────────────────────┘
```

```css
.codeBlockWrapper {
  position: relative;
  margin: 8px 0;
}

.codeBlockWrapper pre {
  overflow-x: auto;
  white-space: pre;
  box-sizing: border-box;
  border-radius: 4px;
  max-width: 100%;
  margin: 0;
  padding: 8px;
}

/* 复制按钮 —— 默认隐藏，hover 显示 */
.copyButton {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.codeBlockWrapper:hover .copyButton {
  opacity: 1;
}
```

复制交互：点击后图标变成 ✓ 持续 2 秒，然后恢复。

### 5.3 @Mention 芯片 (消息中)

```css
.mentionChip {
  display: inline;
  background-color: var(--app-mention-chip-background);
  color: var(--app-mention-chip-foreground);
  -webkit-box-decoration-break: clone; /* 换行时两端都有背景 */
  border-radius: 3px;
  padding: 1px 4px;
}

.mentionChip[role="button"] {
  cursor: pointer;
}

.mentionChip[role="button"]:hover {
  filter: brightness(1.15);
}
```

---

## 6. 工具调用块视觉实现

### 6.1 基本结构

工具调用是助手消息中最复杂的内容块，显示为**可折叠面板**：

```
折叠态:
●──── Read src/utils/helper.ts                           ← 一行摘要

展开态:
●──── Edit src/utils/helper.ts                           ← 摘要 (粗体工具名 + 路径链接)
     │  Applied 3 changes                                ← 次级描述行
     │  ┌─────────────────────────────────────────────┐
     │  │  command │ npm test                          │  ← 参数网格
     │  │  output  │ All tests passed ✓                │
     │  └─────────────────────────────────────────────┘
```

### 6.2 工具摘要行

```css
.toolSummary {
  list-style: none;        /* 移除 <details> 默认三角 */
  display: -webkit-box;
  -webkit-line-clamp: 2;   /* 最多两行 */
  overflow: hidden;
  max-width: 100%;
}

.toolNameText {
  font-weight: 700;
  margin-right: 4px;
}

/* 次级文本 (文件路径) —— 等宽字体，链接色 */
.toolNameTextSecondary {
  font-family: var(--app-monospace-font-family);
  color: var(--app-link-color);
  word-break: break-all;
  overflow-wrap: anywhere;
  flex: 1;
  min-width: 0;
  font-size: 0.85em;
}
```

### 6.3 工具体 (参数网格)

```css
.toolBody {
  border: 0.5px solid var(--app-input-border);
  background: var(--app-tool-background);
  border-radius: 5px;
  align-items: start;
  max-width: 100%;
  margin: 8px 0;
  font-size: 1em;
}

/* CSS Grid 两列布局: label | value */
.toolBodyGrid {
  display: grid;
  grid-template-columns: max-content 1fr;
}

.toolBodyRow {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  border-top: 0.5px solid var(--app-input-border);
  padding: 4px;
}

/* 参数名 */
.toolBodyRowLabel {
  color: var(--app-secondary-foreground);
  opacity: 0.5;
  font-family: var(--app-monospace-font-family);
  font-size: 0.85em;
  padding: 4px 8px 4px 4px;
}

/* 参数值 */
.toolBodyRowContent {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 4px;
}

/* 长内容裁切 (60px + 渐变遮罩) */
.toolBodyRowContent:not(.disableClipping) {
  overflow: hidden;
  max-height: 60px;
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}
```

### 6.4 次级描述行

工具摘要下方的辅助信息（如 "Applied 3 changes"、"3.2s"）：

```css
.secondaryLine {
  display: inline-flex;
  color: var(--app-secondary-foreground);
  opacity: 0.7;
  flex-direction: row;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  margin-top: 2px;
  margin-bottom: 2px;
  font-size: 0.85em;
}

/* 可点击的次级行 hover 效果 */
[style*="cursor: pointer"]:hover .secondaryLine .content {
  text-decoration: underline;
}
```

### 6.5 工具结果块

```css
.toolResult {
  background-color: var(--app-code-background);
  white-space: pre;
  overflow-x: auto;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
```

---

## 7. Diff 内联渲染

文件编辑工具使用 **Monaco Editor** 的 diff editor 实例做内联渲染：

### 7.1 创建参数

```javascript
monaco.editor.createDiffEditor(container, {
  readOnly: true,
  renderSideBySide: true,     // 容器 < 700px 时自动切换为 unified
  theme: "vs-dark",
  fontSize: 12,
  lineNumbers: "off",
  wordWrap: "on",
  wrappingIndent: "same",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  scrollbar: {
    vertical: "hidden",
    horizontal: "hidden",
    handleMouseWheel: false    // 禁止鼠标滚轮在 diff 内滚动
  },
  lightbulb: { enabled: "off" },
  automaticLayout: true
});
```

### 7.2 高度计算

```javascript
// 动态高度 = min(200px, 行数 × 19px + 20px)
const height = Math.min(200, lineCount * 19 + 20);
```

### 7.3 响应式切换

```javascript
// ResizeObserver 监测容器宽度
const observer = new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  diffEditor.updateOptions({
    renderSideBySide: width >= 700  // < 700px → unified 模式
  });
});
```

### 7.4 CSS

```css
.diffEditorContainer {
  overflow: hidden;
  border-radius: 4px;
  max-height: 200px;
}

/* 大 diff 的底部渐变裁切 */
.truncationGradient {
  background: linear-gradient(transparent 0%, #1e1e1e 100%);
  height: 30px;
}
```

超过 200px 时底部出现渐变遮罩，并提供 "View diff" 按钮打开完整 diff 弹窗。

---

## 8. Thinking (思考过程) 块

### 8.1 视觉效果

```
折叠态:
     ●──── Thought for 3s                    ▶  ← 斜体文字 + 右侧箭头

展开态:
     ●──── Thinking...                        ▼  ← 箭头旋转 90°
              让我分析一下这个问题...
              首先检查 TypeScript 类型定义...
              然后看看相关的单元测试...
```

### 8.2 使用 `<details>/<summary>` 原生折叠

```html
<details class="thinking thinkingV2" open={isExpanded}>
  <summary class="thinkingSummary">
    <span>Thought for 3s</span>
    <svg class="thinkingToggle thinkingToggleOpen" />
  </summary>
  <div class="thinkingContent">
    <!-- Markdown 渲染的思考内容 -->
  </div>
</details>
```

### 8.3 CSS

```css
.thinkingSummary {
  cursor: pointer;
  color: var(--app-secondary-foreground);
  opacity: 0.8;
  user-select: none;
  list-style: none;           /* 移除默认三角 */
  vertical-align: middle;
  justify-content: space-between;
  font-style: italic;
}

/* 移除 webkit 默认三角 */
.thinkingSummary::-webkit-details-marker {
  display: none;
}

/* 展开或 hover 时提高不透明度 */
.thinking[open] .thinkingSummary,
.thinkingSummary:hover {
  opacity: 1;
}

/* V2 样式 (当前使用) */
.thinkingV2 .thinkingSummary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-style: normal;
}

/* 箭头图标 */
.thinkingToggle {
  width: 16px;
  height: 16px;
  margin-left: 0;
  transition: transform 0.15s;
}

/* 展开时旋转 90° */
.thinkingToggleOpen {
  transform: rotate(90deg);
}

/* 思考内容 */
.thinkingContent {
  color: var(--app-secondary-foreground);
  margin-top: 4px;
  font-weight: 400;
}
```

**标签文本逻辑：**
- 正在思考中 (isPartial=true) → `"Thinking..."`
- 有持续时间 → `"Thought for ${seconds}s"`
- 其他 → `"Thinking"`
- 空内容 → 不渲染

---

## 9. 流式加载指示器

### 9.1 动画效果

加载指示器由两部分组成：一个**循环变换的符号**和一个**打字机效果的动词**。

```
     ✻ Cogitating                   ← 符号在 6 个字符间切换 + 随机动词逐字出现
```

### 9.2 符号动画

在 6 个符号之间循环切换，先正向再反向，每帧 120ms：

```javascript
const SYMBOLS = ["·", "✢", "*", "✶", "✻", "✽"];
// 动画序列: 0,1,2,3,4,5,4,3,2,1,0,1,... (12帧一个周期 = 1.44s)

useEffect(() => {
  const interval = setInterval(() => {
    setFrame(prev => (prev + 1) % 12);
  }, 120);
  return () => clearInterval(interval);
}, []);

const symbolIndex = frame < 6 ? frame : 11 - frame;
const symbol = SYMBOLS[symbolIndex];
```

### 9.3 动词打字机效果

从 ~80 个随机动词中选择，逐字符显示：

```javascript
const VERBS = [
  "Cogitating", "Ruminating", "Wibbling", "Pondering",
  "Deliberating", "Calculating", "Synthesizing", ...
];

// 切换间隔递增: 2s → 3s → 5s → 停留
// 每个字符逐个出现，右侧用空格填充到最长动词长度
```

### 9.4 CSS

```css
.spinnerRow {
  display: flex;
  animation: fadeIn 0.3s ease-in-out;
  align-items: center;
  height: 1.85em;
  margin-top: 4px;
  margin-left: 0;
}

.spinnerIcon {
  color: var(--app-spinner-foreground); /* Claude 橙色 */
}

.spinnerText {
  /* 等宽字体确保打字机效果宽度稳定 */
  font-family: var(--app-monospace-font-family);
}

/* 根据权限模式改变颜色 */
.container[data-permission-mode="acceptEdits"] .spinnerIcon {
  color: var(--app-primary-foreground);  /* 白色 */
}

.container[data-permission-mode="plan"] .spinnerIcon {
  color: var(--vscode-focusBorder);  /* 蓝色 */
}

.container[data-permission-mode="bypassPermissions"] .spinnerIcon,
.container[data-permission-mode="auto"] .spinnerIcon {
  color: var(--app-error-foreground);  /* 红色 */
}
```

### 9.5 特殊状态

当 status 为 `"compacting"` 时，动词固定为 `"Compacting"`，不做随机切换。

---

## 10. 空状态 / 欢迎屏

### 10.1 布局

```
┌──────────────────────────────────────────┐
│                                          │
│              ✻ (Claude Logo)             │
│                                          │
│      [旋转的占位提示文本]                  │
│      "// TODO: Everything..."            │
│                                          │
│   ┌──────┐  ┌──────┐  ┌──────┐         │  ← 建议芯片 (可选)
│   │ 建议1 │  │ 建议2 │  │ 建议3 │         │
│   └──────┘  └──────┘  └──────┘         │
│                                          │
└──────────────────────────────────────────┘
```

### 10.2 CSS

```css
.emptyState {
  display: flex;
  animation: fadeIn 0.3s ease-in-out;
  user-select: none;
  flex-direction: column;
  flex: 1;
  justify-content: center;
  align-items: center;
}

.emptyStateContent {
  text-align: center;
  position: relative;
  max-width: 480px;
  top: -30px;  /* 视觉上略偏上 */
}

/* 占位文本 —— 等宽小字 */
.emptyStateText {
  font-family: var(--app-monospace-font-family);
  color: var(--app-secondary-foreground);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  margin: 0;
  font-size: 10px;
}

/* 建议芯片 */
.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 30px;
  padding: 0 20px;
}

.suggestion {
  /* 可点击卡片样式 */
  cursor: pointer;
  /* 点击后发送对应提示到输入框 */
}
```

---

## 11. 自动滚动行为

### 11.1 "Stick to Bottom" 策略

```javascript
// 判断是否在底部 (50px 阈值)
function isAtBottom(container) {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return (scrollHeight - scrollTop - clientHeight) < 50;
}
```

### 11.2 滚动触发时机

```javascript
useLayoutEffect(() => {
  const container = messagesRef.current;

  // 情况1: 有权限请求 → 总是平滑滚动到底部
  if (permissionRequests.length > 0) {
    scrollToBottom(container, true /* smooth */);
    return;
  }

  // 情况2: 初始加载 (0 → N 条消息) → 立即跳到底部
  if (prevMessageCount === 0 && messages.length > 0) {
    scrollToBottom(container, false /* instant */);
    isSticky.current = true;
    return;
  }

  // 情况3: 用户在底部 → 新消息来时保持在底部
  if (isSticky.current) {
    scrollToBottom(container, false /* instant */);
  }

  // 如果用户主动向上滚动了 → 不自动滚动
}, [messages, permissionRequests]);

function scrollToBottom(container, smooth) {
  if (smooth) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}
```

**注意：没有 "Scroll to bottom" 浮动按钮 (FAB)** —— 与 ChatGPT 等产品不同。

---

## 12. 图片与附件视觉

### 12.1 图片缩略图

```
┌──────────┐
│  🖼️      │  ← 48px 高，圆角，object-fit:cover
│          │
│     [×]  │  ← hover 时出现删除按钮
└──────────┘
```

```css
.thumbnailAttachment {
  display: inline-block;
  position: relative;
  cursor: pointer;
  border: 1px solid var(--app-input-border);
  border-radius: 8px;
  transition: border-color 0.15s;
}

.thumbnail {
  object-fit: cover;
  border-radius: 7px;
  width: auto;
  max-width: 120px;
  height: 48px;
}
```

### 12.2 图片全屏预览

点击缩略图打开全屏覆盖层：

```css
.previewOverlay {
  position: fixed;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  inset: 0;
}

.previewImage {
  object-fit: contain;
  border-radius: 8px;
  max-width: 90vw;
  max-height: 90vh;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
```

### 12.3 文件附件 Pill

非图片文件显示为药丸形状：

```css
.pill {
  display: inline-flex;
  height: 24px;
  max-width: 180px;
  background: color-mix(
    in srgb,
    var(--app-input-background) 85%,
    var(--app-secondary-foreground)
  );
  border: 1px solid var(--app-input-border);
  border-radius: var(--pill-radius, 4px);
  cursor: pointer;
  overflow: hidden;
}
```

---

## 13. 错误与状态显示

### 13.1 顶部错误横幅

```css
.errorBanner {
  background-color: color-mix(
    in srgb,
    var(--app-primary-background) 96%,
    var(--app-error-foreground) 4%
  );
  color: var(--app-error-foreground);
  border-bottom: 1px solid var(--app-error-foreground);
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.errorMessage {
  word-wrap: break-word;
  user-select: text;
  flex: 1;
  padding: 10px 12px;
}

.errorDismiss {
  width: 44px;
  height: 44px;
  font-size: 20px;
  color: var(--app-error-foreground);
}

.errorDismiss:hover {
  opacity: 0.7;
}
```

### 13.2 内联错误/成功提示

```css
.errorMessage {
  color: #c74e39;
  background-color: rgba(199, 78, 57, 0.2);
  border: 1px solid #c74e39;
  border-radius: 4px;
  padding: 8px 12px;
}

.successMessage {
  color: #74c991;
  background-color: rgba(116, 201, 145, 0.2);
  border: 1px solid #74c991;
  border-radius: 4px;
  padding: 8px 12px;
}
```

### 13.3 全屏加载覆盖

```css
.loadingState {
  display: flex;
  position: absolute;
  background: var(--app-primary-background);
  color: var(--app-secondary-foreground);
  z-index: 5;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}
```

### 13.4 拖拽文件覆盖层

```css
.dropInfoOverlay {
  position: absolute;
  background: color-mix(
    in srgb,
    var(--app-claude-orange),
    transparent 85%
  );
  border: 2px dashed var(--app-claude-orange);
  z-index: 100;
  inset: 0;
}
```

---

## 14. 主题色系统

### 14.1 核心色彩变量

```css
:root {
  /* Claude 品牌色 */
  --app-claude-orange: #d97757;
  --app-claude-clay-button-orange: #c6613f;
  --app-claude-ivory: #faf9f5;
  --app-claude-slate: #141413;

  /* 语义色 —— 映射 VS Code 主题变量 */
  --app-primary-background: var(--vscode-sideBar-background);
  --app-secondary-background: var(--vscode-editor-background);
  --app-primary-foreground: var(--vscode-foreground);
  --app-secondary-foreground: var(--vscode-descriptionForeground);
  --app-input-background: var(--vscode-input-background);
  --app-input-border: var(--vscode-inlineChatInput-border);
  --app-error-foreground: var(--vscode-errorForeground);
  --app-success-foreground: var(--vscode-gitDecoration-addedResourceForeground);

  /* 工具/代码区域 */
  --app-tool-background: var(--vscode-editor-background);
  --app-code-background: /* 同 tool-background */;

  /* Mention 芯片 */
  --app-mention-chip-background: var(--vscode-chat-slashCommandBackground);
  --app-mention-chip-foreground: var(--vscode-chat-slashCommandForeground);

  /* Diff 颜色 */
  --app-diff-addition-foreground: var(--vscode-gitDecoration-addedResourceForeground);
  --app-diff-deletion-foreground: var(--vscode-gitDecoration-deletedResourceForeground);

  /* 字体 */
  --app-monospace-font-family: var(--vscode-editor-font-family, monospace);
}
```

### 14.2 暗色/亮色自动适配

因为所有颜色都引用 `var(--vscode-*)` 变量，当 VS Code 切换主题时，UI 自动跟随变化。

唯一需要手动区分的是 spinner 前景色：

```css
/* 暗色主题 */
:root {
  --app-spinner-foreground: var(--app-claude-clay-button-orange);
}

/* 亮色主题 (通过 VS Code 的 .vscode-light 类) */
.vscode-light {
  --app-spinner-foreground: var(--app-claude-orange);
}
```

### 14.3 权限模式色彩覆盖

输入框焦点环和发送按钮颜色随权限模式变化：

| 模式 | 焦点环 / 发送按钮色 | 视觉含义 |
|---|---|---|
| `default` | `--app-claude-orange` (橙) | Claude 品牌色 |
| `acceptEdits` | `--app-primary-foreground` (白/黑) | 中性 |
| `plan` | `--vscode-focusBorder` (蓝) | 规划模式 |
| `bypassPermissions` | `--app-error-foreground` (红) | 危险警告 |
| `auto` | `--app-error-foreground` (红) | 危险警告 |

---

## 15. 关键动画一览

| 动画 | 触发场景 | 效果 |
|---|---|---|
| `fadeIn` | 空状态出现、加载行出现、弹窗出现 | `opacity: 0→1`, 0.3s 或 0.1s |
| `blink` | 时间线 `dotProgress` | `opacity: 1→0→1`, 1s 循环 |
| `pulse` | 麦克风录音中 | `opacity: 1→0.7→1`, 1.5s 循环 |
| `spin` | 各种 spinner | `rotate(0→360deg)`, 1s 循环 |
| `wiggle` | 反馈心形图标 | `rotate(0→-8→8→0deg)`, 0.5s |
| 符号切换 | 流式加载指示器 | 6符号循环, 120ms/帧 |
| 打字机效果 | 流式加载动词 | 逐字符出现 |
| `transform: rotate(90deg)` | 思考块箭头展开 | `transition: 0.15s` |
| `max-height: 0→500px` | 任务面板折叠/展开 | `transition: 0.2s` |
| `max-height: 60→auto` | 用户消息展开 | `transition: 0.3s ease-in-out` |

---

## 16. 组件 CSS Hash 映射速查表

| Hash 后缀 | 组件 | 用途 |
|---|---|---|
| `_07S1Yg` | Chat/Messages | 主消息列表、turn、用户/助手消息、时间线、状态点、空状态 |
| `_uq5aLg` | ContentBlock | 工具引用、工具结果、mention 芯片、内容错误 |
| `_ZUQaOA` | ToolBody | 工具参数网格 (grid layout) |
| `_aHyQPQ` | Thinking | 可折叠思考块 |
| `_cKsPxg` | MessageInput | 输入框、mention 镜像、麦克风按钮 |
| `_gGYT1w` | InputFooter | 发送按钮、工具栏按钮 |
| `_-a7MRw` | Markdown | Markdown 渲染、代码块、表格 |
| `_xGDvVg` | Expandable | 可展开/折叠内容 (Show more/less) |
| `_s6OFow` | DiffEditor | 内联 diff 编辑器 |
| `_v2CdxQ` | ActionMenu | Hover 操作按钮 + 弹出菜单 |
| `_vRjSkQ` | Attachment | 图片缩略图 + 全屏预览 |
| `_lcdCYQ` | FilePill | 文件附件药丸 |
| `_hc5dvw` | Spinner | 流式加载指示器 (符号 + 动词) |
| `_mLrg7g` | SecondaryLine | 次级描述行 |
| `_OxFNMA` | TaskPanel | 可折叠任务面板 |
| `_5Dm21w` | EmptyState | 空状态/欢迎屏 |
| `_oQHzFQ` | Suggestions | 建议芯片 |
| `_DGhSIw` | CompactDetails | 紧凑折叠块 |
| `_xheXVQ` | TodoList | 待办列表 (工具内) |
| `_88YE4g` | Banner | 通用横幅 (error/warning) |

---

## 17. 实现指南：如何复刻

### 17.1 最小化实现优先级

**P0 (核心)**
1. 消息容器 flex 布局 + overflow-y:auto
2. 用户消息气泡 (border + background)
3. 助手消息时间线 (::before 圆点 + ::after 竖线)
4. 文本内容 Markdown 渲染
5. 自动滚动 (stick-to-bottom)

**P1 (重要)**
6. 工具调用可折叠面板 (details/summary)
7. 代码块 + 复制按钮
8. 流式加载指示器
9. 用户消息 sticky header
10. 权限模式色彩

**P2 (增强)**
11. 思考块折叠
12. 内联 diff (Monaco)
13. 图片预览 + 全屏
14. 长文本折叠 (Show more/less)
15. Hover 操作菜单
16. Dimmed 权限模式

### 17.2 关键实现技巧

**时间线竖线不中断的秘诀：**
每个 `.timelineMessage` 的 `::after` 从 `top:0` 到 `bottom:0`，相邻消息之间没有 gap，所以竖线自然连成一条。

**用户消息 Sticky 不遮挡的秘诀：**
使用双层 `linear-gradient` 背景，底部 10px 从实色渐变到透明，创造淡出效果而非硬切边。

**工具体内容裁切的秘诀：**
`mask-image: linear-gradient(to bottom, black 50%, transparent 100%)` + `max-height: 60px`，内容超出时自然淡出，避免硬裁切。

**Mention 芯片跨行不断裂的秘诀：**
`-webkit-box-decoration-break: clone` 确保换行时两端都有背景和圆角。

---

*文档版本：v1.0 | 基于 Claude Code Extension v2.1.87 分析*
*生成日期：2026-03-30*
