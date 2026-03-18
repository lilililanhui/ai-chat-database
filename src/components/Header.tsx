import { Button, Tooltip, Tag } from 'tdesign-react';
import { 
  RefreshIcon,
  SunnyIcon,
  MoonIcon,
  ViewListIcon,
  ChevronLeftIcon,
} from 'tdesign-icons-react';
import { Bot, FileText, PanelLeftClose, PanelLeft } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Model, Session, Agent, Theme } from '../types';
import { ICON_MAP } from '../utils/iconMap';

interface HeaderProps {
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  theme: Theme;
  currentSession: Session | undefined;
  currentAgent: Agent | undefined;
  models: Model[];
  viewingFile?: string | null;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onRefreshModels: () => void;
}

export function Header({
  isSettingsPage,
  sidebarOpen,
  theme,
  currentSession,
  currentAgent,
  models,
  viewingFile,
  onToggleSidebar,
  onToggleTheme,
  onRefreshModels,
}: HeaderProps) {
  const formatModelName = (modelId: string) => {
    const model = models.find(m => m.modelId === modelId);
    const name = model?.name || modelId;
    return name
      .replace(/^(Claude|GPT|Gemini|Kimi|DeepSeek|Qwen|GLM)\s*/i, '')
      .replace(/-/g, ' ')
      .trim() || name;
  };

  const getTitle = () => {
    if (viewingFile) {
      return viewingFile.split('/').pop() || '文件预览';
    }
    if (isSettingsPage) return '设置';
    return currentSession?.title || APP_CONFIG.name;
  };

  return (
    <header 
      className="h-12 flex justify-between items-center px-4 flex-shrink-0 border-b"
      style={{ 
        backgroundColor: 'var(--td-bg-color-page)',
        borderColor: 'var(--td-component-stroke)',
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* 侧边栏切换 */}
        <Tooltip content={sidebarOpen ? '收起面板' : '展开面板'}>
          <button
            className="icon-btn"
            onClick={onToggleSidebar}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
        </Tooltip>

        {/* 分隔 */}
        <div 
          className="h-4 w-px"
          style={{ backgroundColor: 'var(--td-component-stroke)' }}
        />

        {/* 标题区域 */}
        {viewingFile ? (
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--td-brand-color)' }} />
            <span 
              className="text-[13px] font-medium truncate max-w-[300px]"
              style={{ color: 'var(--td-text-color-primary)' }}
            >
              {getTitle()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span 
              className="text-[13px] font-medium truncate max-w-[400px]"
              style={{ color: 'var(--td-text-color-primary)' }}
            >
              {getTitle()}
            </span>
            {!isSettingsPage && currentSession && (
              <span 
                className="text-[11px] px-1.5 py-0.5 rounded"
                style={{ 
                  backgroundColor: 'var(--td-bg-color-component)',
                  color: 'var(--td-text-color-placeholder)',
                }}
              >
                {formatModelName(currentSession.model)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip content={theme === 'light' ? '深色模式' : '浅色模式'}>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
          >
            {theme === 'light' ? <MoonIcon style={{ fontSize: '15px' }} /> : <SunnyIcon style={{ fontSize: '15px' }} />}
          </button>
        </Tooltip>
        {!isSettingsPage && !viewingFile && (
          <Tooltip content="刷新模型列表">
            <button
              className="icon-btn"
              onClick={onRefreshModels}
            >
              <RefreshIcon style={{ fontSize: '15px' }} />
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
