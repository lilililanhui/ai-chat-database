# SDD Feature Skill - Spec 驱动开发功能新增助手

## 简介

本 Skill 用于指导 AI 按照 Spec 驱动开发 (SDD) 模式新增功能。通过标准化的流程确保每个新功能都有完整的规范文档、正确的实现和充分的测试。

## 触发条件

当用户提出以下请求时激活本 Skill：
- 新增功能/特性
- 添加新模块
- 实现新的 API
- 创建新组件

## 工作流程

### Phase 1: 需求分析

1. **理解需求**
   - 询问用户功能的具体需求
   - 确认功能的边界和范围
   - 识别与现有功能的关系

2. **检查现有规范**
   - 读取 `specs/PROJECT.md` 了解项目约束
   - 读取 `specs/ARCHITECTURE.md` 了解系统架构
   - 检查 `specs/features/_index.md` 避免功能重复

### Phase 2: 编写规范

3. **创建功能规范文件**
   
   使用模板创建新的 Spec 文件：
   
   ```
   specs/features/[feature-name].md
   ```
   
   必须包含以下部分：
   - Front Matter (title, version, created, updated, status, author)
   - 概述
   - 用户故事
   - 接口定义 (如有)
   - 组件结构 (如有)
   - 实现要点
   - 测试用例

4. **更新索引**
   - 在 `specs/features/_index.md` 中添加新功能条目
   - 状态设置为 "🔄 开发中"

### Phase 3: 实现功能

5. **按规范实现代码**
   - 严格按照 Spec 文件中定义的接口实现
   - 遵循 `specs/PROJECT.md` 中的代码规范
   - 遵循 `specs/ARCHITECTURE.md` 中的架构约定

6. **实现顺序**
   - 后端 API (如需要)
   - 数据库变更 (如需要)
   - 前端组件
   - 状态管理 (Hook)
   - 样式调整

### Phase 4: 验证与文档

7. **验证实现**
   - 确保所有测试用例通过
   - 检查接口是否符合规范

8. **更新文档**
   - 更新 `specs/features/_index.md` 状态为 "✅ 已实现"
   - 更新 `specs/CHANGELOG.md` 添加变更记录
   - 更新 Spec 文件的 status 为 "implemented"

## 代码生成规则

### 文件命名

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 组件 | PascalCase | `ExportDialog.tsx` |
| Hook | camelCase + use | `useExport.ts` |
| 工具函数 | camelCase | `formatExport.ts` |
| API 路由 | kebab-case | `/api/export-session` |

### 代码结构

**React 组件**

```tsx
import React from 'react';
import { /* TDesign 组件 */ } from 'tdesign-react';

interface [ComponentName]Props {
  // Props 定义
}

export const [ComponentName]: React.FC<[ComponentName]Props> = (props) => {
  // 实现
  return (
    // JSX
  );
};
```

**自定义 Hook**

```typescript
import { useState, useCallback } from 'react';

interface Use[HookName]Return {
  // 返回类型
}

export function use[HookName](): Use[HookName]Return {
  // 状态
  // 方法
  return { /* 返回值 */ };
}
```

**Express API**

```typescript
app.post('/api/[endpoint]', async (req, res) => {
  try {
    const { /* 参数 */ } = req.body;
    // 业务逻辑
    res.json({ /* 响应 */ });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

## 检查清单

在完成功能开发后，确认以下事项：

- [ ] Spec 文件已创建并完整
- [ ] 索引已更新
- [ ] 代码符合项目规范
- [ ] 接口符合 Spec 定义
- [ ] 测试用例已验证
- [ ] CHANGELOG 已更新
- [ ] Spec 状态已更新为 implemented

## 相关文件

- `specs/PROJECT.md` - 项目规范
- `specs/ARCHITECTURE.md` - 架构规范
- `specs/features/_index.md` - 功能索引
- `specs/_templates/feature-template.md` - 功能规范模板
- `specs/CHANGELOG.md` - 变更日志

## 使用示例

**用户请求**: "我想添加一个导出对话记录的功能"

**AI 响应流程**:

1. 询问导出格式需求 (JSON/Markdown/PDF?)
2. 读取现有架构了解数据结构
3. 创建 `specs/features/export.md`
4. 更新功能索引
5. 实现后端 API `/api/sessions/:id/export`
6. 实现前端导出按钮和逻辑
7. 验证功能
8. 更新文档
