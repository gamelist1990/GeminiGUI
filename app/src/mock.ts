import { Workspace, ChatSession, ChatMessage } from './types';

export const mockWorkspaces: Workspace[] = [
  {
    id: '1',
    name: 'My Project',
    path: '/home/user/projects/my-project',
    lastOpened: new Date('2024-01-15T10:30:00'),
    isFavorite: true,
  },
  {
    id: '2',
    name: 'Work Project',
    path: '/home/user/work/important-project',
    lastOpened: new Date('2024-01-14T14:20:00'),
    isFavorite: true,
  },
  {
    id: '3',
    name: 'Test Project',
    path: '/home/user/test/test-project',
    lastOpened: new Date('2024-01-10T09:00:00'),
    isFavorite: false,
  },
];

const mockMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'こんにちは！このプロジェクトについて教えてください。',
    timestamp: new Date('2024-01-15T10:30:00'),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'こんにちは！このプロジェクトは、AI Agentと会話できるチャットツールです。IDEに関わらずどの環境でもAIと対話できるGUIアプリケーションを提供します。',
    timestamp: new Date('2024-01-15T10:30:15'),
  },
];

export const mockSessions: ChatSession[] = [
  {
    id: '1',
    name: 'Session 1',
    messages: mockMessages,
    tokenUsage: 150,
    createdAt: new Date('2024-01-15T10:30:00'),
  },
  {
    id: '2',
    name: 'Session 2',
    messages: [],
    tokenUsage: 0,
    createdAt: new Date('2024-01-15T11:00:00'),
  },
];
