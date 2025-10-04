import { ChatSession, ChatMessage, Workspace } from "../../types";

export interface ChatProps {
  workspace: Workspace;
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  currentSessionId: string;
  maxSessionsReached: boolean;
  approvalMode: "default" | "auto_edit" | "yolo";
  totalTokens: number;
  customApiKey?: string;
  googleCloudProjectId?: string;
  maxMessagesBeforeCompact: number;
  globalConfig: any; // Config instance from configAPI
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