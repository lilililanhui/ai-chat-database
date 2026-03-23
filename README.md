# AI 知识库助手

一个基于 Markdown 知识库的智能问答助手，支持 RAG（检索增强生成）和本地知识库管理。

## 特性

- 📚 **Markdown 知识库** - 支持导入本地 Markdown 文件作为知识库
- 🔍 **RAG 语义检索** - 基于 Chroma 向量数据库的语义搜索，为 AI 提供精准上下文
- 💬 **流式对话** - 实时显示 AI 回复
- 🔧 **工具调用** - 可视化展示 Agent 工具使用
- 🔒 **权限控制** - 支持多种权限模式
- 📝 **会话管理** - 多会话切换和持久化
- 🎨 **主题切换** - 支持深色/浅色主题
- 🤖 **自定义 Agent** - 创建和管理多个 Agent 配置
- 🖥️ **桌面应用** - 支持 Electron 打包为桌面应用

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **前端**: React 18 + TypeScript + Vite
- **UI**: TDesign React 组件库 + TDesign AIGC 组件
- **AI**: CodeBuddy Agent SDK (@tencent-ai/agent-sdk)
- **会话数据库**: SQLite (better-sqlite3)
- **向量数据库**: Chroma (chromadb) - 语义搜索
- **Embedding**: all-MiniLM-L6-v2 (默认)
- **桌面**: Electron

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动 Chroma 向量数据库

```bash
# 方式一：使用 npm 脚本（推荐）
npm run chroma

# 方式二：使用 Docker
docker run -p 8000:8000 chromadb/chroma
```

### 3. 启动开发服务器

```bash
# 方式一：分别启动（推荐调试时使用）
npm run dev

# 方式二：同时启动 Chroma 和开发服务器
npm run dev:chroma
```

这会同时启动前端（端口 5173）和后端（端口 3000）

### 4. 访问应用

打开浏览器访问 http://localhost:5173

## 项目结构

```
ai-chat-database/
├── server/                    # 后端服务
│   ├── index.ts              # Express 服务器入口
│   ├── db.ts                 # 会话/消息数据库操作
│   ├── rag.ts                # RAG 知识库检索模块
│   └── index.d.ts            # 类型定义
├── src/                      # 前端源码
│   ├── components/           # React 组件
│   │   ├── ChatMessages.tsx  # 消息列表展示
│   │   ├── ChatInput.tsx     # 消息输入框
│   │   ├── Sidebar.tsx       # 侧边栏（会话/文件列表）
│   │   ├── Header.tsx        # 顶部导航栏
│   │   ├── FileViewer.tsx    # 知识库文件查看器
│   │   ├── ToolCallsCollapse.tsx    # 工具调用展示
│   │   ├── PermissionDialog.tsx     # 权限请求弹窗
│   │   ├── InlinePermissionCard.tsx # 内联权限卡片
│   │   ├── AgentConfigDialog.tsx    # Agent 配置
│   │   ├── SettingsPage.tsx  # 设置页面
│   │   └── ...
│   ├── hooks/                # 自定义 Hooks
│   │   ├── useChat.ts        # 聊天逻辑
│   │   ├── useSessions.ts    # 会话管理
│   │   ├── useModels.ts      # 模型管理
│   │   ├── useAgents.ts      # Agent 管理
│   │   ├── useMarkdownFiles.ts # Markdown 文件管理
│   │   └── useTheme.ts       # 主题管理
│   ├── pages/                # 页面组件
│   ├── utils/                # 工具函数
│   ├── types.ts              # TypeScript 类型定义
│   ├── config.ts             # 应用配置
│   └── App.tsx               # 应用入口
├── electron/                 # Electron 桌面应用
│   └── main.cjs              # Electron 主进程
├── data/                     # 数据存储
│   ├── chat.db               # 会话/消息数据库 (SQLite)
│   ├── chroma/               # Chroma 向量数据库存储
│   └── index-cache.json      # 文件索引缓存
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md                 # 项目说明
└── DEVELOPMENT.md            # 二次开发指南
```

## 核心功能

### 知识库管理（RAG）

- 支持导入本地 Markdown 文件目录作为知识库
- 自动解析 Markdown 文件的 Front Matter 元数据
- 智能分块：按标题分割文档，支持大文档自动拆分
- **语义搜索**：基于 Chroma 向量数据库的语义检索
- **Embedding**：使用 all-MiniLM-L6-v2 模型生成文档向量
- 实时索引：支持文件变更时自动更新索引
- 相似度排序：返回与查询最相关的文档片段

### Agent SDK 集成

- 使用 `query()` API 发送消息并接收流式响应
- 使用 `unstable_v2_createSession()` 创建和管理 Agent 会话
- 使用 `unstable_v2_authenticate()` 处理身份认证
- 支持会话恢复（使用 `resume` 参数）
- 自动将知识库检索结果注入到系统提示词中

### 权限控制

支持四种权限模式：
- `default` - 每次工具调用需要确认
- `acceptEdits` - 自动接受编辑类操作
- `plan` - 计划模式（只读）
- `bypassPermissions` - 跳过所有权限检查

### 流式响应

使用 Server-Sent Events (SSE) 实现实时流式响应：
- 文本内容流式输出
- 工具调用实时展示
- 权限请求实时弹窗

### 数据持久化

**SQLite** 存储会话数据：
- 会话信息和配置（chat.db）
- 消息历史记录
- Agent SDK 的 session_id（用于恢复对话）

**Chroma** 向量数据库存储知识库：
- 文档向量嵌入
- 文档元数据（标题、路径、分块索引）
- 支持语义相似度搜索

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/check-login` | GET | 检查 CodeBuddy 登录状态 |
| `/api/models` | GET | 获取可用模型列表 |
| `/api/sessions` | GET | 获取所有会话 |
| `/api/sessions` | POST | 创建新会话 |
| `/api/sessions/:id` | GET | 获取单个会话 |
| `/api/sessions/:id` | PATCH | 更新会话 |
| `/api/sessions/:id` | DELETE | 删除会话 |
| `/api/chat` | POST | 发送消息（SSE 流式响应） |
| `/api/permission-response` | POST | 响应权限请求 |
| `/api/rag/index` | POST | 索引知识库目录 |
| `/api/rag/search` | POST | 搜索知识库（语义搜索） |
| `/api/markdown-files` | GET | 获取已索引文件列表 |
| `/api/rag/stats` | GET | 获取索引统计信息 |
| `/api/rag/file` | DELETE | 删除文件索引 |
| `/api/rag/chroma-status` | GET | 检查 Chroma 服务器状态 |
| `/api/rag/reset` | POST | 重置知识库（危险操作） |

## 环境要求

- Node.js 18+
- npm 或 yarn
- Chroma 向量数据库（通过 npm 脚本自动启动或 Docker）

## Chroma 向量数据库

### 启动方式

**方式一：使用 npm 脚本（推荐）**

```bash
npm run chroma
```

这会在 `./data/chroma` 目录下持久化存储向量数据。

**方式二：使用 Docker**

```bash
docker run -p 8000:8000 -v $(pwd)/data/chroma:/chroma/chroma chromadb/chroma
```

### 配置

默认连接地址为 `http://localhost:8000`，可通过环境变量修改：

```bash
CHROMA_HOST=http://your-chroma-server:8000
```

### 使用的 Embedding 模型

默认使用 `all-MiniLM-L6-v2` 模型进行文本向量化，该模型会自动下载（约 80MB）。

如需使用其他 Embedding 模型（如 OpenAI），可修改 `server/rag.ts` 中的 `embeddingFunction`。

## 配置

### 方式一：环境变量配置

创建 `.env` 文件：

```bash
PORT=3000
CODEBUDDY_API_KEY=your_api_key
CODEBUDDY_AUTH_TOKEN=your_auth_token
CODEBUDDY_BASE_URL=https://api.example.com
CODEBUDDY_INTERNET_ENVIRONMENT=external
```

### 方式二：使用 CodeBuddy CLI 登录

```bash
# 登录 CodeBuddy
codebuddy login

# 启动应用（会自动使用 CLI 的登录信息）
npm run dev
```

### 方式三：Web UI 配置

在应用的设置页面中配置环境变量（仅在当前服务器进程有效）。

## 开发

```bash
# 启动 Chroma 向量数据库
npm run chroma

# 开发模式（同时启动前后端，需要先启动 Chroma）
npm run dev

# 同时启动 Chroma 和开发服务器
npm run dev:chroma

# 单独启动后端
npm run dev:server

# 单独启动前端
npm run dev:client

# 构建生产版本
npm run build

# 运行生产版本
npm start

# Electron 开发模式
npm run dev:electron

# 构建 Electron 桌面应用
npm run build:electron
```

## Electron 桌面应用

本项目支持打包为桌面应用：

- **macOS**: 生成 `.dmg` 安装包
- **Windows**: 生成 `.exe` 安装程序（NSIS）

### 打包步骤

```bash
# 构建 Electron 应用
npm run build:electron

# 输出目录: dist-electron/
```

### 桌面应用特性

- 原生窗口管理
- macOS 隐藏标题栏风格
- 自动启动内置服务器
- 外部链接在默认浏览器打开

## 二次开发

如果你想基于这个模板进行定制化开发，请查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 获取详细指南，包括：

- 项目架构详解
- 核心功能实现原理
- 10+ 常见定制场景示例
- API 完整参考
- 调试和部署指南

## License

MIT
