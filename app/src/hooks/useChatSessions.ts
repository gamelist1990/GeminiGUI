import { useState, useEffect } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { Config } from '../utils/configAPI';
import { mockSessions } from '../mock';

const MAX_SESSIONS = 5;
const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

// simple uuid v4 generator
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useChatSessions(workspaceId?: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  useEffect(() => {
    if (workspaceId) {
      (async () => {
        const loaded = await config.loadSessions(workspaceId);
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
  }, [workspaceId]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewSession = async (): Promise<boolean> => {
    if (sessions.length >= MAX_SESSIONS || !workspaceId) {
      return false; // Cannot create more sessions
    }
    
    const newSession: ChatSession = {
      id: uuidv4(),
      name: `Session ${sessions.length + 1}`,
      messages: [],
      tokenUsage: 0,
      createdAt: new Date(),
    };
    
    const updated = [...sessions, newSession];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
    await config.saveSessions(workspaceId, updated);
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
        if (workspaceId) {
          config.saveChatSession(workspaceId, newSession);
        }
        return newSession;
      }
      return s;
    });
    setSessions(updated);
    if (workspaceId) {
      await config.saveSessions(workspaceId, updated);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const filtered = sessions.filter(s => s.id !== sessionId);
    setSessions(filtered);
    if (currentSessionId === sessionId && filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    }
    if (workspaceId) {
      await config.deleteSession(workspaceId, sessionId);
      // saveSessions already updated inside deleteSession; ensure sessions.json synced
      await config.saveSessions(workspaceId, filtered);
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
    if (workspaceId) {
      await config.saveSessions(workspaceId, updated);
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
