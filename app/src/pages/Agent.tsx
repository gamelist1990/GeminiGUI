import React, { useState, useRef, useEffect } from "react";
import "./Agent.css";
import "../pages/Chat.css"; // Reuse chat styles
import { ChatMessage, AgentTask, Workspace, ChatSession } from "../types";
import { t } from "../utils/i18n";
import { callAI, GeminiOptions } from "../utils/geminiCUI";
import ChatMessageBubble from "./Chat/ChatMessageBubble";

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
  onCreateNewSession: (isAgentMode?: boolean) => Promise<void>;
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
  sessions,
  currentSessionId,
  maxSessionsReached,
  approvalMode,
  responseMode,
  totalTokens,
  customApiKey,
  googleCloudProjectId,
  maxMessagesBeforeCompact,
  globalConfig,
  settings,
  onCreateNewSession,
  onSwitchSession,
  onSendMessage,
  onResendMessage,
  onDeleteSession,
  onRenameSession,
  onCompactSession,
  onBack,
}: AgentProps) {
  const [inputValue, setInputValue] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, tasks]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

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

  const handleSendMessage = () => {
    if (!inputValue.trim() || isThinking) return;

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

  // Handle double-click to edit assistant messages
  const handleMessageDoubleClick = (message: ChatMessage) => {
    if (message.role === 'assistant' && !isThinking) {
      setEditingMessageId(message.id);
      setEditContent(message.content);
    }
  };

  const handleSaveEdit = () => {
    if (!editingMessageId || !editContent.trim()) return;

    const editedMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: editContent.trim(),
      timestamp: new Date(),
      editable: true,
    };

    onResendMessage(editedMessage);
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent("");
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
                <div
                  key={message.id}
                  className="agent-message"
                  onDoubleClick={() => handleMessageDoubleClick(message)}
                >
                  {editingMessageId === message.id ? (
                    <div className="agent-message-editing">
                      <textarea
                        className="agent-edit-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        autoFocus
                      />
                      <div className="agent-edit-buttons">
                        <button className="primary" onClick={handleSaveEdit}>
                          {t("chat.agent.saveEdit")}
                        </button>
                        <button className="secondary" onClick={handleCancelEdit}>
                          {t("chat.agent.cancelEdit")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ChatMessageBubble
                      message={message}
                      workspace={workspace}
                      onResendMessage={onResendMessage}
                    />
                  )}
                </div>
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
