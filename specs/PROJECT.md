---
title: AI 知识库助手 - 项目规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: approved
author: lilanhui
---

# AI 知识库助手 - 项目规范

## 项目概述

**名称**: AI 知识库助手  
**版本**: 1.0.0  
**描述**: 基于 Markdown 知识库的智能问答助手，支持 RAG（检索增强生成）和本地知识库管理

## 核心目标

1. 提供基于本地 Markdown 文件的知识库管理
2. 通过 RAG 技术增强 AI 回答的准确性和上下文相关性
3. 支持流式对话和工具调用可视化
4. 提供桌面应用和 Web 应用两种部署方式
5. 支持自定义 Agent 配置和管理

## 技术约束

| 类别 | 要求 |
|------|------|
| **Node.js** | >= 18.0.0 |
| **TypeScript** | 严格模式 |
| **React** | 18.x 函数式组件 + Hooks |
| **数据库** | SQLite (better-sqlite3) |
| **UI 框架** | TDesign React + TDesign AIGC |
| **AI SDK** | @tencent-ai/agent-sdk |
| **桌面应用** | Electron |

## 代码规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ChatMessages.tsx` |
| Hooks | camelCase + `use` 前缀 | `useChat.ts` |
| 工具函数 | camelCase | `formatDate.ts` |
| API 路由 | kebab-case | `/api/rag-search` |
| 类型定义 | PascalCase | `interface ChatMessage` |

### 文件组织

- 类型定义放在 `types.ts` 或相应模块的 `.d.ts` 文件中
- 组件相关的样式放在同目录或使用 TailwindCSS
- 业务逻辑尽量抽取到 Hooks 中

## 目录约定

| 目录 | 用途 |
|------|------|
| `server/` | 后端 Express 服务 |
| `src/components/` | React 组件 |
| `src/hooks/` | 自定义 Hooks |
| `src/pages/` | 页面级组件 |
| `src/utils/` | 工具函数 |
| `data/` | SQLite 数据库文件 |
| `specs/` | 规范文档 |
| `electron/` | Electron 主进程代码 |

## 依赖管理

### 核心依赖

```json
{
  "@tencent-ai/agent-sdk": "^0.3.x",
  "@tdesign-react/aigc": "^0.1.x",
  "@tdesign-react/chat": "^1.0.x",
  "better-sqlite3": "^12.x",
  "express": "^4.18.x",
  "react": "^18.2.x",
  "react-router-dom": "^7.x"
}
```

### 新增依赖原则

1. 优先使用现有依赖库的功能
2. 新增前评估包大小和维护状态
3. 避免引入功能重叠的库

## 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-03-22 | 初始项目规范 |
