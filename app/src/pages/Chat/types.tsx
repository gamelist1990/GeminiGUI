import { ChatSession, ChatMessage, Workspace, Settings } from "../../types";

export interface ChatProps {
  workspace: Workspace;
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  currentSessionId: string;
  maxSessionsReached: boolean;
  approvalMode: "default" | "auto_edit" | "yolo";
  responseMode: "async" | "stream"; // Response processing mode
  totalTokens: number;
  customApiKey?: string;
  googleCloudProjectId?: string;
  maxMessagesBeforeCompact: number;
  globalConfig: any; // Config instance from configAPI
  settings: Settings; // Full settings object for AI provider selection
  onCreateNewSession: () => Promise<boolean>;
  onSwitchSession: (id: string) => void;
  onSendMessage: (sessionId: string, message: ChatMessage) => void;
  onResendMessage: (
    sessionId: string,
    messageId: string,
    newMessage: ChatMessage
  ) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newName: string) => void;
  onCompactSession: (sessionId: string) => Promise<void>;
  onBack: () => void;
}

export interface ProcessingModalProps {
  message: string;
  elapsedSeconds: number;
}

export interface StatsModalProps {
  sessions: ChatSession[];
  totalTokens: number;
  onClose: () => void;
}

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  workspace: Workspace;
  onResendMessage?: (newMessage: ChatMessage) => void;
}