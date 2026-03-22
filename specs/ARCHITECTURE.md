---
title: 系统架构规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: approved
author: lilanhui
---

# 系统架构规范

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React + Vite)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  Pages  │  │Components│  │  Hooks  │  │  Utils  │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       └────────────┴────────────┴────────────┘          │
│                          │ HTTP/SSE                      │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    后端 (Express)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐  │
│  │  Routes │  │   DB    │  │    Agent SDK            │  │
│  │ (REST)  │  │ (SQLite)│  │ (@tencent-ai/agent-sdk) │  │
│  └─────────┘  └─────────┘  └─────────────────────────┘  │
│       │            │                    │                │
│  ┌────┴────────────┴────────────────────┴───────────┐   │
│  │                RAG 模块 (rag.ts)                  │   │
│  │  - 文件索引                                       │   │
│  │  - 关键词提取                                     │   │
│  │  - 相似度检索                                     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                  Electron (可选)                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  main.cjs - 桌面应用主进程                       │    │
│  │  - 窗口管理                                      │    │
│  │  - 内置服务器启动                                │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 数据流

### 聊天流程

```
用户输入 → ChatInput → useChat Hook → POST /api/chat
                                            │
                                            ↓
                                    RAG 检索相关文档
                                            │
                                            ↓
                                    Agent SDK query()
                                            │
                                            ↓ (SSE)
                                    流式响应事件
                                            │
                                            ↓
                                    ChatMessages 更新
```

### RAG 索引流程

```
用户选择目录 → POST /api/rag/index
                      │
                      ↓
              递归扫描 .md 文件
                      │
                      ↓
              解析 Front Matter
                      │
                      ↓
              按标题分块 (##, ###)
                      │
                      ↓
              提取中英文关键词
                      │
                      ↓
              存储到 vectors.db
```

### 权限控制流程

```
Agent SDK 请求工具执行
         │
         ↓
  canUseTool 回调
         │
         ↓
    检查权限模式
         │
    ┌────┴────┐
    │         │
bypassPermissions    其他模式
    │                  │
    ↓                  ↓
 直接允许         发送权限请求
                      │
                      ↓
              前端显示权限弹窗
                      │
                      ↓
              用户响应 (允许/拒绝)
                      │
                      ↓
              POST /api/permission-response
                      │
                      ↓
              返回工具执行结果
```

## 数据库设计

### chat.db - 会话与消息

**sessions 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，UUID |
| title | TEXT | 会话标题 |
| model | TEXT | 使用的模型 ID |
| sdk_session_id | TEXT | Agent SDK 会话 ID（用于恢复对话） |
| created_at | TEXT | 创建时间 (ISO 8601) |
| updated_at | TEXT | 更新时间 (ISO 8601) |

**messages 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，UUID |
| session_id | TEXT | 外键，关联 sessions.id |
| role | TEXT | 'user' 或 'assistant' |
| content | TEXT | 消息内容 |
| model | TEXT | 使用的模型 |
| created_at | TEXT | 创建时间 (ISO 8601) |
| tool_calls | TEXT | JSON 格式的工具调用记录 |

### vectors.db - 知识库索引

**documents 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，UUID |
| path | TEXT | 文件路径 |
| title | TEXT | 文档块标题 |
| content | TEXT | 文档块内容 |
| keywords | TEXT | JSON 数组，关键词列表 |
| metadata | TEXT | JSON，Front Matter 数据 |
| created_at | TEXT | 创建时间 (ISO 8601) |

**索引**

```sql
CREATE INDEX idx_documents_path ON documents(path);
CREATE INDEX idx_documents_keywords ON documents(keywords);
```

## API 设计原则

1. **RESTful 风格** - 使用 HTTP 动词表达操作语义
2. **统一错误响应** - `{ error: string, code?: number }`
3. **流式接口使用 SSE** - Server-Sent Events
4. **时间戳格式** - ISO 8601 (如 `2026-03-22T10:30:00.000Z`)
5. **分页参数** - `?page=1&limit=20`

## 组件层级

```
App
├── Header                    # 顶部导航
├── Sidebar                   # 侧边栏
│   ├── SessionList           # 会话列表
│   └── FileList              # 知识库文件列表
└── ChatPage                  # 主聊天页面
    ├── ChatMessages          # 消息列表
    │   ├── Message           # 单条消息
    │   │   ├── ToolCallsCollapse    # 工具调用折叠
    │   │   └── InlinePermissionCard # 内联权限卡片
    │   └── ...
    ├── ChatInput             # 消息输入
    ├── PermissionDialog      # 权限弹窗 (全局)
    └── AgentConfigDialog     # Agent 配置弹窗
```

## 状态管理策略

### 使用 React Hooks + Context

| Hook | 职责 |
|------|------|
| `useChat` | 聊天消息、发送、流式响应 |
| `useSessions` | 会话 CRUD |
| `useModels` | 模型列表、选择 |
| `useAgents` | 自定义 Agent 管理 |
| `useMarkdownFiles` | 知识库文件管理 |
| `useTheme` | 主题切换 |

### 状态持久化

- **会话/消息**: SQLite (chat.db)
- **自定义 Agent**: localStorage
- **主题偏好**: localStorage
- **知识库索引**: SQLite (vectors.db)

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-03-22 | 初始架构规范 |
