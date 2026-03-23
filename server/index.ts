import express from "express";
import { query, unstable_v2_createSession, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import * as db from "./db.js";
import * as rag from "./rag.js";

const execAsync = promisify(exec);

// 待处理的权限请求
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

// 权限请求超时时间（5分钟）
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// 缓存可用模型列表
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "claude-sonnet-4";

// 额外的模型列表（始终可用）
const EXTRA_MODELS: Array<{ modelId: string; name: string; description?: string }> = [
  { modelId: "qwen-plus", name: "通义千问 Plus", description: "通义千问增强版" },
  { modelId: "qwen-turbo", name: "通义千问 Turbo", description: "通义千问高速版" },
  { modelId: "qwen-max", name: "通义千问 Max", description: "通义千问旗舰版" },
  { modelId: "qwen-long", name: "通义千问 Long", description: "通义千问长文本版" },
  { modelId: "qwen2.5-72b-instruct", name: "Qwen2.5 72B", description: "通义千问2.5 72B 指令版" },
  { modelId: "qwen2.5-32b-instruct", name: "Qwen2.5 32B", description: "通义千问2.5 32B 指令版" },
  { modelId: "qwen2.5-14b-instruct", name: "Qwen2.5 14B", description: "通义千问2.5 14B 指令版" },
  { modelId: "qwen2.5-7b-instruct", name: "Qwen2.5 7B", description: "通义千问2.5 7B 指令版" },
];

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 检查 API Key 配置状态
app.get("/api/check-login", (req, res) => {
  const apiKey = process.env.CODEBUDDY_API_KEY;
  
  if (apiKey) {
    res.json({
      isLoggedIn: true,
      apiKey: apiKey.length > 12 
        ? apiKey.slice(0, 8) + '****' + apiKey.slice(-4) 
        : '****',
    });
  } else {
    res.json({
      isLoggedIn: false,
    });
  }
});

// 保存 API Key 配置
app.post("/api/save-env-config", (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: '请提供 API Key' });
  }
  
  // 设置环境变量（仅在当前进程有效）
  process.env.CODEBUDDY_API_KEY = apiKey;
  
  // 清除模型缓存，以便重新获取
  cachedModels = [];
  
  res.json({ 
    success: true, 
    message: 'API Key 已保存',
    note: 'API Key 仅在当前服务器进程有效，重启后需要重新设置'
  });
});

// 获取可用模型列表
app.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log("[Models] Creating session to fetch available models...");
      
      try {
        const session = await unstable_v2_createSession({ 
          cwd: process.cwd()
        });
        
        console.log("[Models] Session created, calling getAvailableModels()...");
        const models = await session.getAvailableModels();
        console.log("[Models] Got", models.length, "models from SDK");
        
        if (models && Array.isArray(models)) {
          cachedModels = models;
        }
      } catch (sdkError: any) {
        console.warn("[Models] SDK model fetch failed:", sdkError?.message);
        // SDK 获取失败时使用基础 Claude 模型
        cachedModels = [
          { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
          { modelId: "claude-opus-4", name: "Claude Opus 4" }
        ];
      }
    }
    
    // 合并 SDK 模型和额外模型（去重）
    const existingIds = new Set(cachedModels.map(m => m.modelId));
    const allModels = [
      ...cachedModels,
      ...EXTRA_MODELS.filter(m => !existingIds.has(m.modelId))
    ];
    
    res.json({ 
      models: allModels,
      defaultModel 
    });
  } catch (error: any) {
    console.error("[Models] Error:", error);
    // 兜底：至少返回基础模型 + 千问模型
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" },
        ...EXTRA_MODELS
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

// ============= 会话 API =============

// 获取所有会话（包含消息数量）
app.get("/api/sessions", (req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => {
      const messages = db.getMessagesBySession(session.id);
      return {
        ...session,
        messageCount: messages.length
      };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    console.error("[Sessions] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 获取单个会话及其消息
app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    const messages = db.getMessagesBySession(sessionId);
    
    // 解析 tool_calls JSON
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    
    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    console.error("[Session] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 创建新会话
app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    
    const session = db.createSession({
      id: uuidv4(),
      title,
      model,
      created_at: now,
      updated_at: now
    });
    
    res.json({ session });
  } catch (error: any) {
    console.error("[Create Session] Error:", error);
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

// 更新会话
app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;
    
    const success = db.updateSession(sessionId, { title, model });
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Update Session] Error:", error);
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

// 删除会话
app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Delete Session] Error:", error);
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ============= RAG / 知识库 API =============

// 获取已索引的 Markdown 文件列表
app.get("/api/markdown-files", (req, res) => {
  try {
    const files = rag.getIndexedFiles();
    res.json({ files });
  } catch (error: any) {
    console.error("[RAG] Error getting files:", error);
    res.status(500).json({ error: error?.message || "获取文件列表失败" });
  }
});

// 索引指定目录的 Markdown 文件
app.post("/api/rag/index", async (req, res) => {
  try {
    const { directories } = req.body;
    if (!directories || !Array.isArray(directories) || directories.length === 0) {
      return res.status(400).json({ error: "请提供至少一个目录路径" });
    }

    console.log("[RAG] Indexing directories:", directories);
    const result = await rag.indexAllFiles(directories);
    res.json({ 
      success: true, 
      ...result,
      message: `索引完成: ${result.totalFiles} 个文件, ${result.totalChunks} 个新增/更新的文档块`
    });
  } catch (error: any) {
    console.error("[RAG] Index error:", error);
    res.status(500).json({ error: error?.message || "索引失败" });
  }
});

// 搜索知识库
app.post("/api/rag/search", (req, res) => {
  try {
    const { query: searchQuery, topK = 5 } = req.body;
    if (!searchQuery) {
      return res.status(400).json({ error: "请提供搜索查询" });
    }

    const results = rag.searchDocuments(searchQuery, topK);
    res.json({ results });
  } catch (error: any) {
    console.error("[RAG] Search error:", error);
    res.status(500).json({ error: error?.message || "搜索失败" });
  }
});

// 删除文件索引
app.delete("/api/rag/file", async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "请提供文件路径" });
    }

    const success = await rag.removeFileIndex(filePath);
    res.json({ success });
  } catch (error: any) {
    console.error("[RAG] Delete error:", error);
    res.status(500).json({ error: error?.message || "删除索引失败" });
  }
});

// 获取索引统计
app.get("/api/rag/stats", async (req, res) => {
  try {
    const stats = await rag.getIndexStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[RAG] Stats error:", error);
    res.status(500).json({ error: error?.message || "获取统计失败" });
  }
});

// 获取文件内容
app.get("/api/rag/file-content", (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: "请提供文件路径" });
    }

    const content = rag.getFileContent(filePath);
    if (content === null) {
      return res.status(404).json({ error: "文件不存在" });
    }

    res.json({ content, filePath });
  } catch (error: any) {
    console.error("[RAG] File content error:", error);
    res.status(500).json({ error: error?.message || "获取文件内容失败" });
  }
});

// 检查 Chroma 服务器状态
app.get("/api/rag/chroma-status", async (req, res) => {
  try {
    const status = await rag.checkChromaStatus();
    res.json(status);
  } catch (error: any) {
    console.error("[RAG] Chroma status error:", error);
    res.status(500).json({ 
      available: false, 
      message: error?.message || "检查 Chroma 状态失败",
      host: process.env.CHROMA_HOST || 'http://localhost:8000'
    });
  }
});

// 重置知识库（危险操作）
app.post("/api/rag/reset", async (req, res) => {
  try {
    await rag.resetCollection();
    res.json({ success: true, message: "知识库已重置" });
  } catch (error: any) {
    console.error("[RAG] Reset error:", error);
    res.status(500).json({ error: error?.message || "重置知识库失败" });
  }
});

// ============= 聊天 API =============

// 权限响应 API
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  
  console.log(`[Permission] Response received: requestId=${requestId}, behavior=${behavior}`);
  
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] Request not found: ${requestId}`);
    return res.status(404).json({ error: "权限请求不存在或已超时" });
  }
  
  // 清除请求
  pendingPermissions.delete(requestId);
  
  if (behavior === 'allow') {
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: 'deny',
      message: message || '用户拒绝了此操作'
    });
  }
  
  res.json({ success: true });
});

// 发送消息并获取流式响应
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  
  // 请求日志
  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? '...' : ''}`);
  console.log(`[Chat] CWD: ${cwd || 'default'}`);

  if (!message) {
    console.log(`[Chat] 错误: 消息为空`);
    return res.status(400).json({ error: "消息不能为空" });
  }

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();
  
  if (!session) {
    // 创建新会话
    console.log(`[Chat] 创建新会话`);
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,  // 稍后从 SDK 获取
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] 使用现有会话, SDK Session: ${session.sdk_session_id || 'none'}`);
  }

  const selectedModel = model || session.model;
  
  // 获取 SDK session ID（用于恢复对话）
  const sdkSessionId = session.sdk_session_id;

  // 创建用户消息 ID 和助手消息 ID
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息到数据库
  try {
    db.createMessage({
      id: userMessageId,
      session_id: session.id,
      role: 'user',
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] 用户消息已保存: ${userMessageId}`);
  } catch (dbError: any) {
    console.error(`[Chat] 保存用户消息失败:`, dbError);
    return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
  }

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 默认系统提示词
  const defaultSystemPrompt = "你是一个专业的AI知识库助手，善于基于知识库内容回答用户的问题。请用简洁清晰的方式回答问题。如果知识库中有相关内容，请优先基于知识库内容回答。";
  
  // 构建 RAG 上下文
  const ragContext = await rag.buildRAGContext(message, 5);
  
  // 合并系统提示词和 RAG 上下文
  let finalSystemPrompt = systemPrompt || defaultSystemPrompt;
  if (ragContext) {
    finalSystemPrompt = `${finalSystemPrompt}\n\n${ragContext}`;
    console.log(`[Chat] RAG context injected (${ragContext.length} chars)`);
  }
  
  // 工作目录：优先使用请求中的 cwd，否则使用当前目录
  const workingDir = cwd || process.cwd();

  try {
    console.log(`[Chat] 调用 SDK query...`);
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || 'none'}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || 'default'}`);
    
    // 创建 canUseTool 回调
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      console.log(`[Permission] Tool request: ${toolName}`);
      console.log(`[Permission] Input:`, JSON.stringify(input, null, 2));
      
      // bypassPermissions 模式直接放行
      if (permissionMode === 'bypassPermissions') {
        console.log(`[Permission] Bypassing permissions for ${toolName}`);
        return { behavior: 'allow', updatedInput: input };
      }
      
      // 创建权限请求
      const requestId = uuidv4();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session.id,
        timestamp: Date.now()
      };
      
      // 发送权限请求到前端
      res.write(`data: ${JSON.stringify({ 
        type: "permission_request", 
        ...permissionRequest
      })}\n\n`);
      
      // 创建 Promise 等待用户响应
      return new Promise<PermissionResult>((resolve, reject) => {
        const pending: PendingPermission = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session.id,
          timestamp: Date.now()
        };
        
        pendingPermissions.set(requestId, pending);
        
        // 设置超时
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            console.log(`[Permission] Request timeout: ${requestId}`);
            resolve({
              behavior: 'deny',
              message: '权限请求超时'
            });
          }
        }, PERMISSION_TIMEOUT);
      });
    };
    
    // 使用 Query API 发送消息
    // 如果有 sdk_session_id，使用 resume 恢复对话上下文
    const stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: finalSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})  // 使用 resume 恢复对话
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{ 
      id: string; 
      name: string; 
      input?: Record<string, unknown>;
      status: string; 
      result?: string;
      isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;  // 用于存储 SDK 返回的 session_id

    // 发送会话ID和消息ID
    res.write(`data: ${JSON.stringify({ 
      type: "init", 
      sessionId: session.id, 
      userMessageId, 
      assistantMessageId,
      model: selectedModel 
    })}\n\n`);

    // 当前正在执行的工具 ID（用于匹配 tool_result）
    let currentToolId: string | null = null;

    // 处理流式响应
    for await (const msg of stream) {
      console.log("[Stream] Message type:", msg.type, msg);
      
      // 处理 system 消息，获取 SDK 的 session_id
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        console.log(`[Stream] Got SDK session_id: ${newSdkSessionId}`);
        
        // 保存 SDK session_id 到数据库（如果是新的）
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
          console.log(`[Stream] Saved SDK session_id to database`);
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;

        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolInput = (block as any).input || {};
              console.log(`[Stream] Tool use: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] Tool input:`, JSON.stringify(toolInput, null, 2));
              
              const toolCall = { 
                id: currentToolId, 
                name: block.name, 
                input: toolInput,
                status: "running" 
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ 
                type: "tool", 
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}\n\n`);
            }
          }
        }
      } else if (msg.type === "tool_result") {
        // 处理工具结果（独立的消息类型）
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        
        console.log(`[Stream] Tool result: tool_use_id=${toolId}, is_error=${isError}`);
        console.log(`[Stream] Tool result content type:`, typeof content);
        console.log(`[Stream] Tool result content:`, typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content, null, 2)?.slice(0, 500));
        
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === 'string' 
            ? content 
            : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({ 
            type: "tool_result", 
            toolId: tool.id, 
            content: tool.result,
            isError: isError
          })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        // 完成时确保所有工具都标记为完成
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: "done", duration: msg.duration, cost: msg.cost })}\n\n`);
      }
    }

    // 保存助手消息到数据库
    db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: fullResponse,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题（如果是第一条消息）
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, { 
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    console.log(`[Chat] 请求完成 ✓`);
    res.end();
  } catch (error: any) {
    console.error(`\n[Chat] ========== 错误 ==========`);
    console.error(`[Chat] Error Name:`, error?.name);
    console.error(`[Chat] Error Message:`, error?.message);
    console.error(`[Chat] Error Code:`, error?.code);
    console.error(`[Chat] Error Stack:`, error?.stack);
    console.error(`[Chat] Full Error:`, JSON.stringify(error, null, 2));
    
    const errorMessage = error?.message || "处理请求时发生错误";
    res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
    res.end();
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║     ◉ API 服务器已启动                      ║
║                                            ║
║     地址: http://localhost:${PORT}            ║
║     会话数据库: SQLite (data/chat.db)      ║
║     向量数据库: Chroma (localhost:8000)    ║
║                                            ║
║     提示: 请先启动 Chroma 服务器            ║
║           npm run chroma                   ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
});
