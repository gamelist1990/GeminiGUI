import React, { useState, useRef, useEffect } from "react";
import "./Agent.css";
import "../pages/Chat.css"; // Reuse chat styles
import { ChatMessage, AgentTask, Workspace, ChatSession } from "../types";
import { t, getCurrentLanguage } from "../utils/i18n";
import { callAI, GeminiOptions } from "../utils/geminiCUI";
import { getAllToolNames } from "../AITool/modernTools";
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
  onResendMessage: (sessionId: string, messageId: string, newMessage: ChatMessage) => void;
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
  const [thinkingStartTime, setThinkingStartTime] = useState<number>(0);
  const [currentTaskDescription, setCurrentTaskDescription] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
  
  // Session management state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [showNewChatDropdown, setShowNewChatDropdown] = useState(false);
  
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.new-chat-dropdown')) {
        setShowNewChatDropdown(false);
      }
    };

    if (showNewChatDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNewChatDropdown]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, tasks]);

  // Update thinking time every second
  useEffect(() => {
    if (!isThinking || thinkingStartTime === 0) {
      setElapsedSeconds(0);
      return;
    }
    
    // Initial calculation
    setElapsedSeconds(Math.floor((Date.now() - thinkingStartTime) / 1000));
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - thinkingStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isThinking, thinkingStartTime]);

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
    setThinkingStartTime(Date.now());
    setElapsedSeconds(0);
    setThinkingMessage(t("chat.agent.planningTasks"));
    setCurrentTaskDescription("タスク計画を作成中...");

    // Check if OpenAI is enabled - Agent mode requires OpenAI for reliable tool execution
    if (!settings?.enableOpenAI) {
      console.warn('[Agent] OpenAI is not enabled - Agent mode may not work properly with Gemini');
      
      const warningMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: t("chat.agent.openAIWarning"),
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, warningMessage);
      
      // Add a small delay so user can see the warning
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

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
      // Get user's language preference
      const userLanguage = getCurrentLanguage();
      const isJapanese = userLanguage === 'ja_JP';
      
      const autonomousPrompt = isJapanese ? 
        `あなたは自律型AIエージェント（エージェントモード）です。ユーザーからのリクエスト:

"${userRequest}"

**あなたのミッション:**
このタスクを自律的に**最後まで完了**してください。

**利用可能なツール:**
- **update_task_progress**: タスク進捗を更新（マークダウンチェックリスト: [ ] 未完了, [x] 完了）
- **send_user_message**: 完了報告（type: "success" で報告）
- **ファイル操作**: list_directory, read_file, write_file, create_directory など

**重要な効率化ルール:**

1. **タスクは3-4個まで** - シンプルに保つ
   例: ① 情報収集 → ② 分析・処理 → ③ レポート作成 → ④ 完了報告

2. **⚠️ 必ず複数ツールを同時に呼び出す** - これが最も重要
   ❌ 悪い例: update_task_progress だけ呼び出す
   ✅ 良い例: update_task_progress + list_directory を同時に呼び出す

3. **同じツールを繰り返さない** - 常に前進する
   list_directory → 次は read_file や write_file

4. **最短ルートで完了** - 不要なステップをスキップ

**ワークフロー:**

**応答1（開始）:**
- update_task_progress(3-4個のシンプルなタスク計画)
- **同時に** list_directory 実行 ← 重要！

**応答2-3（実行）:**
- update_task_progress(完了タスクを [x])
- **同時に** 次のツール実行（read_file, write_file など） ← 重要！

**応答4（完了）:**
- update_task_progress(全タスク [x])
- **同時に** send_user_message(type: "success", 完了報告) ← 重要！

**⚠️ 絶対に守ること:**
- update_task_progress **だけ**を呼び出すのは禁止
- 毎回**必ず2つ以上**のツールを呼び出す
- 1つの応答で複数ツール = 高速完了

**目標: 5回以内の応答で完了**

今すぐ開始してください:
1. 3-4個のシンプルなタスク計画を作成
2. **必ず同じ応答で**最初のツールも実行（list_directoryなど）` :
        `You are an autonomous AI agent in Agent Mode. The user has requested:

"${userRequest}"

**Your Mission:**
Complete this task autonomously.

**Available Tools:**
- **update_task_progress**: Update task progress (markdown checklist: [ ] pending, [x] done)
- **send_user_message**: Report completion (type: "success")
- **File operations**: list_directory, read_file, write_file, create_directory, etc.

**Critical Efficiency Rules:**

1. **3-4 tasks maximum** - Keep it simple
   Example: ① Collect info → ② Analyze/Process → ③ Create report → ④ Report completion

2. **⚠️ MUST call multiple tools simultaneously** - This is CRITICAL
   ❌ Bad: Call update_task_progress only
   ✅ Good: Call update_task_progress + list_directory together

3. **Never repeat the same tool** - Always move forward
   list_directory → next use read_file or write_file

4. **Take the shortest path** - Skip unnecessary steps

**Workflow:**

**Response 1 (Start):**
- update_task_progress(3-4 simple task plan)
- **SIMULTANEOUSLY** execute list_directory ← CRITICAL!

**Response 2-3 (Execute):**
- update_task_progress(mark completed as [x])
- **SIMULTANEOUSLY** execute next tool (read_file, write_file, etc.) ← CRITICAL!

**Response 4 (Complete):**
- update_task_progress(all tasks [x])
- **SIMULTANEOUSLY** send_user_message(type: "success", completion report) ← CRITICAL!

**⚠️ ABSOLUTE RULES:**
- Calling update_task_progress **alone** is FORBIDDEN
- MUST call **2+ tools** every time
- Multiple tools per response = fast completion

**Goal: Complete in 5 responses or less**

**Respond in ${isJapanese ? 'Japanese' : 'English'} language**

Start NOW:
1. Create 3-4 simple task plan
2. **MUST execute first tool in same response** (list_directory, etc.)`;

      // Send the autonomous prompt (hidden from user)
      const agentMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: autonomousPrompt,
        timestamp: new Date(),
        hidden: true,
      };
      onSendMessage(currentSessionId, agentMessage);

      // Track if agent has sent completion message
      let agentCompletionSent = false;
      let latestTaskPlanContent = '';
      
      // Setup Agent tool callbacks
      const agentCallbacks = {
        onUpdateTaskProgress: (markdownContent: string) => {
          console.log('[Agent] Updating task progress:', markdownContent.substring(0, 100));
          
          // Store latest task plan content for completion checking
          latestTaskPlanContent = markdownContent;
          
          // Update the existing task plan message
          const updatedMessage: ChatMessage = {
            id: taskPlanMessageId,
            role: 'assistant',
            content: `📋 **Task Plan:**\n\n${markdownContent}`,
            timestamp: new Date(),
            editable: true,
          };
          // Use resend to update the existing message
          onResendMessage(currentSessionId, taskPlanMessageId, updatedMessage);
          
          // Parse and update tasks in the sidebar
          const parsedTasks = parseTasksFromResponse(markdownContent);
          if (parsedTasks.length > 0) {
            setTasks(parsedTasks);
            
            // Update current task description for thinking indicator
            const currentTask = parsedTasks.find(t => t.status === 'in-progress') || 
                               parsedTasks.find(t => t.status === 'pending');
            if (currentTask) {
              setCurrentTaskDescription(currentTask.description);
            }
          }
        },
        onSendUserMessage: (message: string, messageType: 'info' | 'success' | 'warning' | 'error') => {
          console.log('[Agent] Sending user message:', messageType, message.substring(0, 100));
          
          // Track if agent sent completion message
          if (messageType === 'success') {
            agentCompletionSent = true;
            console.log('[Agent] Completion message received from agent');
          }
          
          const icon = {
            info: 'ℹ️',
            success: '🎉',
            warning: '⚠️',
            error: '❌'
          }[messageType];
          
          const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `${icon} ${messageType === 'success' ? '**【All Task Finish】**\n\n' : ''}${message}`,
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

      const baseToolNames = Array.isArray(settings?.enabledTools) && settings.enabledTools.length > 0
        ? settings.enabledTools
        : getAllToolNames();

      const combinedEnabledTools = Array.from(new Set([
        ...baseToolNames,
        'update_task_progress',
        'send_user_message'
      ]));

      const agentOptions: GeminiOptions = {
        approvalMode: 'yolo', // Full autonomy
        includes: ['codebase'],
        enabledTools: [
          ...combinedEnabledTools
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

      console.log('[Agent] Agent execution completed. Completion sent:', agentCompletionSent);
      
      // If agent has not sent completion message, check if we need to continue
      if (!agentCompletionSent) {
        // Parse tasks from the latest task plan to check completion status
        const currentTasks = parseTasksFromResponse(latestTaskPlanContent);
        
        const hasIncompleteTasks = currentTasks.some(
          task => task.status === 'pending' || task.status === 'in-progress'
        );
        
        console.log('[Agent] Task status check:', {
          totalTasks: currentTasks.length,
          hasIncomplete: hasIncompleteTasks,
          taskStatuses: currentTasks.map(t => ({ desc: t.description, status: t.status }))
        });

        // If there are incomplete tasks, prompt AI to continue
        if (hasIncompleteTasks && currentTasks.length > 0) {
          console.log('[Agent] Tasks are not complete, prompting AI to continue...');
          
          const userLanguage = getCurrentLanguage();
          const isJapanese = userLanguage === 'ja_JP';
          
          // Track conversation history locally for the continuation loop
          const localConversationHistory: Array<{ role: string; content: string }> = [];
          
          // Initialize with current session messages
          // Use _sessions to get the most up-to-date session (especially after resend)
          const currentSession = _sessions.find(s => s.id === currentSessionId);
          if (currentSession?.messages) {
            currentSession.messages.forEach(msg => {
              localConversationHistory.push({
                role: msg.role,
                content: msg.content
              });
            });
            console.log(`[Agent] Initial conversation history: ${localConversationHistory.length} messages (from _sessions)`);
          } else if (session?.messages) {
            // Fallback to session prop if _sessions lookup fails
            session.messages.forEach(msg => {
              localConversationHistory.push({
                role: msg.role,
                content: msg.content
              });
            });
            console.log(`[Agent] Initial conversation history: ${localConversationHistory.length} messages (from session prop)`);
          }
          
          console.log(`[Agent] Starting with ${localConversationHistory.length} messages in history`);
          
          // Restore agent callbacks for continuation
          (window as any).__agentCallbacks = {
            onUpdateTaskProgress: (markdownContent: string) => {
              latestTaskPlanContent = markdownContent;
              agentCallbacks.onUpdateTaskProgress(markdownContent);
            },
            onSendUserMessage: (message: string, messageType: 'info' | 'success' | 'warning' | 'error') => {
              if (messageType === 'success') {
                agentCompletionSent = true;
              }
              agentCallbacks.onSendUserMessage(message, messageType);
            }
          };
          (window as any).__agentSessionId = currentSessionId;
          
          // Continue execution - set max iterations to prevent infinite loops
          const maxContinuations = 10; // Reduced from 20 to 10 for efficiency
          let continuationCount = 0;
          
          while (!agentCompletionSent && continuationCount < maxContinuations) {
            continuationCount++;
            console.log(`[Agent] Continuation attempt ${continuationCount}/${maxContinuations}`);
            
            // Re-parse current tasks to get latest status
            const currentIterationTasks = parseTasksFromResponse(latestTaskPlanContent);
            const incompleteTasks = currentIterationTasks.filter(t => t.status === 'pending' || t.status === 'in-progress');
            const completedTasks = currentIterationTasks.filter(t => t.status === 'completed');
            
            console.log(`[Agent] Progress: ${completedTasks.length}/${currentIterationTasks.length} tasks completed`);
            
            // Check if all tasks are now complete
            if (incompleteTasks.length === 0 && currentIterationTasks.length > 0) {
              console.log('[Agent] All tasks completed!');
              if (!agentCompletionSent) {
                // Force send completion message
                const completionMessage: ChatMessage = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: `🎉 **【All Task Finish】**\n\nすべてのタスクが正常に完了しました！`,
                  timestamp: new Date(),
                };
                onSendMessage(currentSessionId, completionMessage);
              }
              break;
            }
            
            // Update thinking indicator with current progress
            if (incompleteTasks.length > 0) {
              setCurrentTaskDescription(incompleteTasks[0].description);
            }
            
            // Build more specific continuation prompt based on progress
            const specificPrompt = isJapanese ?
              `**進捗: ${completedTasks.length}/${currentIterationTasks.length} 完了 (${Math.round(completedTasks.length / currentIterationTasks.length * 100)}%)**

${incompleteTasks.length > 0 ? `
**次のタスク:** ${incompleteTasks[0].description}

**必須アクション（両方実行）:**
${completedTasks.length === 0 ?
  '1️⃣ update_task_progress(タスク計画)\n2️⃣ list_directory または search_files でデータ収集開始' :
  completedTasks.length === 1 ? 
  '1️⃣ update_task_progress(タスク1 [x])\n2️⃣ **read_file または write_file**（list_directory繰り返し禁止）\n\n⚠️ 重要: update_task_progress だけでなく、**実際の作業ツールも呼び出す**' :
  completedTasks.length === 2 ?
  '1️⃣ update_task_progress(タスク2 [x])\n2️⃣ **write_file(`report.md`, 内容)**\n\n⚠️ **今すぐ write_file 必須** - レポートを作成しないと失敗' :
  '1️⃣ update_task_progress(全 [x])\n2️⃣ send_user_message(type: "success")'
}

**⚠️ 警告:**
- update_task_progress **だけ**呼び出すのは ❌ 不十分
- 必ず**2つのツール**を呼び出す: update_task_progress + 実際の作業ツール

**今すぐ実行:** 2つのツール呼び出し` : 
  '🎉 完了! send_user_message(type: "success")'
}` :
              `**Progress: ${completedTasks.length}/${currentIterationTasks.length} done (${Math.round(completedTasks.length / currentIterationTasks.length * 100)}%)**

${incompleteTasks.length > 0 ? `
**Next Task:** ${incompleteTasks[0].description}

**REQUIRED Actions (execute BOTH):**
${completedTasks.length === 0 ?
  '1️⃣ update_task_progress(task plan)\n2️⃣ list_directory or search_files to start collecting data' :
  completedTasks.length === 1 ? 
  '1️⃣ update_task_progress(Task 1 [x])\n2️⃣ **read_file or write_file** (NO list_directory repeat)\n\n⚠️ Critical: Call **actual work tool**, not just update_task_progress' :
  completedTasks.length === 2 ?
  '1️⃣ update_task_progress(Task 2 [x])\n2️⃣ **write_file(`report.md`, content)**\n\n⚠️ **write_file MANDATORY NOW** - failure to create report = failure' :
  '1️⃣ update_task_progress(all [x])\n2️⃣ send_user_message(type: "success")'
}

**⚠️ WARNING:**
- Calling update_task_progress **only** = ❌ INSUFFICIENT
- MUST call **2 tools**: update_task_progress + actual work tool

**Execute NOW:** 2 tool calls` :
  '🎉 Done! send_user_message(type: "success")'
}`;
            
            // Send the continuation prompt (hidden from user, but saved in session)
            const continuationMessage: ChatMessage = {
              id: `continuation-${Date.now()}`,
              role: 'user',
              content: specificPrompt,
              timestamp: new Date(),
              hidden: true, // Hidden from UI but saved in session
            };
            onSendMessage(currentSessionId, continuationMessage);
            
            // Add to local history
            localConversationHistory.push({
              role: 'user',
              content: specificPrompt
            });
            
            // Compress conversation history if it gets too long
            // Keep only: initial user request, latest 10 messages, and current prompt
            let compressedHistory = localConversationHistory;
            if (localConversationHistory.length > 15) {
              compressedHistory = [
                localConversationHistory[0], // Original user request
                ...localConversationHistory.slice(-14) // Latest 14 messages + current prompt
              ];
              console.log(`[Agent] Compressed history: ${localConversationHistory.length} -> ${compressedHistory.length} messages`);
            }
            
            console.log(`[Agent] Building continuation with ${compressedHistory.length} history messages`);
            
            const continuationOptions: GeminiOptions = {
              approvalMode: 'yolo',
              includes: ['codebase'],
              enabledTools: combinedEnabledTools,
              workspaceId: workspace.id,
              sessionId: currentSessionId,
              conversationHistoryJson: compressedHistory, // Pass compressed conversation history
            };
            
            const continuationResponse = await callAI(
              specificPrompt,
              workspace.path,
              continuationOptions,
              {
                ...settings,
                ...globalConfig,
                responseMode: 'stream'
              },
              (chunk: any) => {
                if (chunk && chunk.type === 'text' && chunk.content) {
                  const text = String(chunk.content);
                  setThinkingMessage(text.substring(0, 100) + (text.length > 100 ? '...' : ''));
                }
              }
            );
            
            // Save AI response to session (if it has content) and add to local history
            if (continuationResponse.response && continuationResponse.response.trim()) {
              const responseContent = continuationResponse.response.trim();
              
              // Add to local history
              localConversationHistory.push({
                role: 'assistant',
                content: responseContent
              });
              
              // Only save to session if it's not tool metadata
              if (!responseContent.startsWith('[TOOL]') && !responseContent.includes('[TOOL]')) {
                const responseMessage: ChatMessage = {
                  id: `response-${Date.now()}`,
                  role: 'assistant',
                  content: responseContent,
                  timestamp: new Date(),
                  hidden: true, // Hidden from UI but saved for history
                };
                onSendMessage(currentSessionId, responseMessage);
              }
            }
            
            // Check if completion was sent
            if (agentCompletionSent) {
              console.log('[Agent] Completion confirmed after continuation');
              break;
            }
            
            // Add a delay before next iteration
            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
          }
          
          if (continuationCount >= maxContinuations) {
            console.warn('[Agent] Max continuation attempts reached');
            
            // Check if any tasks were actually completed
            const finalTasks = parseTasksFromResponse(latestTaskPlanContent);
            const completedCount = finalTasks.filter(t => t.status === 'completed').length;
            
            const warningMessage: ChatMessage = {
              id: Date.now().toString(),
              role: 'assistant',
              content: `⚠️ エージェントが最大試行回数（${maxContinuations}回）に達しました。\n\n` +
                      `進捗: ${completedCount}/${finalTasks.length} タスク完了\n\n` +
                      (completedCount > 0 ? 
                        `一部のタスクは完了しましたが、すべてのタスクを完了できませんでした。より単純なタスクに分割するか、手動で続行してください。` :
                        `タスクの実行に問題が発生しました。タスクをより明確にするか、手動で実行してください。`),
              timestamp: new Date(),
            };
            onSendMessage(currentSessionId, warningMessage);
          }
          
          // Clear agent callbacks after all continuations
          delete (window as any).__agentCallbacks;
          delete (window as any).__agentSessionId;
        } else if (currentTasks.length === 0) {
          // No tasks were created - this might be a simple query that doesn't need task decomposition
          console.log('[Agent] No tasks were created, treating as simple query');
          if (agentResponse.response && agentResponse.response.trim()) {
            const responseText = agentResponse.response.trim();
            // Only show if it's not tool metadata
            if (!responseText.startsWith('[TOOL]') && !responseText.includes('[TOOL]')) {
              const infoMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: agentResponse.response,
                timestamp: new Date(),
                editable: true,
                stats: agentResponse.stats,
              };
              onSendMessage(currentSessionId, infoMessage);
            }
          }
        } else {
          // All tasks completed but agent didn't send completion message
          console.log('[Agent] All tasks completed, sending completion message');
          const completionMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `🎉 **【All Task Finish】**\n\nすべてのタスクが正常に完了しました！`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, completionMessage);
        }
      } else {
        console.log('[Agent] Agent sent completion message - tasks finished');
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
      setThinkingStartTime(0);
      setElapsedSeconds(0);
      setCurrentTaskDescription("");
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

  // Session management functions
  const handleRenameSession = (sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId);
    setEditingSessionName(currentName);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingSessionName.trim()) {
      _onRenameSession(sessionId, editingSessionName.trim());
    }
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const handleDeleteSession = (sessionId: string) => {
    if (window.confirm(t("chat.sessionDeleteConfirm"))) {
      _onDeleteSession(sessionId);
    }
  };

  // Handle creating a new agent chat session
  const handleNewAgentChat = async () => {
    const success = await _onCreateNewSession(true);
    if (!success) {
      alert(t("chat.sessionLimit"));
    }
    setShowNewChatDropdown(false);
  };

  // Handle creating a new regular chat session
  const handleNewChat = async () => {
    const success = await _onCreateNewSession(false);
    if (!success) {
      alert(t("chat.sessionLimit"));
    }
    setShowNewChatDropdown(false);
  };

  const toggleNewChatDropdown = () => {
    setShowNewChatDropdown(!showNewChatDropdown);
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
        <div className="new-chat-dropdown">
          <div className="new-chat-button-group">
            <button
              className="new-chat-main-button primary"
              onClick={handleNewAgentChat}
              disabled={_maxSessionsReached}
            >
              ✨ {t("chat.newChat")}
            </button>
            <button
              className="new-chat-dropdown-toggle primary"
              onClick={toggleNewChatDropdown}
              disabled={_maxSessionsReached}
              title={t("chat.newChatOptions")}
            >
              ▼
            </button>
          </div>
          {showNewChatDropdown && !_maxSessionsReached && (
            <div className="new-chat-dropdown-menu">
              <button className="new-chat-dropdown-item" onClick={handleNewChat}>
                <div className="new-chat-dropdown-item-icon">💬</div>
                <div className="new-chat-dropdown-item-content">
                  <div className="new-chat-dropdown-item-title">{t("chat.newChat")}</div>
                  <div className="new-chat-dropdown-item-description">Standard chat mode</div>
                </div>
              </button>
              <button className="new-chat-dropdown-item agent" onClick={handleNewAgentChat}>
                <div className="new-chat-dropdown-item-icon">🤖</div>
                <div className="new-chat-dropdown-item-content">
                  <div className="new-chat-dropdown-item-title">{t("chat.newAgentChat")}</div>
                  <div className="new-chat-dropdown-item-description">{t("chat.agent.description")}</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="agent-container">
        <div className="agent-sidebar-sessions">
          <div className="sessions-header">
            <h3>{t("chat.sessions")}</h3>
            <span className="session-count">{_sessions.length}/5</span>
          </div>
          <div className="sessions-list">
            {_sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${
                  session.id === currentSessionId ? "active" : ""
                }`}
                onClick={() => _onSwitchSession(session.id)}
              >
                <div className="session-info">
                  {editingSessionId === session.id ? (
                    <input
                      type="text"
                      className="session-name-input"
                      value={editingSessionName}
                      onChange={(e) => setEditingSessionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveRename(session.id);
                        } else if (e.key === "Escape") {
                          handleCancelRename();
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => handleSaveRename(session.id)}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="session-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRenameSession(session.id, session.name);
                      }}
                      title="Double-click to rename"
                    >
                      {session.name}
                    </span>
                  )}
                  {isThinking && session.id === currentSessionId && (
                    <div className="request-timer">
                      <div className="timer-spinner"></div>
                      <span className="timer-text">Thinking...</span>
                    </div>
                  )}
                </div>
                <div className="session-actions">
                  <button
                    className="session-action-button delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    title={t("chat.sessionDelete")}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                    console.log('[Agent] Resending message, clearing state...');
                    
                    // Clear tasks and assistant messages before re-executing
                    setTasks([]);
                    
                    // Clear thinking state
                    setIsThinking(false);
                    setThinkingStartTime(0);
                    setElapsedSeconds(0);
                    setCurrentTaskDescription("");
                    
                    // Call resend to update the session history
                    // This will trim all messages after the resent message
                    onResendMessage(currentSessionId, message.id, newMessage);
                    
                    // Wait for session state to update
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    console.log('[Agent] Re-executing agent loop after resend...');
                    
                    // If it's a user message, re-execute the agent loop
                    // The loop will build a fresh conversation history from the trimmed session
                    if (newMessage.role === 'user' && newMessage.content.trim()) {
                      await executeAgentLoop(newMessage.content.trim());
                    }
                  } : undefined}
                />
              ))}

            {isThinking && (
              <div className="agent-thinking-indicator">
                <div className="agent-thinking-spinner"></div>
                <div className="agent-thinking-content">
                  <div className="agent-thinking-task">
                    {currentTaskDescription || t("chat.agent.thinking")}
                  </div>
                  <div className="agent-thinking-stats">
                    <span className="agent-thinking-progress">
                      {tasks.filter(t => t.status === 'completed').length}/{tasks.length} タスク完了
                    </span>
                    {thinkingStartTime > 0 && (
                      <span className="agent-thinking-time">
                        {elapsedSeconds}秒経過
                      </span>
                    )}
                  </div>
                </div>
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
