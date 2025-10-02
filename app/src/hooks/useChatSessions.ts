import { useState, useEffect, useCallback } from 'react';
import { ChatSession, ChatMessage } from '../types';
import { Config } from '../utils/configAPI';

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
        const finalSessions = loaded.length > 0 ? loaded : [];
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
    if (workspaceId) {
      await config.saveChatSession(workspaceId, newSession);
      await config.saveSessions(workspaceId, updated);
    }
    return true;
  };

  const addMessage = useCallback(async (sessionId: string, message: ChatMessage) => {
    setSessions(currentSessions => {
      const updated = currentSessions.map(s => {
        if (s.id === sessionId) {
          const newMessages = [...s.messages, message];
          const newSession = {
            ...s,
            messages: newMessages,
            tokenUsage: s.tokenUsage + (message.content.length * 0.5), // Mock token calculation
          };
          // Save individual session with messages
          if (workspaceId) {
            config.saveChatSession(workspaceId, newSession);
          }
          return newSession;
        }
        return s;
      });
      
      // Save sessions metadata
      if (workspaceId) {
        config.saveSessions(workspaceId, updated);
      }
      
      return updated;
    });
  }, [workspaceId]);

  const deleteSession = async (sessionId: string) => {
    const filtered = sessions.filter(s => s.id !== sessionId);
    setSessions(filtered);
    if (currentSessionId === sessionId && filtered.length > 0) {
      setCurrentSessionId(filtered[0].id);
    }
    if (workspaceId) {
      await config.deleteSession(workspaceId, sessionId);
    }
  };

  const renameSession = async (sessionId: string, newName: string) => {
    const updated = sessions.map(s => {
      if (s.id === sessionId) {
        const renamedSession = { ...s, name: newName };
        // Save individual session with updated name
        if (workspaceId) {
          config.saveChatSession(workspaceId, renamedSession);
        }
        return renamedSession;
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

  const getAggregatedStats = () => {
    if (!currentSession) return null;

    const stats = {
      models: {} as any,
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        byName: {} as any,
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    currentSession.messages.forEach(msg => {
      if (msg.stats) {
        // Aggregate model stats
        Object.entries(msg.stats.models).forEach(([modelName, modelData]) => {
          if (!stats.models[modelName]) {
            stats.models[modelName] = {
              api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
              tokens: { prompt: 0, candidates: 0, total: 0, cached: 0, thoughts: 0, tool: 0 },
            };
          }
          stats.models[modelName].api.totalRequests += modelData.api.totalRequests;
          stats.models[modelName].api.totalErrors += modelData.api.totalErrors;
          stats.models[modelName].api.totalLatencyMs += modelData.api.totalLatencyMs;
          stats.models[modelName].tokens.prompt += modelData.tokens.prompt;
          stats.models[modelName].tokens.candidates += modelData.tokens.candidates;
          stats.models[modelName].tokens.total += modelData.tokens.total;
          stats.models[modelName].tokens.cached += modelData.tokens.cached;
          stats.models[modelName].tokens.thoughts += modelData.tokens.thoughts;
          stats.models[modelName].tokens.tool += modelData.tokens.tool;
        });

        // Aggregate tool stats
        stats.tools.totalCalls += msg.stats.tools.totalCalls;
        stats.tools.totalSuccess += msg.stats.tools.totalSuccess;
        stats.tools.totalFail += msg.stats.tools.totalFail;
        stats.tools.totalDurationMs += msg.stats.tools.totalDurationMs;

        Object.entries(msg.stats.tools.byName).forEach(([toolName, toolData]) => {
          if (!stats.tools.byName[toolName]) {
            stats.tools.byName[toolName] = {
              count: 0,
              success: 0,
              fail: 0,
              durationMs: 0,
            };
          }
          stats.tools.byName[toolName].count += toolData.count;
          stats.tools.byName[toolName].success += toolData.success;
          stats.tools.byName[toolName].fail += toolData.fail;
          stats.tools.byName[toolName].durationMs += toolData.durationMs;
        });

        // Aggregate file stats
        stats.files.totalLinesAdded += msg.stats.files.totalLinesAdded;
        stats.files.totalLinesRemoved += msg.stats.files.totalLinesRemoved;
      }
    });

    return stats;
  };

  return {
    sessions,
    currentSession,
    currentSessionId,
    setCurrentSessionId,
    createNewSession,
    addMessage,
    getTotalTokens,
    getAggregatedStats,
    deleteSession,
    renameSession,
    maxSessionsReached: sessions.length >= MAX_SESSIONS,
  };
}
