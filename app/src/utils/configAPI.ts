import { readTextFile, writeTextFile, exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { Settings, ChatSession, Workspace } from '../types';

// Session metadata type (without messages for efficient loading)
interface SessionMetadata {
  id: string;
  name: string;
  tokenUsage: number;
  createdAt: string; // ISO string
}

export class Config {
  private baseDir: string;
  private configFile: string;
  private chatlistDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.configFile = `${this.baseDir}\\config.json`;
    // store chat sessions under Chatrequest/<workspaceId>/<sessionId>.json
    this.chatlistDir = `${this.baseDir}\\Chatrequest`;
  }

  // Ensure directory exists
  private async ensureDir(dirPath: string): Promise<void> {
    const dirExists = await exists(dirPath);
    if (!dirExists) {
      try {
        // plugin exports mkdir (not createDir). Use recursive option to mimic mkdir -p behavior
        await mkdir(dirPath, { recursive: true });
      } catch (err) {
        // Fallback: some platforms might not support mkdir through the plugin; ignore and let callers handle errors
        console.warn('mkdir failed for', dirPath, err);
      }
    }
  }

  // Save settings to config.json
  async saveConfig(settings: Settings): Promise<void> {
    await this.ensureDir(this.baseDir);
    const json = JSON.stringify(settings, null, 2);
    await writeTextFile(this.configFile, json);
  }

  // Load settings from config.json
  async loadConfig(): Promise<Settings | null> {
    try {
      const existsConfig = await exists(this.configFile);
      if (!existsConfig) {
        // If config file doesn't exist, create default config
        const defaultSettings: Settings = { 
          language: 'en_US', 
          theme: 'light', 
          approvalMode: 'default', 
          model: 'default', 
          maxMessagesBeforeCompact: 25,
          geminiAuth: false
        };
        await this.saveConfig(defaultSettings);
        return defaultSettings;
      }
      const json = await readTextFile(this.configFile);
      return JSON.parse(json);
    } catch (error: any) {
      console.error('Failed to load config:', error);
      // No local fallback available; try to ensure base dir and create default config file
      // Try to ensure base dir and create default config, if possible
      try {
        await this.ensureDir(this.baseDir);
        const defaultSettings: Settings = { 
          language: 'en_US', 
          theme: 'light', 
          approvalMode: 'default', 
          model: 'default', 
          maxMessagesBeforeCompact: 25,
          geminiAuth: false
        };
        try {
          await writeTextFile(this.configFile, JSON.stringify(defaultSettings, null, 2));
        } catch (err) {
          console.warn('Could not write default config file, but returning defaults:', err);
        }
        return defaultSettings;
      } catch (err) {
        console.error('Failed to recover config by creating defaults:', err);
        return null;
      }
    }
  }

  // Save workspaces list to a workspaces.json file
  async saveWorkspaces(workspaces: Workspace[]): Promise<void> {
    await this.ensureDir(this.baseDir);
    const file = `${this.baseDir}\\workspaces.json`;
    const json = JSON.stringify(workspaces, null, 2);
    await writeTextFile(file, json);
  }

  // Load workspaces list from workspaces.json
  async loadWorkspaces(): Promise<Workspace[]> {
    try {
      const file = `${this.baseDir}\\workspaces.json`;
      const existsFile = await exists(file);
      if (!existsFile) return [];
      const json = await readTextFile(file);
      const workspaces = JSON.parse(json);
      return workspaces.map((w: any) => ({ ...w, lastOpened: new Date(w.lastOpened) }));
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      return [];
    }
  }

  // Save chat session to chatlist/workspaceName/sessions/sessionId.json
  async saveChatSession(workspaceId: string, session: ChatSession): Promise<void> {
    const sessionsDir = `${this.chatlistDir}\\${workspaceId}\\sessions`;
    await this.ensureDir(sessionsDir);
    const sessionFile = `${sessionsDir}\\${session.id}.json`;
    console.log('saveChatSession: saving to', sessionFile, 'messages count:', session.messages.length);
    const json = JSON.stringify(session, null, 2);
    await writeTextFile(sessionFile, json);
    console.log('saveChatSession: saved successfully');
  }

  // Load chat session from chatlist/workspaceName/sessions/sessionId.json
  async loadChatSession(workspaceId: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionFile = `${this.chatlistDir}\\${workspaceId}\\sessions\\${sessionId}.json`;
      const existsSession = await exists(sessionFile);
      if (!existsSession) return null;
      const json = await readTextFile(sessionFile);
      const session = JSON.parse(json);
      // Convert date strings back to Date objects
      return {
        ...session,
        createdAt: new Date(session.createdAt),
        messages: session.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      };
    } catch (error) {
      console.error('Failed to load chat session:', error);
      return null;
    }
  }

  // Save sessions metadata for a workspace (without messages for efficiency)
  async saveSessions(workspaceId: string, sessions: ChatSession[]): Promise<void> {
    const sessionsFile = `${this.chatlistDir}\\${workspaceId}\\sessions.json`;
    await this.ensureDir(`${this.chatlistDir}\\${workspaceId}`);
    
    // Convert to metadata format (without messages)
    const metadata: SessionMetadata[] = sessions.map(s => ({
      id: s.id,
      name: s.name,
      tokenUsage: s.tokenUsage,
      createdAt: s.createdAt.toISOString(),
    }));
    
    const json = JSON.stringify(metadata, null, 2);
    await writeTextFile(sessionsFile, json);
  }

  // Load sessions metadata for a workspace (without messages for efficiency)
  async loadSessions(workspaceId: string): Promise<ChatSession[]> {
    try {
      const sessionsFile = `${this.chatlistDir}\\${workspaceId}\\sessions.json`;
      const existsSessions = await exists(sessionsFile);
      if (!existsSessions) return [];
      const json = await readTextFile(sessionsFile);
      const metadata: SessionMetadata[] = JSON.parse(json);
      
      // Convert metadata to ChatSession objects (messages will be loaded on demand)
      const sessions: ChatSession[] = await Promise.all(
        metadata.map(async (meta) => {
          const fullSession = await this.loadChatSession(workspaceId, meta.id);
          return fullSession || {
            id: meta.id,
            name: meta.name,
            messages: [],
            tokenUsage: meta.tokenUsage,
            createdAt: new Date(meta.createdAt),
          };
        })
      );
      
      return sessions;
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  }

  // Delete a session from sessions.json
  async deleteSession(workspaceId: string, sessionId: string): Promise<boolean> {
    try {
      // Delete individual session file first
      await this.deleteChatSession(workspaceId, sessionId);

      // Update sessions.json
      const sessions = await this.loadSessions(workspaceId);
      const filtered = sessions.filter(s => s.id !== sessionId);
      await this.saveSessions(workspaceId, filtered);

      // Clean up empty directories
      await this.cleanupEmptyDirectories(workspaceId);

      return true;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  // Delete individual chat session file
  async deleteChatSession(workspaceId: string, sessionId: string): Promise<void> {
    try {
      const sessionFile = `${this.chatlistDir}\\${workspaceId}\\sessions\\${sessionId}.json`;
      const fileExists = await exists(sessionFile);
      if (fileExists) {
        await remove(sessionFile);
      }
    } catch (error) {
      console.error('Failed to delete chat session file:', error);
    }
  }

  // Clean up empty directories after session deletion
  private async cleanupEmptyDirectories(workspaceId: string): Promise<void> {
    try {
      const sessionsDir = `${this.chatlistDir}\\${workspaceId}\\sessions`;
      const workspaceDir = `${this.chatlistDir}\\${workspaceId}`;

      // Check if sessions directory is empty
      const sessionsDirExists = await exists(sessionsDir);
      if (sessionsDirExists) {
        // Note: Tauri FS plugin doesn't have readdir, so we can't check if directory is empty
        // We'll try to remove it and ignore errors if it's not empty
        try {
          await remove(sessionsDir);
          console.log('Cleaned up empty sessions directory:', sessionsDir);
        } catch (error) {
          // Directory is not empty or removal failed, which is fine
          console.log('Sessions directory not empty or removal failed, keeping it');
        }
      }

      // Check if workspace directory is empty (only contains sessions.json if any)
      const workspaceDirExists = await exists(workspaceDir);
      if (workspaceDirExists) {
        const sessionsJsonFile = `${workspaceDir}\\sessions.json`;
        const sessionsJsonExists = await exists(sessionsJsonFile);

        // If sessions.json doesn't exist or is empty, try to remove workspace directory
        if (!sessionsJsonExists) {
          try {
            await remove(workspaceDir);
            console.log('Cleaned up empty workspace directory:', workspaceDir);
          } catch (error) {
            // Directory is not empty or removal failed
            console.log('Workspace directory not empty or removal failed, keeping it');
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup directories:', error);
    }
  }
}