---
title: 聊天功能规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: implemented
author: lilanhui
---

# 聊天功能规范

## 概述

提供用户与 AI 助手的对话功能，支持流式输出、工具调用展示和权限控制。

## 用户故事

- 作为用户，我希望能够发送消息并实时看到 AI 的回复，以便获得流畅的对话体验
- 作为用户，我希望能够看到 AI 使用了哪些工具，以便了解 AI 的工作过程
- 作为用户，我希望能够控制 AI 的工具使用权限，以便保护我的系统安全
- 作为用户，我希望对话历史能够保存，以便后续查看和继续对话

## 接口定义

### POST /api/chat

发送消息并接收流式响应。

**请求体**

```typescript
interface ChatRequest {
  sessionId?: string;      // 会话 ID，为空则创建新会话
  message: string;         // 用户消息内容
  model?: string;          // 模型 ID (可选)
  systemPrompt?: string;   // 自定义系统提示词 (可选)
  cwd?: string;            // 工作目录 (可选)
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
}
```

**SSE 事件类型**

```typescript
// 初始化事件 - 返回会话信息
interface InitEvent {
  type: 'init';
  sessionId: string;
  sdkSessionId: string;
}

// 文本内容事件 - 流式文本
interface TextEvent {
  type: 'text';
  content: string;
}

// 工具调用事件 - AI 调用工具
interface ToolEvent {
  type: 'tool';
  id: string;
  name: string;
  input: unknown;
}

// 工具结果事件 - 工具执行结果
interface ToolResultEvent {
  type: 'tool_result';
  id: string;
  result: unknown;
}

// 权限请求事件 - 需要用户确认
interface PermissionRequestEvent {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  input: unknown;
}

// 完成事件 - 对话结束
interface DoneEvent {
  type: 'done';
  messageId: string;
}

// 错误事件
interface ErrorEvent {
  type: 'error';
  message: string;
}

type SSEEvent = 
  | InitEvent 
  | TextEvent 
  | ToolEvent 
  | ToolResultEvent 
  | PermissionRequestEvent 
  | DoneEvent 
  | ErrorEvent;
```

### POST /api/permission-response

响应权限请求。

**请求体**

```typescript
interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;  // 拒绝时的原因 (可选)
}
```

**响应**

```typescript
interface Response {
  success: boolean;
}
```

## 组件结构

```
ChatPage
├── Header                    # 顶部导航栏
│   ├── ModelSelector         # 模型选择器
│   ├── AgentSelector         # Agent 选择器
│   └── ThemeToggle           # 主题切换
│
├── Sidebar                   # 侧边栏
│   ├── SessionList           # 会话列表
│   │   ├── SessionItem       # 会话项 (标题、时间、删除)
│   │   └── NewSessionButton  # 新建会话按钮
│   └── FileList              # 知识库文件列表
│
└── ChatArea                  # 聊天区域
    ├── ChatMessages          # 消息列表
    │   └── Message           # 单条消息
    │       ├── Avatar        # 头像 (用户/AI)
    │       ├── Content       # 消息内容
    │       │   └── Markdown  # Markdown 渲染
    │       ├── ToolCallsCollapse   # 工具调用折叠面板
    │       │   ├── ToolName        # 工具名称
    │       │   ├── ToolInput       # 工具输入
    │       │   └── ToolOutput      # 工具输出
    │       └── InlinePermissionCard # 内联权限卡片
    │
    ├── ChatInput             # 消息输入区
    │   ├── Textarea          # 输入框
    │   ├── SendButton        # 发送按钮
    │   └── PermissionMode    # 权限模式选择
    │
    └── PermissionDialog      # 权限请求弹窗 (全局)
```

## 状态管理

使用 `useChat` Hook 管理聊天状态：

```typescript
interface ChatState {
  // 加载状态
  isLoading: boolean;
  
  // 错误信息
  error: string | null;
  
  // 当前正在流式输出的消息
  currentMessage: Message | null;
  
  // 待处理的权限请求
  permissionRequest: PermissionRequest | null;
  
  // 当前会话的消息列表
  messages: Message[];
}

interface UseChatReturn {
  // 状态
  ...ChatState;
  
  // 方法
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  handlePermission: (allow: boolean, message?: string) => Promise<void>;
  clearError: () => void;
}
```

## 权限模式说明

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `default` | 每次工具调用都需要确认 | 生产环境、敏感操作 |
| `acceptEdits` | 自动接受文件编辑类操作 | 开发调试 |
| `plan` | 只读模式，不执行任何操作 | 查看 AI 计划 |
| `bypassPermissions` | 跳过所有权限检查 | 信任的自动化场景 |

## 实现要点

### 1. SSE 流式响应处理

```typescript
// 前端处理 SSE
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify(data),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      handleEvent(event);
    }
  }
}
```

### 2. 消息状态更新

- 用户消息发送后立即显示
- AI 消息流式更新 (`isStreaming: true`)
- 完成后更新最终状态 (`isStreaming: false`)

### 3. 工具调用展示

- 折叠面板默认收起
- 显示工具名称、输入参数和输出结果
- 支持 JSON 格式化显示

## 测试用例

### 功能测试

| 用例 | 预期结果 |
|------|----------|
| 发送普通消息 | 用户消息立即显示，AI 回复流式输出 |
| 发送空消息 | 阻止发送，显示提示 |
| 网络断开时发送 | 显示错误信息 |
| AI 调用工具 | 工具调用面板正确展示 |
| 权限请求 | 弹出权限弹窗，阻塞后续操作 |
| 允许权限 | 继续执行工具 |
| 拒绝权限 | 停止工具执行，显示拒绝信息 |
| 刷新页面后 | 消息历史正确恢复 |

### 性能测试

| 场景 | 目标 |
|------|------|
| 首条消息响应 | < 2s |
| 流式输出延迟 | < 100ms |
| 100 条消息滚动 | 流畅无卡顿 |

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-03-22 | 初始版本 |
