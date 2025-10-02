import { useState, useEffect } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { Config } from '../utils/configAPI';
import { mockSessions } from '../mock';

const MAX_SESSIONS = 5;
const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

export function useChatSessions(workspaceName?: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  useEffect(() => {
    if (workspaceName) {
      (async () => {
        const loaded = await config.loadSessions(workspaceName);
        const finalSessions = loaded.length > 0 ? loaded : mockSessions;
        setSessions(finalSessions);
        if (!currentSessionId && finalSessions.length > 0) {
          setCurrentSessionId(finalSessions[0].id);
        }
      })();
    } else {
      // No workspace selected, use empty sessions
      setSessions([]);
      setCurrentSessionId('');
    }
  }, [workspaceName]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewSession = async (): Promise<boolean> => {
    if (sessions.length >= MAX_SESSIONS || !workspaceName) {
      return false; // Cannot create more sessions
    }
    
    const newSession: ChatSession = {
      id: Date.now().toString(),
      name: `Session ${sessions.length + 1}`,
      messages: [],
      tokenUsage: 0,
      createdAt: new Date(),
    };
    
    const updated = [...sessions, newSession];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
    await config.saveSessions(workspaceName, updated);
    return true;
  };

  const addMessage = async (sessionId: string, message: ChatMessage) => {
    const updated = sessions.map(s => {
      if (s.id === sessionId) {
        const newSession = {
          ...s,
          messages: [...s.messages, message],
          tokenUsage: s.tokenUsage + (message.content.length * 0.5), // Mock token calculation
        };
        // Save individual session
        if (workspaceName) {
          config.saveChatSession(workspaceName, newSession);
        }
        return newSession;
      }
      return s;
    });
    setSessions(updated);
    if (workspaceName) {
      await config.saveSessions(workspaceName, updated);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const filtered = sessions.filter(s => s.id !== sessionId);
    setSessions(filtered);
    if (currentSessionId === sessionId && filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    }
    if (workspaceName) {
      await config.saveSessions(workspaceName, filtered);
    }
  };

  const renameSession = async (sessionId: string, newName: string) => {
    const updated = sessions.map(s => {
      if (s.id === sessionId) {
        return { ...s, name: newName };
      }
      return s;
    });
    setSessions(updated);
    if (workspaceName) {
      await config.saveSessions(workspaceName, updated);
    }
  };

  const getTotalTokens = () => {
    return sessions.reduce((sum, s) => sum + s.tokenUsage, 0);
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
