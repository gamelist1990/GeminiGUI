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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Settings {
  language: string;
  theme: 'light' | 'dark';
}

export type Theme = 'light' | 'dark';
export type Language = 'ja_JP' | 'en_US';
