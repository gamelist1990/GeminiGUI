import React, { useState, useRef, useEffect } from "react";
import "./Agent.css";
import "../pages/Chat.css"; // Reuse chat styles
import { ChatMessage, AgentTask, Workspace, ChatSession } from "../types";
import { t } from "../utils/i18n";
import { callAI, GeminiOptions } from "../utils/geminiCUI";
import { scanWorkspace, getSuggestions } from "../utils/workspace";
import * as fsPlugin from "@tauri-apps/plugin-fs";
import ChatMessageBubble from "./Chat/ChatMessageBubble";
import { cleanupManager } from "../utils/cleanupManager";

interface AgentProps {
  workspace: Workspace;
  session: ChatSession;
  sessions: ChatSession[];
  currentSessionId: string;
  maxSessionsReached: boolean;
  approvalMode: 'default' | 'auto_edit' | 'yolo';
  responseMode: 'async' | 'stream';
  totalTokens: number;
  customApiKey?: string;
  googleCloudProjectId?: string;
  maxMessagesBeforeCompact: number;
  globalConfig: any;
  settings: any;
  onCreateNewSession: (isAgentMode?: boolean) => Promise<boolean>;
  onSwitchSession: (sessionId: string) => void;
  onSendMessage: (sessionId: string, message: ChatMessage) => void;
  onResendMessage: (newMessage: ChatMessage) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newName: string) => void;
  onCompactSession: (sessionId: string) => void;
  onBack: () => void;
}

export default function Agent({
  workspace,
  session,
  sessions: _sessions,
  currentSessionId,
  maxSessionsReached: _maxSessionsReached,
  approvalMode: _approvalMode,
  responseMode: _responseMode,
  totalTokens,
  customApiKey: _customApiKey,
  googleCloudProjectId: _googleCloudProjectId,
  maxMessagesBeforeCompact: _maxMessagesBeforeCompact,
  globalConfig,
  settings,
  onCreateNewSession: _onCreateNewSession,
  onSwitchSession: _onSwitchSession,
  onSendMessage,
  onResendMessage,
  onDeleteSession: _onDeleteSession,
  onRenameSession: _onRenameSession,
  onCompactSession: _onCompactSession,
  onBack,
}: AgentProps) {
  const [inputValue, setInputValue] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Command and file suggestions state
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [workspaceSuggestions, setWorkspaceSuggestions] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const [geminiPath, setGeminiPath] = useState<string | undefined>();

  // Load geminiPath from global config
  useEffect(() => {
    const loadGeminiPath = async () => {
      try {
        const config = await globalConfig.loadConfig();
        const loadedGeminiPath = config?.geminiPath;
        setGeminiPath(loadedGeminiPath);
      } catch (error) {
        console.error("Failed to load geminiPath from global config:", error);
        setGeminiPath(undefined);
      }
    };

    if (globalConfig) {
      loadGeminiPath();
    }
  }, [globalConfig]);

  // Scan workspace for files and folders
  useEffect(() => {
    if (workspace?.path) {
      // Debounce the scan to avoid excessive operations
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
      }

      scanDebounceRef.current = setTimeout(async () => {
        try {
          const items = await scanWorkspace(workspace.path);
          const suggestions = getSuggestions(items);
          setWorkspaceSuggestions(suggestions);
        } catch (error) {
          console.error("[Agent] Workspace scan failed:", error);
          setWorkspaceSuggestions([]);
        }
      }, 500);
    }

    return () => {
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = null;
      }
    };
  }, [workspace?.path]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, tasks]);

  // Update suggestions based on input
  useEffect(() => {
    const text = inputValue.substring(0, cursorPosition);
    const lastWord = text.split(/\s/).pop() || "";

    // Command suggestions
    if (lastWord.startsWith("/")) {
      const query = lastWord.substring(1).toLowerCase();
      const commands = ["compact", "improve", "init"];
      const filtered = commands.filter((cmd) => cmd.startsWith(query));
      setCommandSuggestions(filtered);
      setShowCommandSuggestions(filtered.length > 0);
      setShowFileSuggestions(false);
    }
    // File suggestions
    else if (lastWord.startsWith("#")) {
      const query = lastWord.substring(1).toLowerCase();
      const filtered = workspaceSuggestions.filter((suggestion) => {
        const suggestionWithoutHash = suggestion.substring(1).toLowerCase();
        return suggestionWithoutHash.includes(query);
      });
      setFileSuggestions(filtered);
      setShowFileSuggestions(filtered.length > 0);
      setShowCommandSuggestions(false);
    } else {
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);
    }
  }, [inputValue, cursorPosition, workspaceSuggestions]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setCursorPosition(e.target.selectionStart || 0);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  };

  // Parse task list from AI response
  const parseTasksFromResponse = (content: string): AgentTask[] => {
    const taskRegex = /^[-*]\s*\[([x\s])\]\s*(.+)$/gim;
    const parsedTasks: AgentTask[] = [];
    let match;

    while ((match = taskRegex.exec(content)) !== null) {
      const isCompleted = match[1].toLowerCase() === 'x';
      const description = match[2].trim();
      
      parsedTasks.push({
        id: Date.now().toString() + Math.random(),
        description,
        status: isCompleted ? 'completed' : 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return parsedTasks;
  };

  // Execute autonomous agent loop
  const executeAgentLoop = async (userRequest: string) => {
    setIsThinking(true);
    setThinkingMessage(t("chat.agent.planningTasks"));

    // Store the task plan message ID so we can update it
    const taskPlanMessageId = `task-plan-${Date.now()}`;

    try {
      // Create initial task plan message that will be updated by AI
      const taskListMessage: ChatMessage = {
        id: taskPlanMessageId,
        role: 'assistant',
        content: `📋 **Task Plan Created:**\n\nAnalyzing request and creating task plan...`,
        timestamp: new Date(),
        editable: true,
      };
      onSendMessage(currentSessionId, taskListMessage);

      // Build autonomous agent prompt with tool instructions
      const autonomousPrompt = `You are an autonomous AI agent in Agent Mode. The user has requested:

"${userRequest}"

**Your Mission:**
Work autonomously to complete this task. You have full authority to:
1. Create and manage your task plan
2. Use file operations and other tools as needed
3. Make decisions without asking for approval
4. Communicate progress to the user

**Available Tools:**
You have access to these Agent-specific communication tools:
- **update_task_progress**: Update your task plan to show current progress. Use markdown checklist format:
  - [ ] for pending tasks
  - [x] for completed tasks
  Include a progress summary at the top.

- **send_user_message**: Send important updates to the user:
  - "info" for progress updates
  - "success" for completion
  - "warning" for issues
  - "error" for failures

**Workflow:**
1. IMMEDIATELY use update_task_progress to create your initial task plan
2. Execute tasks using available file operation tools
3. Use update_task_progress frequently to keep the user informed
4. Use send_user_message for important milestones or issues
5. When complete, use send_user_message with type "success" to report final results

**Important:**
- Work independently - don't ask for approval
- Use tools proactively
- Update progress frequently
- Be specific in your updates

Begin now by creating your task plan with update_task_progress.`;

      // Send the autonomous prompt (hidden from user)
      const agentMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: autonomousPrompt,
        timestamp: new Date(),
        hidden: true,
      };
      onSendMessage(currentSessionId, agentMessage);

      // Setup Agent tool callbacks
      const agentCallbacks = {
        onUpdateTaskProgress: (markdownContent: string) => {
          console.log('[Agent] Updating task progress:', markdownContent.substring(0, 100));
          // Update the existing task plan message
          const updatedMessage: ChatMessage = {
            id: taskPlanMessageId,
            role: 'assistant',
            content: `📋 **Task Plan:**\n\n${markdownContent}`,
            timestamp: new Date(),
            editable: true,
          };
          // Use resend to update the existing message
          onResendMessage(updatedMessage);
          
          // Parse and update tasks in the sidebar
          const parsedTasks = parseTasksFromResponse(markdownContent);
          if (parsedTasks.length > 0) {
            setTasks(parsedTasks);
          }
        },
        onSendUserMessage: (message: string, messageType: 'info' | 'success' | 'warning' | 'error') => {
          console.log('[Agent] Sending user message:', messageType, message.substring(0, 100));
          const icon = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
          }[messageType];
          
          const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `${icon} ${message}`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, userMessage);
        }
      };

      // Pass agentCallbacks through settings/options
      // We need to modify the callAI flow to accept agentCallbacks
      // For now, we'll store them globally and access in executeModernTool
      (window as any).__agentCallbacks = agentCallbacks;
      (window as any).__agentSessionId = currentSessionId; // Store session ID for Rust commands

      const agentOptions: GeminiOptions = {
        approvalMode: 'yolo', // Full autonomy
        includes: ['codebase'],
        enabledTools: [
          // Always enable Agent tools
          'update_task_progress', 
          'send_user_message',
          // Add user-configured tools if any
          ...(settings.enabledTools && settings.enabledTools.length > 0 
            ? settings.enabledTools 
            : [])
        ],
        workspaceId: workspace.id,
        sessionId: currentSessionId,
      };

      // Execute the agent with streaming to see progress
      const agentResponse = await callAI(
        autonomousPrompt,
        workspace.path,
        agentOptions,
        {
          ...settings,
          ...globalConfig,
          responseMode: 'stream'
        },
        (chunk: any) => {
          // Update thinking message with chunk
          if (chunk && chunk.type === 'text' && chunk.content) {
            const text = String(chunk.content);
            setThinkingMessage(text.substring(0, 100) + (text.length > 100 ? '...' : ''));
          }
        }
      );

      // Clear agent callbacks
      delete (window as any).__agentCallbacks;

      // AI should have sent completion message via send_user_message tool
      // If not, add a fallback success message
      if (agentResponse.response) {
        const completionMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🎉 **Agent Task Complete**\n\n${agentResponse.response}`,
          timestamp: new Date(),
          editable: true,
          stats: agentResponse.stats,
        };
        onSendMessage(currentSessionId, completionMessage);
      }

    } catch (error: any) {
      console.error('[Agent] Execution failed:', error);
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Agent execution encountered an error: ${error.message || 'Unknown error'}`,
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, errorMessage);
    } finally {
      setIsThinking(false);
      setThinkingMessage("");
      // Clear agent callbacks and session ID if still set
      delete (window as any).__agentCallbacks;
      delete (window as any).__agentSessionId;
    }
  };

  // Process commands (similar to regular chat)
  const processCommand = async (command: string, args: string) => {
    if (command === "compact") {
      // Simply delegate to the compact session handler
      try {
        await _onCompactSession(currentSessionId);
        
        // Cleanup tools after compact
        try {
          await cleanupManager.cleanupSession(currentSessionId, workspace.id);
          console.log(`[Agent] Cleaned up tools after /compact`);
        } catch (cleanupError) {
          console.warn('[Agent] Failed to cleanup after /compact:', cleanupError);
        }

        const successMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.compactCompleted"),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, successMessage);
      } catch (error) {
        console.error("[Agent] Error compacting conversation:", error);
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.compactCommandFailed").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === "init") {
      setIsThinking(true);
      setThinkingMessage(t("chat.errors.initGenerating"));

      try {
        const geminiFilePath = `${workspace.path}/Gemini.md`;
        const hadExistingGemini = await fsPlugin.exists(geminiFilePath);

        let existingGeminiContent = "";
        if (hadExistingGemini) {
          try {
            existingGeminiContent = await fsPlugin.readTextFile(geminiFilePath);
          } catch (readError) {
            console.warn("[Agent] Failed to read existing Gemini.md:", readError);
          }
        }

        const basePrompt = `You are a project analyzer. Analyze this workspace comprehensively and deliver a detailed Gemini.md file.\n\n## Workspace Exploration\n- Use the available tools (for example, glob and read_file) to inspect directories and gather the information you need.\n- Verify important files and configuration by actually reading them.\n\n## Documentation Requirements\nProvide a complete analysis covering:\n\n### Project Overview\n- Project name and purpose\n- Technology stack and frameworks used\n- Target platform and environment\n\n### Architecture & Structure\n- Overall architecture and design patterns\n- Key components and their responsibilities\n- File organization and directory structure\n- Configuration files and their purposes\n\n### Features & Functionality\n- Complete list of implemented features\n- Available APIs and their usage\n- User interface components and workflows\n- Data models and storage solutions\n\n### Technical Details\n- Build system and deployment process\n- Dependencies and external libraries\n- Development tools and scripts\n- Security considerations and authentication\n\n### Code Quality & Standards\n- Coding conventions and style guidelines\n- Testing approach and coverage\n- Documentation standards\n- Performance considerations and optimisations\n\n### Development Workflow\n- Setup and installation instructions\n- Development environment requirements\n- Build and run commands\n- Contribution guidelines\n\n## Output Expectations\n- Return the full Gemini.md content in Markdown.\n- Ensure the result can replace the Gemini.md file entirely.\n- Highlight anything the next developer or AI assistant must know to work effectively.`;

        const normalizedExistingContent = existingGeminiContent
          .replace(/\r/g, "")
          .trim();
        let initPrompt = "";

        if (hadExistingGemini) {
          initPrompt = `${basePrompt}\n\nAn existing Gemini.md file is already present. Review the current content enclosed between <current_gemini_md> markers, then update it to reflect the latest project state. Preserve useful insights, expand missing sections, and correct any outdated information. Produce a full replacement for Gemini.md.\n\n<current_gemini_md>\n${normalizedExistingContent || "(The file is currently empty.)"}\n</current_gemini_md>`;
        } else {
          initPrompt = `${basePrompt}\n\nNo Gemini.md file exists yet. Explore the workspace with the available tools and create a comprehensive Gemini.md from scratch.`;
        }

        const initResponse = await callAI(
          initPrompt,
          workspace.path,
          {
            approvalMode: "yolo",
            model: "gemini-2.5-flash",
            customApiKey: _customApiKey,
            includeDirectories: ["."],
            enabledTools: settings.enabledTools && settings.enabledTools.length > 0 ? settings.enabledTools : undefined,
            workspaceId: workspace.id,
            sessionId: currentSessionId,
          },
          {
            enableOpenAI: settings.enableOpenAI,
            openAIApiKey: settings.openAIApiKey,
            openAIBaseURL: settings.openAIBaseURL,
            openAIModel: settings.openAIModel,
            responseMode: "async",
            googleCloudProjectId: _googleCloudProjectId,
            geminiPath: geminiPath,
          }
        );

        setIsThinking(false);
        
        // Cleanup tools after init
        try {
          await cleanupManager.cleanupSession(currentSessionId, workspace.id);
          console.log(`[Agent] Cleaned up tools after /init`);
        } catch (cleanupError) {
          console.warn('[Agent] Failed to cleanup after /init:', cleanupError);
        }

        const fileExists = await fsPlugin.exists(geminiFilePath);
        const fileStats = initResponse.stats?.files;
        const hasFileChanges = fileStats
          ? fileStats.totalLinesAdded > 0 || fileStats.totalLinesRemoved > 0
          : false;

        if (fileExists && hasFileChanges) {
          const successMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "system",
            content: hadExistingGemini
              ? `✅ Gemini.mdを更新しました。#file:Gemini.md`
              : `✅ Gemini.mdが正常に作成されました。#file:Gemini.md`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, successMessage);
        } else {
          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "assistant",
            content: t("chat.errors.initFailed"),
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, errorMessage);
        }
      } catch (error) {
        setIsThinking(false);
        console.error("[Agent] Error creating Gemini.md:", error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.initFailedWithError").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === "improve") {
      if (!args.trim()) {
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.improveNoText"),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
        return;
      }

      setIsThinking(true);
      setThinkingMessage(t("chat.errors.improveProcessing"));

      try {
        const improvementPrompt = `あなたはプロンプトエンジニアリングの専門家です。以下のユーザーメッセージを、AIが理解しやすく、より具体的で高品質な表現に改善してください。

# 改善の指針
1. **明確性**: 曖昧な表現を具体的にする
2. **構造化**: 複雑な要求は箇条書きやセクション分けする
3. **文脈**: 必要な背景情報を追加する
4. **目的**: 何を達成したいのか明確にする
5. **制約**: 重要な制約条件があれば明示する
6. **出力形式**: 期待する回答の形式を指定する
7. **例示**: 必要に応じて具体例を追加する

# 改善例
悪い例: 「このコード説明して」
良い例: 「以下のTypeScriptコードについて、機能、使用されているデザインパターン、潜在的な問題点を説明してください。特にエラーハンドリングとパフォーマンスの観点から分析をお願いします。」

# 元のメッセージ
${args}

# 改善後のメッセージ
改善したメッセージのみを出力してください。説明や前置きは不要です:`;

        const improvedResponse = await callAI(
          improvementPrompt,
          workspace.path,
          {
            approvalMode: "yolo",
            model: "gemini-2.5-flash",
            customApiKey: _customApiKey,
            enabledTools: settings.enabledTools && settings.enabledTools.length > 0 ? settings.enabledTools : undefined,
            workspaceId: workspace.id,
            sessionId: currentSessionId,
          },
          {
            enableOpenAI: settings.enableOpenAI,
            openAIApiKey: settings.openAIApiKey,
            openAIBaseURL: settings.openAIBaseURL,
            openAIModel: settings.openAIModel,
            responseMode: "async",
            googleCloudProjectId: _googleCloudProjectId,
            geminiPath: geminiPath,
          }
        );

        setIsThinking(false);
        
        // Cleanup tools after improve
        try {
          await cleanupManager.cleanupSession(currentSessionId, workspace.id);
          console.log(`[Agent] Cleaned up tools after /improve`);
        } catch (cleanupError) {
          console.warn('[Agent] Failed to cleanup after /improve:', cleanupError);
        }

        const improvedText = improvedResponse.response.trim();
        setInputValue(improvedText);

        // Focus and adjust textarea height
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.focus();
            textarea.style.height = "auto";
            const scrollHeight = textarea.scrollHeight;
            textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
            textarea.setSelectionRange(improvedText.length, improvedText.length);
          }
        }, 100);
      } catch (error) {
        setIsThinking(false);
        console.error("[Agent] Error improving message:", error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.improveCommandFailed").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === "clear") {
      // Note: Clear command just shows a message for now
      // Full clear functionality would require session reset which is complex
      const clearMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: t("chat.errors.clearNotImplemented"),
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, clearMessage);
    } else if (command === "help") {
      const helpMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: `🤖 **Agent コマンドヘルプ**

**利用可能なコマンド:**
• \`/compact\` - 会話履歴を要約して圧縮（トークン節約）
• \`/clear\` - チャットをクリア（システムメッセージは保持）
• \`/help\` - このヘルプを表示
• \`/init\` - ワークスペースのGemini.mdを生成/更新
• \`/improve\` - メッセージを改善して入力欄にセット

**Agent の特徴:**
• 自動タスク実行 - ユーザーのリクエストを自律的に処理
• ツール使用 - ファイル操作、コード実行などのツールを活用
• タスク管理 - 複雑な作業を小さなステップに分解

通常のメッセージを送信すると、Agent が自動的にタスクを分析して実行します。`,
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, helpMessage);
    } else {
      const unknownCommandMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: `❓ 未知のコマンド: \`/${command}\`

利用可能なコマンドを確認するには \`/help\` と入力してください。`,
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, unknownCommandMessage);
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isThinking) return;

    // Check if it's a command
    const trimmedInput = inputValue.trim();
    if (trimmedInput.startsWith("/") || trimmedInput.startsWith("#")) {
      const parts = trimmedInput.substring(1).split(" ");
      const command = parts[0];
      const args = parts.slice(1).join(" ");

      processCommand(command, args);
      setInputValue("");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      tokenUsage: Math.ceil(inputValue.trim().length / 4),
    };

    onSendMessage(currentSessionId, userMessage);
    setInputValue("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Start autonomous execution
    executeAgentLoop(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
    // Handle suggestion selection with Enter/Tab
    if ((e.key === 'Enter' || e.key === 'Tab') && (showCommandSuggestions || showFileSuggestions)) {
      e.preventDefault();
      const suggestions = showCommandSuggestions ? commandSuggestions : fileSuggestions;
      if (suggestions.length > 0) {
        const suggestion = showCommandSuggestions ? suggestions[0] : fileSuggestions[0];
        handleSelectSuggestion(suggestion, showCommandSuggestions ? "command" : "file");
      }
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: string, type: "command" | "file") => {
    if (!textareaRef.current) return;

    const text = inputValue.substring(0, cursorPosition);
    const lastWordStart = text.lastIndexOf(type === "command" ? "/" : "#");

    if (lastWordStart !== -1) {
      const before = inputValue.substring(0, lastWordStart);
      const after = inputValue.substring(cursorPosition);
      
      // For commands, add the / prefix. For files, suggestion already has # prefix
      const completeSuggestion = type === "command" ? `/${suggestion}` : suggestion;
      const newValue = before + completeSuggestion + " " + after;

      setInputValue(newValue);
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);

      // Set cursor position after the inserted suggestion
      setTimeout(() => {
        const newCursorPos = lastWordStart + completeSuggestion.length + 1; // +1 for space
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current?.focus();
      }, 0);
    }
  };

  return (
    <div className="agent-page">
      <div className="agent-header">
        <div className="agent-header-left">
          <button className="back-button secondary" onClick={onBack}>
            ← {t("workspace.title")}
          </button>
          <div className="agent-badge">
            🤖 {t("chat.agent.title")}
          </div>
          <h2 style={{ margin: 0, fontSize: '16px' }}>
            {workspace.name}
          </h2>
        </div>
        <div className="chat-stats">
          <div className="stat">
            <span className="stat-label">{t("chat.tokenUsage")}</span>
            <span className="stat-value">{totalTokens.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="agent-container">
        <div className="agent-main">
          <div className="chat-messages">
            {session?.messages
              .filter(msg => !msg.hidden)
              .map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  workspace={workspace}
                  onResendMessage={message.role === 'user' ? async (newMessage) => {
                    // Call resend to update the session history
                    onResendMessage(newMessage);
                    
                    // If it's a user message, re-execute the agent loop
                    if (newMessage.role === 'user' && newMessage.content.trim()) {
                      await executeAgentLoop(newMessage.content.trim());
                    }
                  } : undefined}
                />
              ))}

            {isThinking && (
              <div className="agent-thinking-indicator">
                <div className="agent-thinking-spinner"></div>
                <span>{thinkingMessage || t("chat.agent.thinking")}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            {(showCommandSuggestions || showFileSuggestions) && (
              <div className="suggestions-popup">
                {showCommandSuggestions &&
                  commandSuggestions.map((cmd) => (
                    <div
                      key={cmd}
                      className="suggestion-item"
                      data-type="command"
                      onClick={() => handleSelectSuggestion(cmd, "command")}
                    >
                      /{cmd}
                    </div>
                  ))}
                {showFileSuggestions &&
                  fileSuggestions.map((file) => (
                    <div
                      key={file}
                      className="suggestion-item"
                      data-type={file === "codebase" ? "codebase" : "file"}
                      onClick={() => handleSelectSuggestion(file, "file")}
                    >
                      {file}
                    </div>
                  ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              rows={1}
              disabled={isThinking}
            />
            <button
              className="send-button primary"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isThinking}
            >
              ➤
            </button>
          </div>
        </div>

        <div className="agent-sidebar">
          <div className="agent-tasks-header">
            <h3>📋 {t("chat.agent.tasks")}</h3>
          </div>
          <div className="agent-tasks-list">
            {tasks.length === 0 ? (
              <div className="agent-no-tasks">
                {t("chat.agent.noTasks")}
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`agent-task-item ${task.status}`}
                >
                  <div className={`agent-task-status ${task.status}`}>
                    {task.status === 'pending' && t("chat.agent.taskPending")}
                    {task.status === 'in-progress' && t("chat.agent.taskInProgress")}
                    {task.status === 'completed' && t("chat.agent.taskCompleted")}
                    {task.status === 'failed' && t("chat.agent.taskFailed")}
                  </div>
                  <div className="agent-task-description">
                    {task.description}
                  </div>
                  {task.result && (
                    <div className="agent-task-result">
                      {task.result}
                    </div>
                  )}
                  <div className="agent-task-time">
                    {new Date(task.updatedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
