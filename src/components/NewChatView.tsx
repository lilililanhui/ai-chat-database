import { Input } from 'tdesign-react';
import { FolderOpenIcon } from 'tdesign-icons-react';
import { Bot, Database, BookOpen, MessageSquare, Sparkles, Search, FileText } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Model, Agent, PermissionMode } from '../types';
import { ICON_MAP } from '../utils/iconMap';

interface NewChatViewProps {
  agents: Agent[];
  models: Model[];
  selectedModel: string;
  newChatAgentId: string;
  newChatCwd: string;
  newChatPermissionMode: PermissionMode;
  onSelectModel: (modelId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSetCwd: (cwd: string) => void;
  onSetPermissionMode: (mode: PermissionMode) => void;
}

export function NewChatView({
  agents,
  newChatAgentId,
  newChatCwd,
  onSelectAgent,
  onSetCwd,
  onSetPermissionMode,
}: NewChatViewProps) {
  const selectedAgent = agents.find(a => a.id === newChatAgentId);

  // 快捷提示
  const quickTips = [
    { icon: <Search size={15} />, text: '知识库中有哪些内容？' },
    { icon: <FileText size={15} />, text: '帮我总结一下某个文档的要点' },
    { icon: <MessageSquare size={15} />, text: '根据知识库回答我的问题' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-full max-w-md">
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <div 
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
            style={{ 
              background: 'linear-gradient(135deg, #7c4dff, #5c2dd5)',
              boxShadow: '0 8px 24px rgba(124, 77, 255, 0.25)'
            }}
          >
            <Sparkles size={26} color="white" />
          </div>
          <h2 
            className="text-xl font-semibold mb-1.5"
            style={{ color: 'var(--td-text-color-primary)' }}
          >
            {APP_CONFIG.name}
          </h2>
          <p 
            className="text-[13px]"
            style={{ color: 'var(--td-text-color-secondary)' }}
          >
            {APP_CONFIG.description}
          </p>
        </div>

        {/* 快捷提示 */}
        <div className="mb-6 space-y-1.5">
          {quickTips.map((tip, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-default transition-all"
              style={{
                backgroundColor: 'var(--td-bg-color-container)',
                border: '1px solid var(--td-component-stroke)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--td-brand-color)';
                e.currentTarget.style.backgroundColor = 'var(--td-brand-color-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--td-component-stroke)';
                e.currentTarget.style.backgroundColor = 'var(--td-bg-color-container)';
              }}
            >
              <span style={{ color: 'var(--td-brand-color)' }}>{tip.icon}</span>
              <span className="text-[13px]" style={{ color: 'var(--td-text-color-secondary)' }}>
                {tip.text}
              </span>
            </div>
          ))}
        </div>
        
        {/* Agent 选择 */}
        <div className="mb-5">
          <label 
            className="block text-[11px] font-semibold uppercase tracking-wide mb-2.5"
            style={{ color: 'var(--td-text-color-placeholder)' }}
          >
            选择 Agent
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto">
            {agents.map(agent => {
              const AgentIcon = ICON_MAP[agent.icon || 'Bot'] || Bot;
              const isSelected = agent.id === newChatAgentId;
              return (
                <div
                  key={agent.id}
                  className="p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    border: `1.5px solid ${isSelected ? (agent.color || 'var(--td-brand-color)') : 'var(--td-component-stroke)'}`,
                    backgroundColor: isSelected ? 'var(--td-brand-color-light)' : 'var(--td-bg-color-container)',
                  }}
                  onClick={() => {
                    onSelectAgent(agent.id);
                    if (agent.permissionMode) {
                      onSetPermissionMode(agent.permissionMode);
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: agent.color || '#7c4dff' }}
                    >
                      <AgentIcon size={16} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div 
                        className="text-[13px] font-medium truncate"
                        style={{ color: 'var(--td-text-color-primary)' }}
                      >
                        {agent.name}
                      </div>
                      {agent.description && (
                        <div 
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--td-text-color-placeholder)' }}
                        >
                          {agent.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 工作目录 */}
        <div className="mb-5">
          <label 
            className="block text-[11px] font-semibold uppercase tracking-wide mb-2"
            style={{ color: 'var(--td-text-color-placeholder)' }}
          >
            工作目录 <span className="normal-case font-normal">(可选)</span>
          </label>
          <Input
            value={newChatCwd}
            onChange={(v) => onSetCwd(v as string)}
            placeholder="例如：/Users/username/projects"
            prefixIcon={<FolderOpenIcon />}
            size="small"
          />
        </div>
        
        {/* 提示文字 */}
        <p 
          className="text-center text-[11px] mt-6"
          style={{ color: 'var(--td-text-color-placeholder)' }}
        >
          请先在左侧「知识库」中索引 Markdown 文件
        </p>
      </div>
    </div>
  );
}
