---
title: RAG 知识库规范
version: 1.0.0
created: 2026-03-22
updated: 2026-03-22
status: implemented
author: lilanhui
---

# RAG 知识库规范

## 概述

提供本地 Markdown 文件的索引和检索功能，通过 RAG（检索增强生成）技术增强 AI 回答的上下文相关性。

## 用户故事

- 作为用户，我希望能够导入本地 Markdown 文件作为知识库，以便 AI 能够基于这些内容回答问题
- 作为用户，我希望能够查看已索引的文件列表，以便了解知识库的内容范围
- 作为用户，我希望能够删除不需要的文件索引，以便保持知识库的整洁
- 作为用户，我希望 AI 回答问题时能够引用相关的知识库内容

## 核心流程

### 索引流程

```
用户选择目录
      │
      ↓
递归扫描 .md 文件
      │
      ↓
解析每个文件
      │
      ├─→ 提取 Front Matter 元数据
      │        │
      │        ↓
      │   存储为 metadata JSON
      │
      └─→ 按标题分块
               │
               ↓
         对每个块:
         ├─→ 提取关键词 (中文+英文)
         └─→ 存储到 documents 表
```

### 检索流程

```
用户发送消息
      │
      ↓
提取查询关键词
      │
      ↓
在 documents 表中匹配
      │
      ↓
计算相似度得分
      │
      ↓
返回 Top-K 结果
      │
      ↓
注入到系统提示词
      │
      ↓
发送给 Agent SDK
```

## 接口定义

### POST /api/rag/index

索引指定目录的 Markdown 文件。

**请求体**

```typescript
interface IndexRequest {
  directory: string;  // 目录的绝对路径
}
```

**响应**

```typescript
interface IndexResponse {
  success: boolean;
  filesProcessed: number;   // 处理的文件数
  chunksCreated: number;    // 创建的文档块数
  errors?: string[];        // 处理失败的文件 (可选)
}
```

### GET /api/rag/search

搜索知识库。

**查询参数**

```typescript
interface SearchQuery {
  q: string;       // 查询字符串
  limit?: number;  // 最大返回数量，默认 5
}
```

**响应**

```typescript
interface SearchResponse {
  results: Array<{
    id: string;
    path: string;      // 文件路径
    title: string;     // 文档块标题
    content: string;   // 文档块内容
    score: number;     // 相似度得分 (0-1)
    metadata?: {       // Front Matter 数据
      [key: string]: unknown;
    };
  }>;
}
```

### GET /api/rag/files

获取已索引的文件列表。

**响应**

```typescript
interface FilesResponse {
  files: Array<{
    path: string;         // 文件路径
    chunksCount: number;  // 文档块数量
    indexedAt: string;    // 索引时间
  }>;
}
```

### GET /api/rag/stats

获取知识库统计信息。

**响应**

```typescript
interface StatsResponse {
  totalFiles: number;     // 总文件数
  totalChunks: number;    // 总文档块数
  lastIndexedAt: string;  // 最后索引时间
}
```

### DELETE /api/rag/files/:path

删除指定文件的索引。

**参数**

- `path`: URL 编码的文件路径

**响应**

```typescript
interface DeleteResponse {
  success: boolean;
  deletedChunks: number;  // 删除的文档块数
}
```

## 算法说明

### 文档分块策略

```typescript
function splitDocument(content: string, maxChunkSize: number = 2000): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = content.split(/(?=^#{2,3}\s)/m);  // 按 ## 或 ### 分割
  
  for (const section of sections) {
    if (section.length <= maxChunkSize) {
      chunks.push(createChunk(section));
    } else {
      // 大段落按段落分割
      const paragraphs = section.split(/\n\n+/);
      let currentChunk = '';
      
      for (const para of paragraphs) {
        if (currentChunk.length + para.length > maxChunkSize) {
          if (currentChunk) chunks.push(createChunk(currentChunk));
          currentChunk = para;
        } else {
          currentChunk += '\n\n' + para;
        }
      }
      
      if (currentChunk) chunks.push(createChunk(currentChunk));
    }
  }
  
  return chunks;
}
```

### 关键词提取

```typescript
function extractKeywords(text: string): string[] {
  const keywords: Set<string> = new Set();
  
  // 1. 提取英文单词 (3+ 字符)
  const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];
  englishWords.forEach(word => keywords.add(word.toLowerCase()));
  
  // 2. 提取中文词组 (简单按 2-4 字分词)
  const chineseText = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= chineseText.length - len; i++) {
      keywords.add(chineseText.substr(i, len));
    }
  }
  
  // 3. 过滤停用词
  const stopwords = ['the', 'is', 'at', 'which', '的', '是', '在', '了'];
  stopwords.forEach(w => keywords.delete(w));
  
  return Array.from(keywords);
}
```

### 相似度计算

使用 Jaccard 相似度系数：

```typescript
function jaccardSimilarity(queryKeywords: string[], docKeywords: string[]): number {
  const setA = new Set(queryKeywords);
  const setB = new Set(docKeywords);
  
  // 计算交集大小
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  
  // 计算并集大小
  const union = setA.size + setB.size - intersection;
  
  return union === 0 ? 0 : intersection / union;
}
```

**说明**: 
- Jaccard 系数范围是 [0, 1]
- 0 表示完全不相似，1 表示完全相同
- 优点：简单高效，适合关键词匹配
- 缺点：不考虑词频和语义

## 数据结构

### documents 表

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,           -- 原始文件路径
  title TEXT,                   -- 文档块标题 (从 ## 或 ### 提取)
  content TEXT NOT NULL,        -- 文档块内容
  keywords TEXT NOT NULL,       -- JSON 数组，关键词列表
  metadata TEXT,                -- JSON，Front Matter 数据
  created_at TEXT NOT NULL      -- ISO 8601 格式时间戳
);

-- 索引
CREATE INDEX idx_documents_path ON documents(path);
```

### 文档块示例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "path": "/Users/user/docs/react-hooks.md",
  "title": "useState 使用方法",
  "content": "## useState 使用方法\n\nuseState 是 React 中最基础的 Hook...",
  "keywords": "[\"usestate\", \"react\", \"hook\", \"状态\", \"管理\"]",
  "metadata": "{\"tags\": [\"react\", \"hooks\"], \"author\": \"张三\"}",
  "created_at": "2026-03-22T10:30:00.000Z"
}
```

## 系统提示词注入

当用户发送消息时，系统会：

1. 提取用户消息的关键词
2. 搜索知识库获取相关文档
3. 将相关文档注入到系统提示词中

```typescript
function buildSystemPrompt(basePrompt: string, ragResults: SearchResult[]): string {
  if (ragResults.length === 0) {
    return basePrompt;
  }
  
  const ragContext = ragResults
    .map((r, i) => `### 参考文档 ${i + 1}\n**来源**: ${r.path}\n\n${r.content}`)
    .join('\n\n---\n\n');
  
  return `${basePrompt}

## 知识库参考

以下是与用户问题相关的知识库内容，请在回答时参考这些信息：

${ragContext}

**注意**: 优先使用知识库中的信息回答问题，如果知识库中没有相关内容，可以使用你的通用知识。`;
}
```

## 实现要点

### 1. 增量索引

- 检测文件修改时间，只重新索引变更的文件
- 删除已不存在文件的索引

### 2. 索引进度反馈

- 大目录索引时通过 SSE 推送进度
- 显示当前处理的文件名和进度百分比

### 3. 错误处理

- 文件读取失败时记录错误，继续处理其他文件
- 返回部分成功的结果和错误列表

## 测试用例

| 用例 | 预期结果 |
|------|----------|
| 索引空目录 | 返回 `filesProcessed: 0` |
| 索引含子目录的目录 | 递归处理所有 .md 文件 |
| 索引非 Markdown 文件 | 自动跳过 |
| 索引大文件 (>10KB) | 正确分块 |
| 搜索存在的关键词 | 返回匹配结果 |
| 搜索不存在的关键词 | 返回空数组 |
| 删除文件索引 | 相关文档块被删除 |

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-03-22 | 初始版本 |
