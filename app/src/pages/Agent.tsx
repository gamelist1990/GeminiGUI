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

  // Process commands in Agent mode
  const processCommand = async (command: string, _args: string) => {
    switch (command.toLowerCase()) {
      case 'compact':
        if (!session) return;

        // Compact the session by keeping only system messages
        await _onCompactSession(currentSessionId);

        const compactMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '✅ セッションを圧縮しました。会話履歴が要約され、トークン使用量が最適化されました。',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, compactMessage);
        break;

      case 'clear':
        // Note: Clear command just shows a message for now
        // Full clear functionality would require session reset which is complex
        const clearMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '🧹 チャットクリアコマンドが認識されました。この機能は現在開発中です。',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, clearMessage);
        break;

      case 'help':
        const helpMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🤖 **Agent コマンドヘルプ**

**利用可能なコマンド:**
• \`/compact\` - 会話履歴を要約して圧縮（トークン節約）
• \`/clear\` - チャットをクリア（システムメッセージは保持）
• \`/help\` - このヘルプを表示

**Agent の特徴:**
• 自動タスク実行 - ユーザーのリクエストを自律的に処理
• ツール使用 - ファイル操作、コード実行などのツールを活用
• タスク管理 - 複雑な作業を小さなステップに分解

通常のメッセージを送信すると、Agent が自動的にタスクを分析して実行します。`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, helpMessage);
        break;

      default:
        const unknownCommandMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❓ 未知のコマンド: \`/${command}\`

利用可能なコマンドを確認するには \`/help\` と入力してください。`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, unknownCommandMessage);
        break;
    }
  };

  // Execute autonomous agent loop
  const executeAgentLoop = async (userRequest: string) => {
    setIsThinking(true);
    setThinkingMessage(t("chat.agent.planningTasks"));

    try {
      // Step 1: Ask AI to create a task list
      const planningPrompt = `You are an autonomous AI agent similar to GitHub Copilot Agent. The user has requested: "${userRequest}"

Please create a detailed task list to accomplish this request. Format your response as a markdown checklist with the following format:
- [ ] Task description

Be specific and break down complex tasks into smaller, actionable steps. Think step by step.

After creating the task list, you will autonomously execute each task one by one until all are complete.`;

      const planningMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: planningPrompt,
        timestamp: new Date(),
        hidden: true,
      };
      onSendMessage(currentSessionId, planningMessage);

      const planningOptions: GeminiOptions = {
        approvalMode: 'yolo', // Agent mode requires full autonomy
        includes: ['codebase'],
        workspaceId: workspace.id,
        sessionId: currentSessionId,
      };

      const planningResponse = await callAI(planningPrompt, workspace.path, planningOptions, settings, globalConfig);
      
      // Parse tasks from response
      const initialTasks = parseTasksFromResponse(planningResponse.response);
      
      if (initialTasks.length === 0) {
        // If no tasks found, create a general task
        initialTasks.push({
          id: Date.now().toString(),
          description: userRequest,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setTasks(initialTasks);

      // Add AI's task planning response as a message
      const taskListMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `📋 **Task Plan Created:**\n\n${planningResponse.response}`,
        timestamp: new Date(),
        editable: true,
      };
      onSendMessage(currentSessionId, taskListMessage);

      // Step 2: Execute tasks one by one
      for (let i = 0; i < initialTasks.length; i++) {
        const task = initialTasks[i];
        
        // Update task status to in-progress
        setTasks(prevTasks => 
          prevTasks.map(t => 
            t.id === task.id 
              ? { ...t, status: 'in-progress' as const, updatedAt: new Date() }
              : t
          )
        );

        setThinkingMessage(t("chat.agent.executing"));

        // Execute the task
        const taskPrompt = `Execute the following task autonomously: "${task.description}"

Context: This is task ${i + 1} of ${initialTasks.length} in the overall plan to: "${userRequest}"

Previous tasks completed: ${i}
Remaining tasks: ${initialTasks.length - i - 1}

Please execute this task and provide a detailed report of what you did. Use any tools necessary (file operations, code analysis, etc.) to complete the task.`;

        const taskExecutionMessage: ChatMessage = {
          id: (Date.now() + i + 2).toString(),
          role: 'user',
          content: taskPrompt,
          timestamp: new Date(),
          hidden: true,
        };
        onSendMessage(currentSessionId, taskExecutionMessage);

        const taskOptions: GeminiOptions = {
          approvalMode: 'yolo',
          includes: ['codebase'],
          workspaceId: workspace.id,
          sessionId: currentSessionId,
        };

        try {
          const taskResponse = await callAI(taskPrompt, workspace.path, taskOptions, settings, globalConfig);

          // Update task status to completed
          setTasks(prevTasks =>
            prevTasks.map(t =>
              t.id === task.id
                ? { 
                    ...t, 
                    status: 'completed' as const, 
                    updatedAt: new Date(),
                    result: taskResponse.response.substring(0, 200) + (taskResponse.response.length > 200 ? '...' : '')
                  }
                : t
            )
          );

          // Add task result as a message
          const resultMessage: ChatMessage = {
            id: (Date.now() + i + 3).toString(),
            role: 'assistant',
            content: `✅ **Task ${i + 1} Completed:** ${task.description}\n\n${taskResponse.response}`,
            timestamp: new Date(),
            editable: true,
            stats: taskResponse.stats,
          };
          onSendMessage(currentSessionId, resultMessage);

        } catch (error: any) {
          console.error(`[Agent] Task ${i + 1} failed:`, error);

          // Update task status to failed
          setTasks(prevTasks =>
            prevTasks.map(t =>
              t.id === task.id
                ? { 
                    ...t, 
                    status: 'failed' as const, 
                    updatedAt: new Date(),
                    result: error.message || 'Task execution failed'
                  }
                : t
            )
          );

          // Add error message
          const errorMessage: ChatMessage = {
            id: (Date.now() + i + 3).toString(),
            role: 'assistant',
            content: `❌ **Task ${i + 1} Failed:** ${task.description}\n\nError: ${error.message || 'Unknown error'}`,
            timestamp: new Date(),
            editable: true,
          };
          onSendMessage(currentSessionId, errorMessage);
        }
      }

      // Step 3: Final summary
      setThinkingMessage(t("chat.agent.updateProgress"));
      const summaryPrompt = `All tasks have been completed. Please provide a brief summary of what was accomplished.

Original request: "${userRequest}"
Tasks completed: ${initialTasks.length}`;

      const summaryMessage: ChatMessage = {
        id: (Date.now() + 1000).toString(),
        role: 'user',
        content: summaryPrompt,
        timestamp: new Date(),
        hidden: true,
      };
      onSendMessage(currentSessionId, summaryMessage);

      const summaryOptions: GeminiOptions = {
        approvalMode: 'yolo',
        workspaceId: workspace.id,
        sessionId: currentSessionId,
      };

      const summaryResponse = await callAI(summaryPrompt, workspace.path, summaryOptions, settings, globalConfig);

      const finalMessage: ChatMessage = {
        id: (Date.now() + 1001).toString(),
        role: 'assistant',
        content: `🎉 **All Tasks Completed!**\n\n${summaryResponse.response}`,
        timestamp: new Date(),
        editable: true,
        stats: summaryResponse.stats,
      };
      onSendMessage(currentSessionId, finalMessage);

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
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: string, type: "command" | "file") => {
    if (!textareaRef.current) return;

    const text = inputValue.substring(0, cursorPosition);
    const lastWordStart = text.lastIndexOf(type === "command" ? "/" : "#");

    if (lastWordStart !== -1) {
      const before = inputValue.substring(0, lastWordStart);
      const after = inputValue.substring(cursorPosition);
      const newValue =
        before + (type === "command" ? "/" : "#") + suggestion + " " + after;

      setInputValue(newValue);
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);

      // Set cursor position after the inserted suggestion
      setTimeout(() => {
        const newCursorPos = lastWordStart + suggestion.length + 2; // +2 for prefix and space
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
                  onResendMessage={onResendMessage}
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
