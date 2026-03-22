# 规范变更日志

所有 Spec 文件的重要变更记录。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

## [未发布]

_暂无待发布内容_

---

## [1.0.0] - 2026-03-22

### 新增

- **PROJECT.md** - 项目总体规范
  - 项目概述与核心目标
  - 技术约束与代码规范
  - 目录约定与依赖管理

- **ARCHITECTURE.md** - 系统架构规范
  - 整体架构图
  - 数据流设计（聊天、RAG、权限）
  - 数据库设计（chat.db, vectors.db）
  - API 设计原则
  - 组件层级与状态管理策略

- **features/_index.md** - 功能规范索引
  - 功能状态追踪表
  - 状态说明

- **features/chat.md** - 聊天功能规范
  - 功能描述与用户故事
  - API 接口定义（SSE 事件类型）
  - 组件结构与状态管理
  - 测试用例

- **features/rag.md** - RAG 知识库规范
  - 索引与检索流程
  - API 接口定义
  - 关键词提取与相似度算法
  - 数据结构设计

- **features/session.md** - 会话管理规范
  - 会话生命周期
  - API 接口定义
  - 会话恢复机制

- **decisions/001-use-sqlite.md** - 架构决策记录
  - 选择 SQLite 的理由与后果

---

## 变更类型说明

- **新增 (Added)** - 新功能或新规范
- **变更 (Changed)** - 现有规范的修改
- **废弃 (Deprecated)** - 即将移除的功能
- **移除 (Removed)** - 已移除的功能
- **修复 (Fixed)** - Bug 修复
- **安全 (Security)** - 安全相关的变更
