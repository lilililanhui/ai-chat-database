import { useState } from 'react';
import { Button, Tooltip, Input, Loading } from 'tdesign-react';
import { 
  AddIcon, 
  DeleteIcon, 
  SettingIcon, 
  ChatIcon, 
  FolderOpenIcon, 
  RefreshIcon,
} from 'tdesign-icons-react';
import { FileText, Database, MessageSquare, FolderOpen, Settings, Plus, Trash2 } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Session, Agent, SidebarTab, MarkdownFileInfo, RAGStats } from '../types';
import { ICON_MAP } from '../utils/iconMap';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  // 对话操作
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  // 文件列表
  markdownFiles: MarkdownFileInfo[];
  ragStats: RAGStats;
  isIndexing: boolean;
  indexMessage: string;
  onIndexDirectories: (directories: string[]) => void;
  onRemoveFile: (filePath: string) => void;
  onViewFile: (filePath: string) => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  isSettingsPage,
  sidebarOpen,
  agents,
  getAgent,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
  markdownFiles,
  ragStats,
  isIndexing,
  indexMessage,
  onIndexDirectories,
  onRemoveFile,
  onViewFile,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const [indexPath, setIndexPath] = useState('');

  const handleIndex = () => {
    if (indexPath.trim()) {
      onIndexDirectories([indexPath.trim()]);
    }
  };

  const actualTab = isSettingsPage ? 'settings' : activeTab;

  return (
    <div className="flex h-full flex-shrink-0">
      {/* 活动栏 - 最左侧窄图标栏 */}
      <div className="activity-bar">
        {/* Logo */}
        <div className="mb-4 flex items-center justify-center">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ 
              background: 'linear-gradient(135deg, #7c4dff, #5c2dd5)'
            }}
          >
            <Database size={15} color="white" strokeWidth={2.5} />
          </div>
        </div>

        {/* 对话 */}
        <Tooltip content="对话" placement="right">
          <div 
            className={`activity-bar-icon ${actualTab === 'chats' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('chats'); 
              if (isSettingsPage) { onNewChat(); }
            }}
          >
            <MessageSquare size={20} />
          </div>
        </Tooltip>

        {/* 知识库 */}
        <Tooltip content="知识库" placement="right">
          <div 
            className={`activity-bar-icon ${actualTab === 'files' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('files'); 
              if (isSettingsPage) { onNewChat(); }
            }}
          >
            <FolderOpen size={20} />
          </div>
        </Tooltip>

        {/* 弹性间距 */}
        <div className="flex-1" />

        {/* 设置 */}
        <Tooltip content="设置" placement="right">
          <div 
            className={`activity-bar-icon ${actualTab === 'settings' ? 'active' : ''}`}
            onClick={onOpenSettings}
            style={{ marginBottom: 12 }}
          >
            <Settings size={20} />
          </div>
        </Tooltip>
      </div>

      {/* 侧边面板 */}
      <div className={`sidebar-panel ${!sidebarOpen ? 'collapsed' : ''}`}>
        {/* 对话面板 */}
        {actualTab === 'chats' && (
          <>
            <div className="sidebar-panel-header">
              <span>对话</span>
              <Tooltip content="新建对话">
                <button 
                  className="icon-btn icon-btn-sm"
                  onClick={onNewChat}
                >
                  <Plus size={14} />
                </button>
              </Tooltip>
            </div>

            {/* 会话列表 */}
            <div className="flex-1 overflow-y-auto py-1">
              {sessions.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <MessageSquare 
                    size={28} 
                    style={{ color: 'var(--td-text-color-placeholder)', margin: '0 auto' }}
                    strokeWidth={1.5}
                  />
                  <p 
                    className="text-xs mt-3"
                    style={{ color: 'var(--td-text-color-placeholder)' }}
                  >
                    暂无对话
                  </p>
                  <button 
                    className="text-btn text-xs mt-2"
                    onClick={onNewChat}
                  >
                    开始新对话
                  </button>
                </div>
              ) : (
                sessions.map(session => {
                  const isActive = session.id === currentSessionId && !isSettingsPage;
                  return (
                    <div 
                      key={session.id}
                      className={`sidebar-item group ${isActive ? 'active' : ''}`}
                      onClick={() => onSelectSession(session.id)}
                    >
                      <MessageSquare size={14} className="flex-shrink-0" strokeWidth={1.5} />
                      <span className="flex-1 truncate text-[13px]">{session.title}</span>
                      <button
                        className="icon-btn icon-btn-sm icon-btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* 知识库面板 */}
        {actualTab === 'files' && (
          <>
            <div className="sidebar-panel-header">
              <span>知识库</span>
              <div className="flex items-center gap-1">
                <span 
                  className="text-[10px] font-normal normal-case tracking-normal"
                  style={{ color: 'var(--td-text-color-placeholder)' }}
                >
                  {ragStats.totalFiles} 文件 / {ragStats.totalChunks} 块
                </span>
              </div>
            </div>

            {/* 索引目录 */}
            <div className="px-3 pb-3">
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <Input
                    value={indexPath}
                    onChange={(v) => setIndexPath(v as string)}
                    placeholder="目录路径..."
                    size="small"
                    prefixIcon={<FolderOpenIcon style={{ fontSize: '14px' }} />}
                    onEnter={handleIndex}
                  />
                </div>
                <Tooltip content="索引目录">
                  <Button
                    icon={isIndexing ? <Loading size="small" /> : <RefreshIcon />}
                    onClick={handleIndex}
                    size="small"
                    variant="outline"
                    disabled={isIndexing || !indexPath.trim()}
                    style={{ flexShrink: 0 }}
                  />
                </Tooltip>
              </div>
              
              {/* 索引消息 */}
              {indexMessage && (
                <div 
                  className="text-[11px] px-2.5 py-1.5 rounded-md mt-2"
                  style={{ 
                    backgroundColor: 'var(--td-brand-color-light)',
                    color: 'var(--td-brand-color)',
                  }}
                >
                  {indexMessage}
                </div>
              )}
            </div>

            {/* 文件列表 */}
            <div className="flex-1 overflow-y-auto py-1">
              {markdownFiles.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText 
                    size={28} 
                    style={{ color: 'var(--td-text-color-placeholder)', margin: '0 auto' }}
                    strokeWidth={1.5}
                  />
                  <p 
                    className="text-xs mt-3"
                    style={{ color: 'var(--td-text-color-placeholder)' }}
                  >
                    暂无索引文件
                  </p>
                  <p 
                    className="text-[11px] mt-1"
                    style={{ color: 'var(--td-text-color-placeholder)' }}
                  >
                    输入目录路径开始索引
                  </p>
                </div>
              ) : (
                markdownFiles.map(file => (
                  <div
                    key={file.filePath}
                    className="sidebar-item group"
                    onClick={() => onViewFile(file.filePath)}
                  >
                    <FileText 
                      size={14} 
                      className="flex-shrink-0" 
                      style={{ color: 'var(--td-brand-color)' }} 
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <div 
                        className="text-[13px] truncate"
                        style={{ color: 'var(--td-text-color-primary)' }}
                      >
                        {file.title}
                      </div>
                      <div 
                        className="text-[11px] truncate"
                        style={{ color: 'var(--td-text-color-placeholder)' }}
                      >
                        {file.chunkCount} 块 · {file.filePath.split('/').pop()}
                      </div>
                    </div>
                    <button
                      className="icon-btn icon-btn-sm icon-btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(file.filePath);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* 设置面板标题 */}
        {actualTab === 'settings' && (
          <div className="sidebar-panel-header">
            <span>设置</span>
          </div>
        )}
      </div>
    </div>
  );
}
