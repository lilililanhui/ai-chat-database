import { useState, useEffect } from 'react';
import { Loading } from 'tdesign-react';
import { X, FileText } from 'lucide-react';
import { ChatMarkdown } from '@tdesign-react/chat';

interface FileViewerProps {
  filePath: string | null;
  onClose: () => void;
  getFileContent: (filePath: string) => Promise<string | null>;
}

export function FileViewer({ filePath, onClose, getFileContent }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (filePath) {
      setLoading(true);
      getFileContent(filePath).then(c => {
        setContent(c || '文件内容为空');
        setLoading(false);
      });
    }
  }, [filePath, getFileContent]);

  if (!filePath) return null;

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 文件信息条 */}
      <div 
        className="h-10 flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{ 
          borderColor: 'var(--td-component-stroke)',
          backgroundColor: 'var(--td-bg-color-container)',
        }}
      >
        <div className="flex items-center gap-2">
          <FileText size={13} style={{ color: 'var(--td-brand-color)' }} />
          <span 
            className="text-[12px] font-medium"
            style={{ color: 'var(--td-text-color-primary)' }}
          >
            {fileName}
          </span>
          <span 
            className="text-[11px] truncate max-w-[400px]"
            style={{ color: 'var(--td-text-color-placeholder)' }}
          >
            {filePath}
          </span>
        </div>
        <button
          className="icon-btn icon-btn-sm"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容区 */}
      <div 
        className="flex-1 overflow-y-auto p-6"
        style={{ backgroundColor: 'var(--td-bg-color-page)' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loading size="medium" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="chat-markdown">
              <ChatMarkdown content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
