# SDD 最佳实践

## 1. 需求分析最佳实践

### 1.1 使用 5W1H 分析法

在开始编写 Spec 之前，确保理解：

- **What**: 要实现什么功能？
- **Why**: 为什么需要这个功能？
- **Who**: 谁会使用这个功能？
- **When**: 什么时候使用？
- **Where**: 在哪里使用（哪个页面/模块）？
- **How**: 如何实现？

### 1.2 识别边界条件

在 Spec 中明确列出：

- 输入验证规则
- 错误处理方式
- 边界情况处理

```markdown
## 边界条件

| 条件 | 处理方式 |
|------|----------|
| 输入为空 | 显示错误提示，阻止提交 |
| 输入超长 | 截断到最大长度 |
| 网络断开 | 显示离线提示，缓存数据 |
```

### 1.3 定义非功能需求

别忘了性能、安全等非功能需求：

```markdown
## 非功能需求

- **性能**: 页面加载时间 < 2s
- **安全**: 需要登录认证
- **可访问性**: 支持键盘导航
- **国际化**: 预留文案国际化接口
```

## 2. Spec 编写最佳实践

### 2.1 使用标准模板

始终使用 `specs/_templates/feature-template.md` 作为起点，确保格式一致。

### 2.2 保持 Spec 可执行

Spec 中的内容应该足够具体，AI 可以直接据此生成代码：

❌ 不够具体：
```markdown
添加一个导出按钮
```

✅ 足够具体：
```markdown
在 ChatMessages 组件的头部右侧添加导出按钮：
- 使用 TDesign 的 Button 组件
- 图标使用 DownloadIcon
- 点击后触发 handleExport 方法
- 支持 Dropdown 选择导出格式
```

### 2.3 接口定义要完整

```typescript
// ✅ 好的接口定义
interface CreateSessionRequest {
  title?: string;   // 会话标题，默认 "新会话"
  model?: string;   // 模型 ID，默认使用系统默认模型
}

interface CreateSessionResponse {
  session: {
    id: string;           // UUID
    title: string;        // 会话标题
    model: string;        // 模型 ID
    created_at: string;   // ISO 8601 时间戳
    updated_at: string;   // ISO 8601 时间戳
  };
}

// 错误响应
interface ErrorResponse {
  error: string;          // 错误信息
  code?: number;          // 错误码
}
```

### 2.4 用户故事要有价值

使用标准格式：`作为 [角色]，我希望 [功能]，以便 [价值]`

❌ 没有价值说明：
```markdown
- 作为用户，我希望能够导出对话
```

✅ 有明确价值：
```markdown
- 作为用户，我希望能够将对话导出为 Markdown 文件，以便在其他设备上查看或分享给同事
```

## 3. 代码实现最佳实践

### 3.1 遵循项目规范

始终参考 `specs/PROJECT.md` 中的代码规范：

- 命名规范
- 文件组织
- 注释风格

### 3.2 先后端后前端

实现顺序建议：

1. 数据库变更（如需要）
2. 后端 API
3. 前端组件
4. 状态管理 Hook
5. 样式调整

### 3.3 保持代码与 Spec 一致

如果在实现过程中发现 Spec 不合理，**先更新 Spec，再修改代码**。

### 3.4 添加适当的注释

```typescript
/**
 * 导出会话为 Markdown 格式
 * @see specs/features/export.md
 */
app.get('/api/sessions/:sessionId/export', (req, res) => {
  // 实现逻辑...
});
```

## 4. 文档维护最佳实践

### 4.1 及时更新状态

功能开发过程中及时更新 Spec 状态：

```
draft → review → approved → implemented
```

### 4.2 保持 CHANGELOG 同步

每次功能上线后更新 `specs/CHANGELOG.md`：

```markdown
## [1.2.0] - 2026-03-25

### 新增
- 导出功能 (export.md)
  - 支持 Markdown 格式导出
  - 支持复制到剪贴板

### 变更
- 聊天功能 (chat.md)
  - 优化消息加载性能
```

### 4.3 定期审查

建议每月审查一次：

- Spec 与代码是否一致
- 是否有废弃的 Spec 需要标记
- 是否有缺失的 Spec 需要补充

## 5. 团队协作最佳实践

### 5.1 Spec 评审流程

```
编写 Spec → 提交 PR → 团队评审 → 批准 → 开始开发
```

### 5.2 使用 ADR 记录重大决策

对于架构级别的决策，使用 ADR (Architecture Decision Record)：

```
specs/decisions/
├── 001-use-sqlite.md
├── 002-use-sse-streaming.md
└── 003-permission-control-design.md
```

### 5.3 建立 Spec 所有权

每个 Spec 都应该有明确的 owner：

```yaml
---
title: 导出功能
author: lilanhui        # Owner
reviewers: [zhangsan]   # Reviewers
---
```

## 6. 常见陷阱

### 6.1 过度设计

❌ 为简单功能写过于复杂的 Spec

✅ Spec 的详细程度应与功能复杂度匹配

### 6.2 Spec 落后于代码

❌ 代码改了，Spec 没更新

✅ 建立 Code Review 检查项：Spec 是否同步更新

### 6.3 忽视测试用例

❌ Spec 中没有测试用例

✅ 每个 Spec 都应该有明确的验收标准

### 6.4 接口定义不完整

❌ 只定义成功响应，没有错误响应

✅ 完整定义所有可能的响应
