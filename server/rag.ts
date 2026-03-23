import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ============= Chroma 向量数据库 =============
import { ChromaClient, Collection, DefaultEmbeddingFunction } from 'chromadb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chroma 客户端配置
const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const COLLECTION_NAME = 'markdown_documents';

// Chroma 客户端（延迟初始化）
let chromaClient: ChromaClient | null = null;
let collection: Collection | null = null;
let embeddingFunction: DefaultEmbeddingFunction | null = null;

// 文件索引缓存（用于追踪文件变化，存储在本地 JSON 文件中）
const indexCachePath = path.join(__dirname, '..', 'data', 'index-cache.json');
interface IndexCache {
  files: Record<string, {
    hash: string;
    title: string;
    lastIndexed: string;
    chunkCount: number;
  }>;
}

// 确保 data 目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 加载索引缓存
function loadIndexCache(): IndexCache {
  try {
    if (fs.existsSync(indexCachePath)) {
      return JSON.parse(fs.readFileSync(indexCachePath, 'utf-8'));
    }
  } catch (e) {
    console.error('[RAG] Error loading index cache:', e);
  }
  return { files: {} };
}

// 保存索引缓存
function saveIndexCache(cache: IndexCache): void {
  try {
    fs.writeFileSync(indexCachePath, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[RAG] Error saving index cache:', e);
  }
}

// 初始化 Chroma 客户端
async function initChroma(): Promise<{ client: ChromaClient; collection: Collection }> {
  if (chromaClient && collection) {
    return { client: chromaClient, collection };
  }

  try {
    console.log(`[RAG] Connecting to Chroma at ${CHROMA_HOST}...`);
    chromaClient = new ChromaClient({ path: CHROMA_HOST });
    
    // 使用默认的 Embedding 函数（all-MiniLM-L6-v2）
    embeddingFunction = new DefaultEmbeddingFunction();
    
    // 获取或创建集合
    collection = await chromaClient.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction,
      metadata: { 
        description: 'Markdown documents for RAG',
        'hnsw:space': 'cosine'  // 使用余弦相似度
      }
    });
    
    console.log(`[RAG] Connected to Chroma, collection: ${COLLECTION_NAME}`);
    return { client: chromaClient, collection };
  } catch (error: any) {
    console.error('[RAG] Failed to connect to Chroma:', error?.message);
    throw new Error(`无法连接到 Chroma 服务器 (${CHROMA_HOST})。请确保 Chroma 服务器正在运行: npm run chroma`);
  }
}

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

// 生成文档 ID（基于文件路径和块索引）
function generateDocId(filePath: string, chunkIndex: number): string {
  const hash = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 8);
  return `${hash}_chunk_${chunkIndex}`;
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

// 索引单个文件到 Chroma
export async function indexFile(mdFile: MarkdownFile): Promise<number> {
  const hash = fileHash(mdFile.content);
  const cache = loadIndexCache();
  
  // 检查是否已经索引且未变化
  const existing = cache.files[mdFile.filePath];
  if (existing && existing.hash === hash) {
    return 0; // 文件未变化
  }

  try {
    const { collection } = await initChroma();
    
    // 删除旧的文档块（如果存在）
    if (existing) {
      const oldIds = Array.from({ length: existing.chunkCount }, (_, i) => 
        generateDocId(mdFile.filePath, i)
      );
      if (oldIds.length > 0) {
        try {
          await collection.delete({ ids: oldIds });
        } catch (e) {
          // 忽略删除错误（可能文档不存在）
        }
      }
    }

    // 分块并索引
    const chunks = chunkMarkdown(mdFile.content, mdFile.filePath, mdFile.frontMatter);
    
    if (chunks.length === 0) {
      return 0;
    }

    // 准备数据
    const ids = chunks.map(c => generateDocId(mdFile.filePath, c.chunkIndex));
    const documents = chunks.map(c => c.content);
    const metadatas = chunks.map(c => ({
      filePath: c.filePath,
      title: c.title,
      heading: c.heading || c.title,
      chunkIndex: c.chunkIndex,
      frontMatter: JSON.stringify(c.metadata),
    }));

    // 添加到 Chroma
    await collection.add({
      ids,
      documents,
      metadatas,
    });

    // 更新缓存
    cache.files[mdFile.filePath] = {
      hash,
      title: mdFile.title,
      lastIndexed: new Date().toISOString(),
      chunkCount: chunks.length,
    };
    saveIndexCache(cache);

    console.log(`[RAG] Indexed ${mdFile.filePath}: ${chunks.length} chunks`);
    return chunks.length;
  } catch (error: any) {
    console.error(`[RAG] Error indexing file ${mdFile.filePath}:`, error?.message);
    throw error;
  }
}

// 批量索引
export async function indexAllFiles(directories: string[]): Promise<{ 
  totalFiles: number; 
  totalChunks: number;
  newFiles: number;
  updatedFiles: number;
}> {
  const files = await scanMarkdownFiles(directories);
  const cache = loadIndexCache();
  
  let totalChunks = 0;
  let newFiles = 0;
  let updatedFiles = 0;

  for (const file of files) {
    const existing = cache.files[file.filePath];
    
    try {
      const chunks = await indexFile(file);
      if (chunks > 0) {
        totalChunks += chunks;
        if (existing) {
          updatedFiles++;
        } else {
          newFiles++;
        }
      }
    } catch (error: any) {
      console.error(`[RAG] Failed to index ${file.filePath}:`, error?.message);
    }
  }

  console.log(`[RAG] Indexing complete: ${files.length} files, ${totalChunks} new/updated chunks`);
  return { totalFiles: files.length, totalChunks, newFiles, updatedFiles };
}

// ============= 搜索 =============

// 基于语义的向量搜索
export async function searchDocuments(query: string, topK: number = 5): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const { collection } = await initChroma();
    
    // 使用 Chroma 的语义搜索
    const results = await collection.query({
      queryTexts: [query],
      nResults: topK,
    });

    if (!results.documents || !results.documents[0]) {
      return [];
    }

    const searchResults: SearchResult[] = [];
    const documents = results.documents[0];
    const metadatas = results.metadatas?.[0] || [];
    const distances = results.distances?.[0] || [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const metadata = metadatas[i] as Record<string, any> || {};
      const distance = distances[i] || 0;
      
      if (doc) {
        // Chroma 返回的是距离，转换为相似度分数（余弦距离：1 - distance）
        const score = 1 - distance;
        
        searchResults.push({
          content: doc,
          title: metadata.title || '',
          filePath: metadata.filePath || '',
          score,
          chunkIndex: metadata.chunkIndex || 0,
        });
      }
    }

    return searchResults;
  } catch (error: any) {
    console.error('[RAG] Search error:', error?.message);
    
    // 如果 Chroma 服务不可用，返回空结果并提示
    if (error?.message?.includes('fetch failed') || error?.message?.includes('ECONNREFUSED')) {
      console.error('[RAG] Chroma server is not available. Please start it with: npm run chroma');
    }
    
    return [];
  }
}

// ============= 文件列表 =============

export function getIndexedFiles(): Array<{
  filePath: string;
  title: string;
  lastIndexed: string;
  chunkCount: number;
}> {
  const cache = loadIndexCache();
  
  return Object.entries(cache.files)
    .map(([filePath, info]) => ({
      filePath,
      title: info.title,
      lastIndexed: info.lastIndexed,
      chunkCount: info.chunkCount,
    }))
    .sort((a, b) => new Date(b.lastIndexed).getTime() - new Date(a.lastIndexed).getTime());
}

// 删除文件索引
export async function removeFileIndex(filePath: string): Promise<boolean> {
  const cache = loadIndexCache();
  const fileInfo = cache.files[filePath];
  
  if (!fileInfo) {
    return false;
  }

  try {
    const { collection } = await initChroma();
    
    // 删除 Chroma 中的文档
    const ids = Array.from({ length: fileInfo.chunkCount }, (_, i) => 
      generateDocId(filePath, i)
    );
    
    if (ids.length > 0) {
      await collection.delete({ ids });
    }

    // 从缓存中删除
    delete cache.files[filePath];
    saveIndexCache(cache);
    
    console.log(`[RAG] Removed index for ${filePath}`);
    return true;
  } catch (error: any) {
    console.error(`[RAG] Error removing index for ${filePath}:`, error?.message);
    return false;
  }
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
export async function getIndexStats(): Promise<{
  totalFiles: number;
  totalChunks: number;
  chromaStatus: 'connected' | 'disconnected';
}> {
  const cache = loadIndexCache();
  const files = Object.values(cache.files);
  
  const totalFiles = files.length;
  const totalChunks = files.reduce((sum, f) => sum + f.chunkCount, 0);
  
  let chromaStatus: 'connected' | 'disconnected' = 'disconnected';
  
  try {
    const { client } = await initChroma();
    await client.heartbeat();
    chromaStatus = 'connected';
  } catch (e) {
    chromaStatus = 'disconnected';
  }

  return {
    totalFiles,
    totalChunks,
    chromaStatus,
  };
}

// 构建 RAG 上下文
export async function buildRAGContext(query: string, topK: number = 5): Promise<string> {
  const results = await searchDocuments(query, topK);
  
  if (results.length === 0) {
    return '';
  }

  let context = '以下是从知识库中检索到的相关内容：\n\n';
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const scorePercent = (r.score * 100).toFixed(1);
    context += `--- 知识片段 ${i + 1} (来自: ${path.basename(r.filePath)}, 相关度: ${scorePercent}%) ---\n`;
    context += r.content + '\n\n';
  }

  context += '---\n请基于以上知识库内容来回答用户的问题。如果知识库中没有相关信息，请如实告知。\n';
  
  return context;
}

// 检查 Chroma 服务器状态
export async function checkChromaStatus(): Promise<{ 
  available: boolean; 
  message: string;
  host: string;
}> {
  try {
    const { client } = await initChroma();
    const heartbeat = await client.heartbeat();
    return {
      available: true,
      message: `Chroma 服务器运行正常 (heartbeat: ${heartbeat})`,
      host: CHROMA_HOST,
    };
  } catch (error: any) {
    return {
      available: false,
      message: `无法连接到 Chroma 服务器: ${error?.message}`,
      host: CHROMA_HOST,
    };
  }
}

// 重置 Chroma 集合（危险操作）
export async function resetCollection(): Promise<void> {
  try {
    const { client } = await initChroma();
    
    // 删除集合
    await client.deleteCollection({ name: COLLECTION_NAME });
    
    // 重新创建
    embeddingFunction = new DefaultEmbeddingFunction();
    collection = await client.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction,
      metadata: { 
        description: 'Markdown documents for RAG',
        'hnsw:space': 'cosine'
      }
    });
    
    // 清空缓存
    saveIndexCache({ files: {} });
    
    console.log('[RAG] Collection reset successfully');
  } catch (error: any) {
    console.error('[RAG] Error resetting collection:', error?.message);
    throw error;
  }
}
