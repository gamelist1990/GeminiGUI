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
  onBack,
}: ChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession) return;

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
                  <span className="session-name">{session.name}</span>
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
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
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
