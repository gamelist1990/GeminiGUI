import { useState, useRef, useEffect } from 'react';
import { ChatSession, ChatMessage, Workspace } from '../types';
import { t } from '../utils/i18n';
import { formatElapsedTime, formatNumber } from '../utils/storage';
import { callGemini } from '../utils/geminiCUI';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './Chat.css';

// Markdown components for syntax highlighting
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match) {
      if (match[1] === 'markdown') {
        // For markdown code blocks, render the content as markdown
        return (
          <div className="markdown-preview">
            <ReactMarkdown>
              {String(children)}
            </ReactMarkdown>
          </div>
        );
      } else {
        return (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }
    } else {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  },
};

interface ChatProps {
  workspace: Workspace;
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  currentSessionId: string;
  maxSessionsReached: boolean;
  aggregatedStats: any;
  onCreateNewSession: () => Promise<boolean>;
  onSwitchSession: (id: string) => void;
  onSendMessage: (sessionId: string, message: ChatMessage) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newName: string) => void;
  onBack: () => void;
}

export default function Chat({
  workspace,
  sessions,
  currentSession,
  currentSessionId,
  maxSessionsReached,
  aggregatedStats,
  onCreateNewSession,
  onSwitchSession,
  onSendMessage,
  onDeleteSession,
  onRenameSession,
  onBack,
}: ChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Update elapsed time in real-time
  useEffect(() => {
    if (!currentSession) {
      setElapsedTime('');
      return;
    }

    const updateElapsedTime = () => {
      setElapsedTime(formatElapsedTime(currentSession.createdAt));
    };

    // Update immediately
    updateElapsedTime();

    // Update every second
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [currentSession]);

  // Handle command and file suggestions
  useEffect(() => {
    const text = inputValue.substring(0, cursorPosition);
    const lastWord = text.split(/\s/).pop() || '';

    // Command suggestions
    if (lastWord.startsWith('/')) {
      const query = lastWord.substring(1).toLowerCase();
      const commands = ['compact', 'fixchat'];
      const filtered = commands.filter(cmd => cmd.startsWith(query));
      setCommandSuggestions(filtered);
      setShowCommandSuggestions(filtered.length > 0);
      setShowFileSuggestions(false);
    }
    // File suggestions
    else if (lastWord.startsWith('#')) {
      const query = lastWord.substring(1).toLowerCase();
      // Mock file suggestions - in production this would scan the workspace
      const files = ['file:app', 'file:TauriPlugin.md', 'file:README.md', 'codebase'];
      const filtered = files.filter(file => file.toLowerCase().includes(query));
      setFileSuggestions(filtered);
      setShowFileSuggestions(filtered.length > 0);
      setShowCommandSuggestions(false);
    } else {
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);
    }
  }, [inputValue, cursorPosition]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const insertSuggestion = (suggestion: string, prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = inputValue;
    const cursorPos = cursorPosition;
    
    // Find the start of the current word (command or file)
    let wordStart = cursorPos - 1;
    while (wordStart >= 0 && text[wordStart] !== ' ' && text[wordStart] !== '\n') {
      wordStart--;
    }
    wordStart++;

    const before = text.substring(0, wordStart);
    const after = text.substring(cursorPos);
    const newText = before + prefix + suggestion + ' ' + after;
    
    setInputValue(newText);
    setShowCommandSuggestions(false);
    setShowFileSuggestions(false);
    
    // Set cursor position after the inserted text
    setTimeout(() => {
      const newPos = wordStart + prefix.length + suggestion.length + 1;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  const processCommand = async (command: string, args: string) => {
    if (command === 'compact') {
      // Simulate compacting conversation
      const summaryMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '📝 会話履歴を要約しました。主なトピック:\n\n1. GeminiGUI プロジェクトについての質問\n2. AI Agentとの対話機能\n\n要約が完了しました。',
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, summaryMessage);
    } else if (command === 'fixchat') {
      // Simulate improving the user's text
      const improvedMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✨ メッセージを改善しました:\n\n改善後のテキスト: ${args}\n\n主要ポイントを保持し、AIが理解しやすい形式に最適化しました。`,
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, improvedMessage);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession) return;

    // Check if it's a command
    const trimmedInput = inputValue.trim();
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.substring(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      
      await processCommand(command, args);
      setInputValue('');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    onSendMessage(currentSessionId, userMessage);
    setInputValue('');
    setIsTyping(true);

    try {
      const geminiResponse = await callGemini(inputValue, workspace.path);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: geminiResponse.response,
        timestamp: new Date(),
        stats: geminiResponse.stats,
      };
      onSendMessage(currentSessionId, aiMessage);
    } catch (error) {
      console.error('Error calling Gemini:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewChat = async () => {
    const success = await onCreateNewSession();
    if (!success) {
      alert(t('chat.sessionLimit'));
    }
  };

  const handleRenameSession = (sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId);
    setEditingSessionName(currentName);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingSessionName.trim()) {
      onRenameSession(sessionId, editingSessionName.trim());
    }
    setEditingSessionId(null);
    setEditingSessionName('');
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingSessionName('');
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="back-button secondary" onClick={onBack}>
          ← {workspace.name}
        </button>
        <div className="chat-stats">
          <div className="stat">
            <span className="stat-label">{t('chat.tokenUsage')}:</span>
            <span className="stat-value">
              {formatNumber(currentSession && currentSession.messages.length > 0 && currentSession.messages[currentSession.messages.length - 1]?.stats
                ? Object.values(currentSession.messages[currentSession.messages.length - 1].stats!.models)[0]?.tokens.total || 0
                : 0)}
            </span>
          </div>
          {currentSession && (
            <div className="stat">
              <span className="stat-label">{t('chat.elapsedTime')}:</span>
              <span className="stat-value">
                {elapsedTime}
              </span>
            </div>
          )}
        </div>
        <button
          className="stats-button secondary"
          onClick={() => setShowStatsModal(true)}
          disabled={!aggregatedStats}
        >
          📊 統計
        </button>
        <button
          className="new-chat-button primary"
          onClick={handleNewChat}
          disabled={maxSessionsReached}
        >
          ✨ {t('chat.newChat')}
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-sidebar">
          <div className="sessions-header">
            <h3>{t('chat.sessions')}</h3>
            <span className="session-count">{sessions.length}/5</span>
          </div>
          <div className="sessions-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                onClick={() => onSwitchSession(session.id)}
              >
                <div className="session-info">
                  {editingSessionId === session.id ? (
                    <input
                      type="text"
                      className="session-name-input"
                      value={editingSessionName}
                      onChange={(e) => setEditingSessionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveRename(session.id);
                        } else if (e.key === 'Escape') {
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
                  <span className="session-tokens">{formatNumber(session.tokenUsage)} tokens</span>
                </div>
                {sessions.length > 1 && (
                  <button
                    className="delete-session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="chat-main">
          <div className="messages-container">
            {(() => {
              return currentSession?.messages.length === 0 ? (
                <div className="empty-state">
                  <div className="gemini-logo">
                    <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="20" fill="url(#gradient)" />
                      <defs>
                        <linearGradient id="gradient" x1="4" y1="4" x2="44" y2="44">
                          <stop offset="0%" stopColor="#4285f4" />
                          <stop offset="100%" stopColor="#9334e6" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <p>{t('chat.noMessages')}</p>
                </div>
              ) : (
                currentSession?.messages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} />
                ))
              );
            })()}
            {isTyping && (
              <div className="message assistant">
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            {(showCommandSuggestions || showFileSuggestions) && (
              <div className="suggestions-popup">
                {showCommandSuggestions && commandSuggestions.map((cmd) => (
                  <div
                    key={cmd}
                    className="suggestion-item"
                    onClick={() => insertSuggestion(cmd, '/')}
                  >
                    /{cmd} - {t(`chat.commands.${cmd}`)}
                  </div>
                ))}
                {showFileSuggestions && fileSuggestions.map((file) => (
                  <div
                    key={file}
                    className="suggestion-item"
                    onClick={() => insertSuggestion(file, '#')}
                  >
                    #{file}
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleSendMessage();
                } else if (e.key === 'Enter' && !e.shiftKey && !showCommandSuggestions && !showFileSuggestions) {
                  // Allow Enter for new line, but only Ctrl+Enter sends
                  // This prevents accidental sends
                }
                // Handle suggestion selection with Enter/Tab
                if ((e.key === 'Enter' || e.key === 'Tab') && (showCommandSuggestions || showFileSuggestions)) {
                  e.preventDefault();
                  const suggestions = showCommandSuggestions ? commandSuggestions : fileSuggestions;
                  const prefix = showCommandSuggestions ? '/' : '#';
                  if (suggestions.length > 0) {
                    insertSuggestion(suggestions[0], prefix);
                  }
                }
              }}
              placeholder={t('chat.placeholder')}
              rows={1}
            />
            <button
              className="send-button primary"
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* Stats Modal */}
      {showStatsModal && aggregatedStats && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>セッション統計情報</h2>
              <button className="modal-close" onClick={() => setShowStatsModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="stats-section">
                <h3>使用モデル</h3>
                {Object.entries(aggregatedStats.models).map(([modelName, modelData]: [string, any]) => (
                  <div key={modelName} className="model-info">
                    <div className="model-name">{modelName}</div>
                    <div className="model-details">
                      <div>リクエスト数: {modelData.api.totalRequests}</div>
                      <div>エラー数: {modelData.api.totalErrors}</div>
                      <div>レイテンシ: {modelData.api.totalLatencyMs}ms</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="stats-section">
                <h3>トークン使用量</h3>
                {Object.entries(aggregatedStats.models).map(([modelName, modelData]: [string, any]) => (
                  <div key={modelName} className="token-info">
                    <div>プロンプト: {modelData.tokens.prompt}</div>
                    <div>応答: {modelData.tokens.candidates}</div>
                    <div>合計: {modelData.tokens.total}</div>
                    <div>キャッシュ: {modelData.tokens.cached}</div>
                    <div>思考: {modelData.tokens.thoughts}</div>
                    <div>ツール: {modelData.tokens.tool}</div>
                  </div>
                ))}
              </div>

              <div className="stats-section">
                <h3>ツール使用状況</h3>
                <div className="tools-summary">
                  <div>総呼び出し数: {aggregatedStats.tools.totalCalls}</div>
                  <div>成功: {aggregatedStats.tools.totalSuccess}</div>
                  <div>失敗: {aggregatedStats.tools.totalFail}</div>
                  <div>総実行時間: {aggregatedStats.tools.totalDurationMs}ms</div>
                </div>
                {Object.keys(aggregatedStats.tools.byName).length > 0 && (
                  <div className="tools-details">
                    <h4>使用ツール詳細</h4>
                    {Object.entries(aggregatedStats.tools.byName).map(([toolName, toolData]: [string, any]) => (
                      <div key={toolName} className="tool-detail">
                        <div className="tool-name">{toolName}</div>
                        <div className="tool-stats">
                          <div>使用回数: {toolData.count}</div>
                          <div>実行時間: {toolData.durationMs}ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stats-section">
                <h3>ファイル変更</h3>
                <div className="file-changes">
                  <div>追加行数: {aggregatedStats.files.totalLinesAdded}</div>
                  <div>削除行数: {aggregatedStats.files.totalLinesRemoved}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const [showStats, setShowStats] = useState(false);

  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-bubble">
        {message.role === 'assistant' ? (
          <ReactMarkdown components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        ) : (
          <p>{message.content}</p>
        )}
        {message.stats && (
          <div className="message-stats-toggle">
            <button 
              className="stats-toggle-button"
              onClick={() => setShowStats(!showStats)}
            >
              📊 詳細統計 {showStats ? '▲' : '▼'}
            </button>
            {showStats && (
              <div className="message-stats">
                <div className="stats-section">
                  <h4>使用モデル</h4>
                  {Object.entries(message.stats.models).map(([modelName, modelData]) => (
                    <div key={modelName} className="model-info">
                      <div className="model-name">{modelName}</div>
                      <div className="model-details">
                        <div>リクエスト数: {modelData.api.totalRequests}</div>
                        <div>エラー数: {modelData.api.totalErrors}</div>
                        <div>レイテンシ: {modelData.api.totalLatencyMs}ms</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="stats-section">
                  <h4>トークン使用量</h4>
                  {Object.entries(message.stats.models).map(([modelName, modelData]) => (
                    <div key={modelName} className="token-info">
                      <div>プロンプト: {modelData.tokens.prompt}</div>
                      <div>応答: {modelData.tokens.candidates}</div>
                      <div>合計: {modelData.tokens.total}</div>
                      <div>キャッシュ: {modelData.tokens.cached}</div>
                      <div>思考: {modelData.tokens.thoughts}</div>
                      <div>ツール: {modelData.tokens.tool}</div>
                    </div>
                  ))}
                </div>

                <div className="stats-section">
                  <h4>ツール使用状況</h4>
                  <div className="tools-summary">
                    <div>総呼び出し数: {message.stats.tools.totalCalls}</div>
                    <div>成功: {message.stats.tools.totalSuccess}</div>
                    <div>失敗: {message.stats.tools.totalFail}</div>
                    <div>総実行時間: {message.stats.tools.totalDurationMs}ms</div>
                  </div>
                  {Object.keys(message.stats.tools.byName).length > 0 && (
                    <div className="tools-details">
                      <h5>使用ツール詳細</h5>
                      {Object.entries(message.stats.tools.byName).map(([toolName, toolData]) => (
                        <div key={toolName} className="tool-detail">
                          <div className="tool-name">{toolName}</div>
                          <div className="tool-stats">
                            <div>使用回数: {toolData.count}</div>
                            <div>実行時間: {toolData.durationMs}ms</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="stats-section">
                  <h4>ファイル変更</h4>
                  <div className="file-changes">
                    <div>追加行数: {message.stats.files.totalLinesAdded}</div>
                    <div>削除行数: {message.stats.files.totalLinesRemoved}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <span className="message-time">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
