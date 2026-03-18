import { useRef, useCallback } from 'react';
import { Select, Tooltip } from 'tdesign-react';
import { ChatSender } from '@tdesign-react/chat';
import { ChevronDownIcon, LockOnIcon, LockOffIcon, EditIcon, TaskIcon } from 'tdesign-icons-react';
import { Model, PermissionMode } from '../types';

interface ChatInputProps {
  inputValue: string;
  selectedModel: string;
  models: Model[];
  isLoading: boolean;
  permissionMode: PermissionMode;
  onSend: (message: string) => void;
  onStop: () => void;
  onChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
}

// 权限模式配置
const PERMISSION_MODE_CONFIG: Record<PermissionMode, { 
  label: string; 
  shortLabel: string;
  icon: React.ReactNode; 
  color: string;
  description: string;
}> = {
  'default': { 
    label: '默认模式', 
    shortLabel: '默认',
    icon: <LockOnIcon />, 
    color: '#7c4dff',
    description: '每次操作都需要确认'
  },
  'acceptEdits': { 
    label: '自动编辑', 
    shortLabel: '自动编辑',
    icon: <EditIcon />, 
    color: '#22c55e',
    description: '自动允许文件编辑操作'
  },
  'plan': { 
    label: '仅规划', 
    shortLabel: '仅规划',
    icon: <TaskIcon />, 
    color: '#f59e0b',
    description: '只生成计划，不执行操作'
  },
  'bypassPermissions': { 
    label: '全部允许', 
    shortLabel: '全部允许',
    icon: <LockOffIcon />, 
    color: '#ef4444',
    description: '跳过所有权限确认（危险）'
  },
};

export function ChatInput({
  inputValue,
  selectedModel,
  models,
  isLoading,
  permissionMode,
  onSend,
  onStop,
  onChange,
  onModelChange,
  onPermissionModeChange,
}: ChatInputProps) {
  const chatSenderRef = useRef<any>(null);

  const handleSend = useCallback((e: any) => {
    console.log('ChatSender send event:', e);
    const content = e?.detail?.message || e?.detail || e?.message || inputValue;
    if (content && typeof content === 'string' && content.trim() && selectedModel) {
      onSend(content.trim());
    } else if (inputValue.trim() && selectedModel) {
      onSend(inputValue.trim());
    }
  }, [inputValue, selectedModel, onSend]);

  const handleChange = useCallback((e: any) => {
    console.log('ChatSender change event:', e);
    const value = e?.detail ?? e ?? '';
    onChange(typeof value === 'string' ? value : '');
  }, [onChange]);

  const currentModeConfig = PERMISSION_MODE_CONFIG[permissionMode];

  return (
    <div 
      className="px-4 pb-5 pt-3"
      style={{ 
        backgroundColor: 'var(--td-bg-color-page)'
      }}
    >
      <div className="max-w-3xl mx-auto">
        <ChatSender
          ref={chatSenderRef}
          value={inputValue}
          placeholder="输入消息，询问知识库内容..."
          disabled={!selectedModel}
          loading={isLoading}
          autosize={{ minRows: 1, maxRows: 6 }}
          actions={['send']}
          onSend={handleSend}
          onStop={onStop}
          onChange={handleChange}
        >
          {/* 模型选择器和权限模式选择器放在 footer-prefix 插槽 */}
          <div slot="footer-prefix" className="flex items-center gap-2">
            {/* 模型选择器 */}
            <Select
              value={selectedModel}
              onChange={(value) => onModelChange(value as string)}
              placeholder="选择模型"
              size="small"
              style={{ width: 180 }}
              filterable
              borderless
              suffixIcon={<ChevronDownIcon />}
            >
              {models.map(model => (
                <Select.Option key={model.modelId} value={model.modelId} label={model.name} />
              ))}
            </Select>
            
            {/* 分隔线 */}
            <div 
              className="h-3.5 w-px"
              style={{ backgroundColor: 'var(--td-component-stroke)' }}
            />
            
            {/* 权限模式选择器 */}
            <Tooltip content={currentModeConfig.description} placement="top">
              <Select
                value={permissionMode}
                onChange={(value) => onPermissionModeChange(value as PermissionMode)}
                size="small"
                style={{ width: 105 }}
                borderless
                suffixIcon={<ChevronDownIcon />}
                prefixIcon={
                  <span style={{ color: currentModeConfig.color }}>
                    {currentModeConfig.icon}
                  </span>
                }
                popupProps={{
                  overlayInnerStyle: { width: 140 }
                }}
              >
                {(Object.keys(PERMISSION_MODE_CONFIG) as PermissionMode[]).map(mode => {
                  const config = PERMISSION_MODE_CONFIG[mode];
                  return (
                    <Select.Option 
                      key={mode} 
                      value={mode} 
                      label={config.shortLabel}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: config.color }}>{config.icon}</span>
                        <span>{config.shortLabel}</span>
                      </div>
                    </Select.Option>
                  );
                })}
              </Select>
            </Tooltip>
          </div>
        </ChatSender>
        
        {/* 底部提示 */}
        <p 
          className="text-center text-[11px] mt-2"
          style={{ color: 'var(--td-text-color-placeholder)' }}
        >
          AI 回复基于知识库内容，可能存在不准确之处
        </p>
      </div>
    </div>
  );
}
