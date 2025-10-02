import { useState, useRef, useEffect } from 'react';
import { ChatSession, ChatMessage, Workspace } from '../types';
import { t } from '../utils/i18n';
import { formatElapsedTime } from '../utils/storage';
import './Chat.css';

interface ChatProps {
  workspace: Workspace;
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  currentSessionId: string;
  maxSessionsReached: boolean;
  totalTokens: number;
  onCreateNewSession: () => boolean;
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
  totalTokens,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

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

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'こんにちは！これはモックレスポンスです。実際のAI統合では、ここで実際のレスポンスが表示されます。',
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, aiMessage);
      setIsTyping(false);
    }, 1000);
  };

  const handleNewChat = () => {
    const success = onCreateNewSession();
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
              {currentSession?.tokenUsage.toFixed(0)} / {totalTokens.toFixed(0)}
            </span>
          </div>
          {currentSession && (
            <div className="stat">
              <span className="stat-label">{t('chat.elapsedTime')}:</span>
              <span className="stat-value">
                {formatElapsedTime(currentSession.createdAt)}
              </span>
            </div>
          )}
        </div>
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
                  <span className="session-tokens">{session.tokenUsage.toFixed(0)} tokens</span>
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
            {currentSession?.messages.length === 0 ? (
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
            )}
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
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-bubble">
        <p>{message.content}</p>
        <span className="message-time">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
