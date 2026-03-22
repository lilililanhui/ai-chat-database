# 示例：添加导出功能

本文档演示如何使用 SDD Feature Skill 添加一个"导出对话"功能。

## 用户请求

> "我想添加一个功能，可以将对话导出为 Markdown 文件"

## Phase 1: 需求分析

### 1.1 理解需求

AI 首先会询问一些澄清问题：

- 导出格式：Markdown（用户已指定）
- 导出范围：单个会话 or 全部会话？
- 导出内容：是否包含工具调用记录？
- 导出方式：下载文件 or 复制到剪贴板？

### 1.2 检查现有规范

AI 读取以下文件：
- `specs/PROJECT.md` - 了解代码规范
- `specs/ARCHITECTURE.md` - 了解数据结构
- `specs/features/session.md` - 了解会话数据模型

## Phase 2: 编写规范

### 2.1 创建 Spec 文件

创建 `specs/features/export.md`：

```markdown
---
title: 导出功能规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: draft
author: lilanhui
---

# 导出功能规范

## 概述

支持将对话导出为 Markdown 文件，方便用户保存和分享对话记录。

## 用户故事

- 作为用户，我希望能够将单个对话导出为 Markdown 文件，以便在其他地方查看或分享
- 作为用户，我希望导出的文件包含完整的对话信息，包括时间戳和工具调用记录

## 接口定义

### GET /api/sessions/:sessionId/export

**查询参数**

- `format`: 导出格式，默认 `markdown`
- `includeToolCalls`: 是否包含工具调用，默认 `true`

**响应**

Content-Type: text/markdown

```markdown
# 对话标题

**导出时间**: 2026-03-22 10:30:00
**会话创建**: 2026-03-20 14:00:00
**消息数量**: 10

---

## 对话内容

### 用户 (2026-03-20 14:00:00)
你好

### AI (2026-03-20 14:00:05)
你好！有什么可以帮助你的？
...
```

## 组件结构

在 ChatMessages 组件中添加导出按钮：

```
ChatMessages
└── Header
    └── ExportButton
        └── Dropdown
            ├── Export as Markdown
            └── Copy to Clipboard
```

## 测试用例

| 用例 | 预期结果 |
|------|----------|
| 点击导出按钮 | 下载 .md 文件 |
| 导出空会话 | 提示"无内容可导出" |
| 包含工具调用 | Markdown 中有工具调用块 |
```

### 2.2 更新索引

在 `specs/features/_index.md` 中添加：

| export.md | 导出功能 | 🔄 开发中 | 1.0.0 | 2026-03-22 |

## Phase 3: 实现功能

### 3.1 后端 API

```typescript
// server/index.ts

app.get('/api/sessions/:sessionId/export', (req, res) => {
  const { sessionId } = req.params;
  const { format = 'markdown', includeToolCalls = 'true' } = req.query;
  
  const session = db.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: '会话不存在' });
  }
  
  const messages = db.getMessagesBySession(sessionId);
  
  // 生成 Markdown
  const markdown = generateMarkdown(session, messages, {
    includeToolCalls: includeToolCalls === 'true'
  });
  
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 
    `attachment; filename="${session.title || 'chat'}.md"`);
  res.send(markdown);
});

function generateMarkdown(
  session: DbSession, 
  messages: DbMessage[], 
  options: { includeToolCalls: boolean }
): string {
  const lines: string[] = [];
  
  lines.push(`# ${session.title || '对话记录'}`);
  lines.push('');
  lines.push(`**导出时间**: ${new Date().toLocaleString('zh-CN')}`);
  lines.push(`**会话创建**: ${new Date(session.created_at).toLocaleString('zh-CN')}`);
  lines.push(`**消息数量**: ${messages.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 对话内容');
  lines.push('');
  
  for (const msg of messages) {
    const role = msg.role === 'user' ? '用户' : 'AI';
    const time = new Date(msg.created_at).toLocaleString('zh-CN');
    
    lines.push(`### ${role} (${time})`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    
    if (options.includeToolCalls && msg.tool_calls) {
      const toolCalls = JSON.parse(msg.tool_calls);
      if (toolCalls.length > 0) {
        lines.push('<details>');
        lines.push('<summary>工具调用</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(toolCalls, null, 2));
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}
```

### 3.2 前端组件

```tsx
// src/components/ExportButton.tsx

import React from 'react';
import { Button, Dropdown } from 'tdesign-react';
import { DownloadIcon } from 'tdesign-icons-react';

interface ExportButtonProps {
  sessionId: string;
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ 
  sessionId, 
  disabled 
}) => {
  const handleExport = async (format: string) => {
    if (format === 'markdown') {
      window.open(`/api/sessions/${sessionId}/export?format=markdown`, '_blank');
    } else if (format === 'clipboard') {
      const response = await fetch(
        `/api/sessions/${sessionId}/export?format=markdown`
      );
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      // 显示成功提示
    }
  };
  
  const options = [
    { content: '导出为 Markdown', value: 'markdown' },
    { content: '复制到剪贴板', value: 'clipboard' },
  ];
  
  return (
    <Dropdown 
      options={options} 
      onClick={(data) => handleExport(data.value as string)}
    >
      <Button 
        icon={<DownloadIcon />} 
        variant="outline"
        disabled={disabled}
      >
        导出
      </Button>
    </Dropdown>
  );
};
```

### 3.3 集成到 ChatMessages

```tsx
// 在 ChatMessages.tsx 中

import { ExportButton } from './ExportButton';

// 在消息列表头部添加
<div className="chat-header">
  <ExportButton sessionId={currentSessionId} disabled={messages.length === 0} />
</div>
```

## Phase 4: 验证与文档

### 4.1 验证测试用例

- [x] 点击导出按钮 → 成功下载 .md 文件
- [x] 导出空会话 → 提示"无内容可导出"
- [x] 包含工具调用 → Markdown 中正确显示工具调用

### 4.2 更新文档

1. 更新 `specs/features/export.md` 的 status 为 `implemented`
2. 更新 `specs/features/_index.md` 状态为 ✅ 已实现
3. 在 `specs/CHANGELOG.md` 添加：

```markdown
## [1.1.0] - 2026-03-22

### 新增
- **features/export.md** - 导出功能规范
  - 支持导出为 Markdown 文件
  - 支持复制到剪贴板
  - 可选包含工具调用记录
```

## 总结

通过 SDD 模式，我们完成了：

1. ✅ 清晰的需求文档
2. ✅ 规范的接口定义
3. ✅ 符合项目规范的代码实现
4. ✅ 完整的变更记录

整个过程可追溯、可维护，为后续的功能迭代奠定了良好基础。
