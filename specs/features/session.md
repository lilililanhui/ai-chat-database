---
title: 会话管理规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: implemented
author: lilanhui
---

# 会话管理规范

## 概述

提供多会话的创建、切换、持久化和恢复功能，支持 Agent SDK 的会话上下文恢复。

## 用户故事

- 作为用户，我希望能够创建多个独立的会话，以便针对不同主题进行对话
- 作为用户，我希望能够切换不同的会话，以便在多个对话之间快速跳转
- 作为用户，我希望会话能够自动保存，以便下次打开应用时恢复
- 作为用户，我希望能够删除不需要的会话，以便保持会话列表整洁
- 作为用户，我希望能够修改会话标题，以便更好地标识会话内容

## 会话生命周期

```
创建会话
    │
    ↓
[新会话] ──发送首条消息──→ [活跃会话]
    │                          │
    │                          ↓
    │                     Agent SDK 返回
    │                     sdk_session_id
    │                          │
    │                          ↓
    │                     保存到数据库
    │                          │
    │                          ↓
    └───────────────────→ [持久化会话]
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ↓                     ↓
              继续对话               删除会话
                    │                     │
                    ↓                     ↓
              使用 resume             删除记录
              恢复上下文              级联删除消息
```

## 接口定义

### GET /api/sessions

获取所有会话列表。

**响应**

```typescript
interface SessionsResponse {
  sessions: Array<{
    id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
    messageCount: number;  // 消息数量
  }>;
}
```

### GET /api/sessions/:sessionId

获取单个会话详情及其消息。

**响应**

```typescript
interface SessionDetailResponse {
  session: {
    id: string;
    title: string;
    model: string;
    sdk_session_id: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    model: string | null;
    created_at: string;
    tool_calls: string | null;  // JSON 字符串
  }>;
}
```

### POST /api/sessions

创建新会话。

**请求体**

```typescript
interface CreateSessionRequest {
  title?: string;   // 会话标题，默认 "新会话"
  model?: string;   // 模型 ID
}
```

**响应**

```typescript
interface CreateSessionResponse {
  session: {
    id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
  };
}
```

### PATCH /api/sessions/:sessionId

更新会话信息。

**请求体**

```typescript
interface UpdateSessionRequest {
  title?: string;
  model?: string;
}
```

**响应**

```typescript
interface UpdateResponse {
  success: boolean;
}
```

### DELETE /api/sessions/:sessionId

删除会话及其所有消息。

**响应**

```typescript
interface DeleteResponse {
  success: boolean;
}
```

## 会话恢复机制

### SDK Session ID

当用户发送消息时，Agent SDK 会返回一个 `session_id`，用于后续恢复对话上下文。

```typescript
// 从流中获取 session_id
for await (const msg of stream) {
  if (msg.type === "system" && msg.subtype === "init") {
    const sdkSessionId = msg.session_id;
    
    // 保存到数据库
    db.updateSession(sessionId, { sdk_session_id: sdkSessionId });
  }
}
```

### 恢复对话

后续对话时，使用保存的 `sdk_session_id` 恢复上下文：

```typescript
const session = db.getSession(sessionId);

const stream = query({
  prompt: message,
  options: {
    ...(session.sdk_session_id ? { resume: session.sdk_session_id } : {}),
    // 其他选项
  }
});
```

### 会话过期处理

SDK session 可能过期，需要处理恢复失败的情况：

```typescript
try {
  const stream = query({ ...options, resume: sdkSessionId });
  // 处理流
} catch (error) {
  if (error.message.includes('session expired')) {
    // 清除旧的 sdk_session_id，开始新会话
    db.updateSession(sessionId, { sdk_session_id: null });
    // 重新发送，不使用 resume
    const stream = query({ ...options });
  }
}
```

## 数据结构

### sessions 表

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,          -- UUID
  title TEXT NOT NULL,          -- 会话标题
  model TEXT NOT NULL,          -- 模型 ID
  sdk_session_id TEXT,          -- Agent SDK 会话 ID
  created_at TEXT NOT NULL,     -- ISO 8601
  updated_at TEXT NOT NULL      -- ISO 8601
);

CREATE INDEX idx_sessions_updated_at ON sessions(updated_at DESC);
```

### messages 表

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  tool_calls TEXT,              -- JSON 数组
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

## 组件结构

### Sidebar - SessionList

```
SessionList
├── NewSessionButton      # 新建会话按钮
└── SessionItems          # 会话列表
    └── SessionItem       # 单个会话项
        ├── Title         # 标题 (可编辑)
        ├── UpdatedAt     # 更新时间
        ├── MessageCount  # 消息数量
        └── Actions       # 操作按钮
            ├── Edit      # 编辑标题
            └── Delete    # 删除会话
```

## 状态管理

使用 `useSessions` Hook：

```typescript
interface UseSessionsReturn {
  // 状态
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;
  
  // 方法
  createSession: (params?: CreateSessionParams) => Promise<Session>;
  selectSession: (sessionId: string) => void;
  updateSession: (sessionId: string, params: UpdateSessionParams) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}
```

## 实现要点

### 1. 会话标题自动生成

首次发送消息后，根据用户消息内容自动生成会话标题：

```typescript
function generateTitle(message: string): string {
  // 截取前 20 个字符
  const title = message.slice(0, 20);
  return title.length < message.length ? title + '...' : title;
}
```

### 2. 会话排序

- 按 `updated_at` 降序排列
- 最近活跃的会话显示在顶部

### 3. 删除确认

- 删除会话前显示确认对话框
- 提示将删除所有消息记录

### 4. 空状态处理

- 无会话时显示引导提示
- 提供快速创建按钮

## 测试用例

| 用例 | 预期结果 |
|------|----------|
| 创建新会话 | 会话添加到列表顶部 |
| 切换会话 | 正确加载对应消息 |
| 修改会话标题 | 标题更新，列表刷新 |
| 删除会话 | 会话和消息均被删除 |
| 刷新页面 | 会话列表正确恢复 |
| 继续已有对话 | AI 能够理解上下文 |
| Session 过期 | 自动开始新会话 |

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-03-22 | 初始版本 |
