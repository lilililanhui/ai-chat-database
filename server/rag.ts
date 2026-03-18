import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import crypto from 'crypto';

// ============= 简单向量存储（基于 SQLite） =============
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorDbPath = path.join(__dirname, '..', 'data', 'vectors.db');

// 确保 data 目录存在
const dataDir = path.dirname(vectorDbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const vectorDb = new Database(vectorDbPath);
vectorDb.pragma('journal_mode = WAL');

// 初始化向量存储表
vectorDb.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    title TEXT,
    metadata TEXT,
    content_hash TEXT NOT NULL,
    keywords TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS markdown_files (
    file_path TEXT PRIMARY KEY,
    file_hash TEXT NOT NULL,
    title TEXT,
    last_indexed TEXT NOT NULL,
    chunk_count INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
  CREATE INDEX IF NOT EXISTS idx_documents_keywords ON documents(keywords);
`);

// ============= Markdown 解析 =============

interface MarkdownChunk {
  content: string;
  title: string;
  heading?: string;
  metadata: Record<string, any>;
  filePath: string;
  chunkIndex: number;
}

interface MarkdownFile {
  filePath: string;
  title: string;
  content: string;
  frontMatter: Record<string, any>;
  lastModified: Date;
  size: number;
}

interface SearchResult {
  content: string;
  title: string;
  filePath: string;
  score: number;
  chunkIndex: number;
}

// 计算文件哈希
function fileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 提取关键词（简单的中英文分词）
function extractKeywords(text: string): string[] {
  // 英文单词
  const englishWords = text.toLowerCase()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  // 中文字符（按 2-4 字分割）
  const chineseChars = text.match(/[\u4e00-\u9fff]+/g) || [];
  const chineseNgrams: string[] = [];
  for (const chars of chineseChars) {
    for (let len = 2; len <= Math.min(4, chars.length); len++) {
      for (let i = 0; i <= chars.length - len; i++) {
        chineseNgrams.push(chars.substring(i, i + len));
      }
    }
  }

  return [...new Set([...englishWords, ...chineseNgrams])];
}

// 将 Markdown 分块
function chunkMarkdown(content: string, filePath: string, frontMatter: Record<string, any>): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const title = frontMatter.title || path.basename(filePath, '.md');
  
  // 按标题分割
  const sections = content.split(/^(#{1,3}\s+.+)$/m);
  
  let currentHeading = title;
  let currentContent = '';
  let chunkIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    if (/^#{1,3}\s+/.test(section)) {
      // 保存之前的内容
      if (currentContent.trim()) {
        chunks.push({
          content: currentContent.trim(),
          title,
          heading: currentHeading,
          metadata: frontMatter,
          filePath,
          chunkIndex: chunkIndex++,
        });
      }
      currentHeading = section.replace(/^#{1,3}\s+/, '');
      currentContent = section + '\n';
    } else {
      currentContent += section + '\n';
    }
  }

  // 保存最后的内容
  if (currentContent.trim()) {
    chunks.push({
      content: currentContent.trim(),
      title,
      heading: currentHeading,
      metadata: frontMatter,
      filePath,
      chunkIndex: chunkIndex++,
    });
  }

  // 如果没有分割出任何块，将整个文档作为一个块
  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      content: content.trim(),
      title,
      heading: title,
      metadata: frontMatter,
      filePath,
      chunkIndex: 0,
    });
  }

  // 对过长的块进一步分割（超过 1500 字符）
  const MAX_CHUNK_SIZE = 1500;
  const finalChunks: MarkdownChunk[] = [];
  let finalIndex = 0;

  for (const chunk of chunks) {
    if (chunk.content.length <= MAX_CHUNK_SIZE) {
      finalChunks.push({ ...chunk, chunkIndex: finalIndex++ });
    } else {
      // 按段落分割
      const paragraphs = chunk.content.split(/\n\n+/);
      let subContent = '';
      for (const para of paragraphs) {
        if ((subContent + para).length > MAX_CHUNK_SIZE && subContent) {
          finalChunks.push({
            ...chunk,
            content: subContent.trim(),
            chunkIndex: finalIndex++,
          });
          subContent = para + '\n\n';
        } else {
          subContent += para + '\n\n';
        }
      }
      if (subContent.trim()) {
        finalChunks.push({
          ...chunk,
          content: subContent.trim(),
          chunkIndex: finalIndex++,
        });
      }
    }
  }

  return finalChunks;
}

// ============= 文件扫描 =============

// 获取所有 Markdown 文件
export async function scanMarkdownFiles(directories: string[]): Promise<MarkdownFile[]> {
  const files: MarkdownFile[] = [];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;

    const mdFiles = await glob('**/*.md', {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/data/**'],
    });

    for (const filePath of mdFiles) {
      try {
        const stat = fs.statSync(filePath);
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const { data: frontMatter, content } = matter(rawContent);

        files.push({
          filePath,
          title: frontMatter.title || path.basename(filePath, '.md'),
          content,
          frontMatter,
          lastModified: stat.mtime,
          size: stat.size,
        });
      } catch (e) {
        console.error(`[RAG] Error reading file ${filePath}:`, e);
      }
    }
  }

  return files;
}

// ============= 索引操作 =============

// 索引单个文件
export function indexFile(mdFile: MarkdownFile): number {
  const hash = fileHash(mdFile.content);
  
  // 检查是否已经索引且未变化
  const existing = vectorDb.prepare(
    'SELECT file_hash FROM markdown_files WHERE file_path = ?'
  ).get(mdFile.filePath) as { file_hash: string } | undefined;

  if (existing && existing.file_hash === hash) {
    return 0; // 文件未变化
  }

  // 删除旧的文档块
  vectorDb.prepare('DELETE FROM documents WHERE file_path = ?').run(mdFile.filePath);

  // 分块并索引
  const chunks = chunkMarkdown(mdFile.content, mdFile.filePath, mdFile.frontMatter);
  const now = new Date().toISOString();

  const insertStmt = vectorDb.prepare(`
    INSERT INTO documents (id, file_path, chunk_index, content, title, metadata, content_hash, keywords, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = vectorDb.transaction((chks: MarkdownChunk[]) => {
    for (const chunk of chks) {
      const keywords = extractKeywords(chunk.content).join(' ');
      const id = crypto.randomUUID();
      insertStmt.run(
        id,
        chunk.filePath,
        chunk.chunkIndex,
        chunk.content,
        chunk.title,
        JSON.stringify(chunk.metadata),
        fileHash(chunk.content),
        keywords,
        now,
        now
      );
    }
  });

  insertMany(chunks);

  // 更新文件索引记录
  vectorDb.prepare(`
    INSERT OR REPLACE INTO markdown_files (file_path, file_hash, title, last_indexed, chunk_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(mdFile.filePath, hash, mdFile.title, now, chunks.length);

  console.log(`[RAG] Indexed ${mdFile.filePath}: ${chunks.length} chunks`);
  return chunks.length;
}

// 批量索引
export async function indexAllFiles(directories: string[]): Promise<{ 
  totalFiles: number; 
  totalChunks: number;
  newFiles: number;
  updatedFiles: number;
}> {
  const files = await scanMarkdownFiles(directories);
  let totalChunks = 0;
  let newFiles = 0;
  let updatedFiles = 0;

  for (const file of files) {
    const existing = vectorDb.prepare(
      'SELECT file_hash FROM markdown_files WHERE file_path = ?'
    ).get(file.filePath) as { file_hash: string } | undefined;

    const chunks = indexFile(file);
    if (chunks > 0) {
      totalChunks += chunks;
      if (existing) {
        updatedFiles++;
      } else {
        newFiles++;
      }
    }
  }

  console.log(`[RAG] Indexing complete: ${files.length} files, ${totalChunks} new/updated chunks`);
  return { totalFiles: files.length, totalChunks, newFiles, updatedFiles };
}

// ============= 搜索 =============

// 基于关键词的搜索（TF-IDF 简化版）
export function searchDocuments(query: string, topK: number = 5): SearchResult[] {
  const queryKeywords = extractKeywords(query);
  
  if (queryKeywords.length === 0) {
    // 如果没有提取到关键词，做全文模糊搜索
    const results = vectorDb.prepare(`
      SELECT content, title, file_path, chunk_index 
      FROM documents 
      WHERE content LIKE ? 
      LIMIT ?
    `).all(`%${query}%`, topK) as Array<{
      content: string;
      title: string;
      file_path: string;
      chunk_index: number;
    }>;

    return results.map((r, i) => ({
      content: r.content,
      title: r.title,
      filePath: r.file_path,
      score: 1 - (i * 0.1),
      chunkIndex: r.chunk_index,
    }));
  }

  // 基于关键词匹配搜索
  const allDocs = vectorDb.prepare(
    'SELECT id, content, title, file_path, chunk_index, keywords FROM documents'
  ).all() as Array<{
    id: string;
    content: string;
    title: string;
    file_path: string;
    chunk_index: number;
    keywords: string;
  }>;

  // 计算每个文档的匹配分数
  const scored = allDocs.map(doc => {
    let score = 0;
    const docKeywords = doc.keywords.toLowerCase();
    const docContent = doc.content.toLowerCase();

    for (const keyword of queryKeywords) {
      const kw = keyword.toLowerCase();
      // 关键词在 keywords 字段中的匹配
      if (docKeywords.includes(kw)) {
        score += 2;
      }
      // 内容中的精确匹配
      const matches = (docContent.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      score += matches;
    }

    return {
      content: doc.content,
      title: doc.title,
      filePath: doc.file_path,
      score,
      chunkIndex: doc.chunk_index,
    };
  });

  // 按分数排序并取 top K
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ============= 文件列表 =============

export function getIndexedFiles(): Array<{
  filePath: string;
  title: string;
  lastIndexed: string;
  chunkCount: number;
}> {
  const files = vectorDb.prepare(
    'SELECT file_path, title, last_indexed, chunk_count FROM markdown_files ORDER BY last_indexed DESC'
  ).all() as Array<{
    file_path: string;
    title: string;
    last_indexed: string;
    chunk_count: number;
  }>;

  return files.map(f => ({
    filePath: f.file_path,
    title: f.title,
    lastIndexed: f.last_indexed,
    chunkCount: f.chunk_count,
  }));
}

// 删除文件索引
export function removeFileIndex(filePath: string): boolean {
  vectorDb.prepare('DELETE FROM documents WHERE file_path = ?').run(filePath);
  const result = vectorDb.prepare('DELETE FROM markdown_files WHERE file_path = ?').run(filePath);
  return result.changes > 0;
}

// 获取单个文件内容
export function getFileContent(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    console.error(`[RAG] Error reading file ${filePath}:`, e);
  }
  return null;
}

// 获取索引统计
export function getIndexStats(): {
  totalFiles: number;
  totalChunks: number;
  totalKeywords: number;
} {
  const fileCount = (vectorDb.prepare('SELECT COUNT(*) as count FROM markdown_files').get() as { count: number }).count;
  const chunkCount = (vectorDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count;
  const keywordsResult = vectorDb.prepare('SELECT keywords FROM documents').all() as Array<{ keywords: string }>;
  const allKeywords = new Set<string>();
  for (const r of keywordsResult) {
    r.keywords.split(' ').forEach(k => { if (k) allKeywords.add(k); });
  }

  return {
    totalFiles: fileCount,
    totalChunks: chunkCount,
    totalKeywords: allKeywords.size,
  };
}

// 构建 RAG 上下文
export function buildRAGContext(query: string, topK: number = 5): string {
  const results = searchDocuments(query, topK);
  
  if (results.length === 0) {
    return '';
  }

  let context = '以下是从知识库中检索到的相关内容：\n\n';
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    context += `--- 知识片段 ${i + 1} (来自: ${path.basename(r.filePath)}) ---\n`;
    context += r.content + '\n\n';
  }

  context += '---\n请基于以上知识库内容来回答用户的问题。如果知识库中没有相关信息，请如实告知。\n';
  
  return context;
}
