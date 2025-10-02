export interface Workspace {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  isFavorite: boolean;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  tokenUsage: number;
  createdAt: Date;
}

export interface GeminiStats {
  models: {
    [modelName: string]: {
      api: {
        totalRequests: number;
        totalErrors: number;
        totalLatencyMs: number;
      };
      tokens: {
        prompt: number;
        candidates: number;
        total: number;
        cached: number;
        thoughts: number;
        tool: number;
      };
    };
  };
  tools: {
    totalCalls: number;
    totalSuccess: number;
    totalFail: number;
    totalDurationMs: number;
    totalDecisions: {
      accept: number;
      reject: number;
      modify: number;
      auto_accept: number;
    };
    byName: Record<string, {
      count: number;
      success: number;
      fail: number;
      durationMs: number;
      decisions: {
        accept: number;
        reject: number;
        modify: number;
        auto_accept: number;
      };
    }>;
  };
  files: {
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  stats?: GeminiStats;
}

export interface Settings {
  language: string;
  theme: 'light' | 'dark';
}

export type Theme = 'light' | 'dark';
export type Language = 'ja_JP' | 'en_US';
