import { useState } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { mockSessions } from '../mock';

const MAX_SESSIONS = 5;

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(mockSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string>(sessions[0]?.id || '');

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewSession = (): boolean => {
    if (sessions.length >= MAX_SESSIONS) {
      return false; // Cannot create more sessions
    }
    
    const newSession: ChatSession = {
      id: Date.now().toString(),
      name: `Session ${sessions.length + 1}`,
      messages: [],
      tokenUsage: 0,
      createdAt: new Date(),
    };
    
    setSessions([...sessions, newSession]);
    setCurrentSessionId(newSession.id);
    return true;
  };

  const addMessage = (sessionId: string, message: ChatMessage) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          messages: [...s.messages, message],
          tokenUsage: s.tokenUsage + (message.content.length * 0.5), // Mock token calculation
        };
      }
      return s;
    }));
  };

  const getTotalTokens = () => {
    return sessions.reduce((sum, s) => sum + s.tokenUsage, 0);
  };

  const deleteSession = (sessionId: string) => {
    const filtered = sessions.filter(s => s.id !== sessionId);
    setSessions(filtered);
    if (currentSessionId === sessionId && filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    }
  };

  const renameSession = (sessionId: string, newName: string) => {
    setSessions(sessions.map(s => {
      if (s.id === sessionId) {
        return { ...s, name: newName };
      }
      return s;
    }));
  };

  return {
    sessions,
    currentSession,
    currentSessionId,
    setCurrentSessionId,
    createNewSession,
    addMessage,
    getTotalTokens,
    deleteSession,
    renameSession,
    maxSessionsReached: sessions.length >= MAX_SESSIONS,
  };
}
