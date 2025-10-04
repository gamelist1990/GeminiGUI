import { useState, useEffect, useCallback } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { Config } from '../utils/configAPI';
import { documentDir } from '@tauri-apps/api/path';

const MAX_SESSIONS = 5;

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
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    (async () => {
      if (!config) {
        const baseDir = await documentDir();
        const configPath = `${baseDir}\\PEXData\\GeminiGUI`;
        const configInstance = new Config(configPath);
        setConfig(configInstance);
      }
    })();
  }, [config]);

  useEffect(() => {
    if (workspaceId && config) {
      (async () => {
        console.log('useChatSessions: loading sessions for workspaceId:', workspaceId);
        const loaded = await config.loadSessions(workspaceId);
        console.log('useChatSessions: loaded sessions:', loaded.length, 'currentSessionId:', currentSessionId);
        let finalSessions = loaded.length > 0 ? loaded : [];
        console.log('useChatSessions: finalSessions:', finalSessions.map((s: ChatSession) => ({ id: s.id, messagesCount: s.messages.length })));
        
        // Auto-create first session if no sessions exist (0/5 case)
        if (finalSessions.length === 0) {
          console.log('useChatSessions: no sessions found, auto-creating first session');
          const newSession: ChatSession = {
            id: uuidv4(),
            name: `Session 1`,
            messages: [],
            tokenUsage: 0,
            createdAt: new Date(),
          };
          finalSessions = [newSession];
          await config.saveSessions(workspaceId, finalSessions);
          console.log('useChatSessions: auto-created session:', newSession.id);
        }
        
        setSessions(finalSessions);
        if (!currentSessionId && finalSessions.length > 0) {
          setCurrentSessionId(finalSessions[0].id);
        }
      })();
    } else {
      // No workspace selected, use empty sessions
      console.log('useChatSessions: no workspaceId, setting empty sessions');
      setSessions([]);
      setCurrentSessionId('');
    }
  }, [workspaceId]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewSession = async (): Promise<boolean> => {
    if (sessions.length >= MAX_SESSIONS || !workspaceId || !config) {
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

  const addMessage = useCallback(async (sessionId: string, message: ChatMessage) => {
    console.log('addMessage called:', { sessionId, message: { id: message.id, role: message.role, content: message.content.substring(0, 50) + '...' }, currentSessions: sessions.length });
    
    // Use a functional update to get the latest sessions state
    const updatedSessions = await new Promise<ChatSession[]>((resolve) => {
      setSessions(currentSessions => {
        const updated = currentSessions.map(s => {
          if (s.id === sessionId) {
            const newMessages = [...s.messages, message];
            console.log('addMessage: adding message to session', sessionId, 'old messages count:', s.messages.length, 'new messages count:', newMessages.length);
            
            // Calculate token usage: use API response if available, otherwise estimate from content
            const messageTokens = message.tokenUsage || Math.ceil(message.content.length / 4);
            
            const newSession = {
              ...s,
              messages: newMessages,
              tokenUsage: s.tokenUsage + messageTokens,
            };
            
            return newSession;
          }
          return s;
        });
        console.log('addMessage updated sessions:', updated.map(s => ({ id: s.id, messagesCount: s.messages.length, lastMessage: s.messages[s.messages.length - 1]?.content?.substring(0, 30) + '...' })));
        
        resolve(updated);
        return updated;
      });
    });
    
    // Save both the individual session file and sessions.json after state update
    if (workspaceId && config) {
      const sessionToSave = updatedSessions.find(s => s.id === sessionId);
      if (sessionToSave) {
        try {
          await config.saveChatSession(workspaceId, sessionToSave);
          await config.saveSessions(workspaceId, updatedSessions);
        } catch (err) {
          console.error('Failed to save session:', err);
        }
      }
    }
  }, [workspaceId]);

  const resendMessage = useCallback(async (sessionId: string, messageId: string, newMessage: ChatMessage) => {
    console.log('resendMessage called:', { sessionId, messageId, newMessage: { id: newMessage.id, role: newMessage.role, content: newMessage.content.substring(0, 50) + '...' } });
    
    // Use a functional update to get the latest sessions state
    const updatedSessions = await new Promise<ChatSession[]>((resolve) => {
      setSessions(currentSessions => {
        const updated = currentSessions.map(s => {
          if (s.id === sessionId) {
            // Find the index of the message to resend
            const messageIndex = s.messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) return s;

            // When resending an earlier message, truncate any messages after that point
            // and replace the target message with the new one. This prevents duplicate
            // message entries and ensures the conversation continues from the edited message.
            const keptMessages = s.messages.slice(0, messageIndex);

            // Recalculate token usage for kept messages
            const keptTokens = keptMessages.reduce((sum, msg) => {
              return sum + (msg.tokenUsage || Math.ceil(msg.content.length / 4));
            }, 0);

            const newMessages = [...keptMessages, newMessage];

            console.log('resendMessage: resending from message', messageId, 'old messages count:', s.messages.length, 'new messages count:', newMessages.length);

            // Calculate token usage for the new message
            const messageTokens = newMessage.tokenUsage || Math.ceil(newMessage.content.length / 4);

            const newSession = {
              ...s,
              messages: newMessages,
              tokenUsage: keptTokens + messageTokens,
            };
            
            return newSession;
          }
          return s;
        });
        
        resolve(updated);
        return updated;
      });
    });
    
    // Save both the individual session file and sessions.json after state update
    if (workspaceId && config) {
      const sessionToSave = updatedSessions.find(s => s.id === sessionId);
      if (sessionToSave) {
        try {
          await config.saveChatSession(workspaceId, sessionToSave);
          await config.saveSessions(workspaceId, updatedSessions);
        } catch (err) {
          console.error('Failed to save session:', err);
        }
      }
    }
  }, [workspaceId]);

  const deleteSession = async (sessionId: string) => {
    if (!config) return;
    const filtered = sessions.filter(s => s.id !== sessionId);
    setSessions(filtered);
    if (currentSessionId === sessionId && filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    }
    if (workspaceId) {
      await config.deleteSession(workspaceId, sessionId);
      // Note: saveSessions is already called inside config.deleteSession, no need to call again
    }
  };

  const renameSession = async (sessionId: string, newName: string) => {
    if (!config) return;
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

  const compactSession = useCallback(async (sessionId: string) => {
    console.log('compactSession called:', { sessionId });
    
    // Keep only system messages (which include the summary)
    const updatedSessions = await new Promise<ChatSession[]>((resolve) => {
      setSessions(currentSessions => {
        const updated = currentSessions.map(s => {
          if (s.id === sessionId) {
            // Filter to keep only system messages
            const systemMessages = s.messages.filter(msg => msg.role === 'system');

            const summaryPrefix = '📝 **会話履歴の要約**';
            const lastHiddenSummaryIndex = systemMessages.reduce((acc, msg, idx) => (
              msg.hidden ? idx : acc
            ), -1);
            const lastVisibleSummaryIndex = systemMessages.reduce((acc, msg, idx) => (
              !msg.hidden && msg.content.trim().startsWith(summaryPrefix) ? idx : acc
            ), -1);

            const dedupedSystemMessages = systemMessages.filter((msg, idx) => {
              if (msg.hidden) {
                return idx === lastHiddenSummaryIndex;
              }
              if (msg.content.trim().startsWith(summaryPrefix)) {
                // Keep only the latest non-hidden summary for backward compatibility
                return idx === lastVisibleSummaryIndex || lastHiddenSummaryIndex === -1;
              }
              return true;
            });
            
            console.log('compactSession: keeping system messages', dedupedSystemMessages.length, 'out of', s.messages.length);
            
            // Recalculate token usage for system messages only
            const systemTokens = dedupedSystemMessages.reduce((sum, msg) => {
              return sum + (msg.tokenUsage || Math.ceil(msg.content.length / 4));
            }, 0);
            
            const newSession = {
              ...s,
              messages: dedupedSystemMessages,
              tokenUsage: systemTokens,
            };
            
            return newSession;
          }
          return s;
        });
        
        resolve(updated);
        return updated;
      });
    });
    
    // Save the compacted session
    if (workspaceId && config) {
      const sessionToSave = updatedSessions.find(s => s.id === sessionId);
      if (sessionToSave) {
        try {
          await config.saveChatSession(workspaceId, sessionToSave);
          await config.saveSessions(workspaceId, updatedSessions);
          console.log('compactSession: saved compacted session');
        } catch (err) {
          console.error('Failed to save compacted session:', err);
        }
      }
    }
  }, [workspaceId]);

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
    resendMessage,
    compactSession,
    getTotalTokens,
    deleteSession,
    renameSession,
    maxSessionsReached: sessions.length >= MAX_SESSIONS,
  };
}
