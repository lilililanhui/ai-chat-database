import { useState, useCallback } from 'react';
import { MarkdownFileInfo, RAGStats } from '../types';

export function useMarkdownFiles() {
  const [files, setFiles] = useState<MarkdownFileInfo[]>([]);
  const [stats, setStats] = useState<RAGStats>({ totalFiles: 0, totalChunks: 0, totalKeywords: 0 });
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState('');

  // 获取已索引文件列表
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/markdown-files');
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to fetch markdown files:', error);
    }
  }, []);

  // 获取索引统计
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/rag/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch RAG stats:', error);
    }
  }, []);

  // 索引目录
  const indexDirectories = useCallback(async (directories: string[]) => {
    setIsIndexing(true);
    setIndexMessage('正在索引...');
    try {
      const res = await fetch('/api/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directories }),
      });
      const data = await res.json();
      if (data.success) {
        setIndexMessage(`索引完成: ${data.totalFiles} 个文件, ${data.totalChunks} 个文档块`);
        await fetchFiles();
        await fetchStats();
      } else {
        setIndexMessage(`索引失败: ${data.error}`);
      }
    } catch (error: any) {
      setIndexMessage(`索引出错: ${error?.message || '未知错误'}`);
    } finally {
      setIsIndexing(false);
      // 3 秒后清除消息
      setTimeout(() => setIndexMessage(''), 5000);
    }
  }, [fetchFiles, fetchStats]);

  // 删除文件索引
  const removeFile = useCallback(async (filePath: string) => {
    try {
      await fetch('/api/rag/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      await fetchFiles();
      await fetchStats();
    } catch (error) {
      console.error('Failed to remove file index:', error);
    }
  }, [fetchFiles, fetchStats]);

  // 获取文件内容
  const getFileContent = useCallback(async (filePath: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/rag/file-content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      return data.content || null;
    } catch (error) {
      console.error('Failed to get file content:', error);
      return null;
    }
  }, []);

  return {
    files,
    stats,
    isIndexing,
    indexMessage,
    fetchFiles,
    fetchStats,
    indexDirectories,
    removeFile,
    getFileContent,
  };
}
