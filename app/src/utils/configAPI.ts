import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { Settings, ChatSession, Workspace } from '../types';

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
      const command = Command.create('cmd', ['/c', 'mkdir', dirPath, '/p']);
      await command.execute();
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
        const defaultSettings: Settings = { language: 'en_US', theme: 'light' };
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
        const defaultSettings: Settings = { language: 'en_US', theme: 'light' };
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

  // Save chat session to chatlist/workspaceName/sessionId.json
  async saveChatSession(workspaceId: string, session: ChatSession): Promise<void> {
    const workspaceDir = `${this.chatlistDir}\\${workspaceId}`;
    await this.ensureDir(workspaceDir);
    const sessionFile = `${workspaceDir}\\${session.id}.json`;
    const json = JSON.stringify(session, null, 2);
    await writeTextFile(sessionFile, json);
  }

  // Load chat session from chatlist/workspaceName/sessionId.json
  async loadChatSession(workspaceId: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionFile = `${this.chatlistDir}\\${workspaceId}\\${sessionId}.json`;
      const existsSession = await exists(sessionFile);
      if (!existsSession) return null;
      const json = await readTextFile(sessionFile);
      return JSON.parse(json);
    } catch (error) {
      console.error('Failed to load chat session:', error);
      return null;
    }
  }

  // List all workspaces in chatlist/
  async listWorkspaces(): Promise<string[]> {
    try {
      const command = Command.create('cmd', ['/c', 'dir', '/b', '/ad', this.chatlistDir]);
      const output = await command.execute();
      if (output.code === 0) {
        return output.stdout.trim().split('\n').filter(name => name.trim() !== '');
      }
      return [];
    } catch (error) {
      console.error('Failed to list workspaces:', error);
      return [];
    }
  }

  // List all sessions for a workspace
  async listSessionsForWorkspace(workspaceId: string): Promise<string[]> {
    try {
      const workspaceDir = `${this.chatlistDir}\\${workspaceId}`;
      const command = Command.create('cmd', ['/c', 'dir', '/b', `${workspaceDir}\\*.json`]);
      const output = await command.execute();
      if (output.code === 0) {
        return output.stdout.trim().split('\n').filter(name => name.trim() !== '').map(name => name.replace('.json', ''));
      }
      return [];
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  // Save sessions for a workspace
  async saveSessions(workspaceId: string, sessions: ChatSession[]): Promise<void> {
    const sessionsFile = `${this.chatlistDir}\\${workspaceId}\\sessions.json`;
    await this.ensureDir(`${this.chatlistDir}\\${workspaceId}`);
    const json = JSON.stringify(sessions, null, 2);
    await writeTextFile(sessionsFile, json);
  }

  // Load sessions for a workspace
  async loadSessions(workspaceId: string): Promise<ChatSession[]> {
    try {
      const sessionsFile = `${this.chatlistDir}\\${workspaceId}\\sessions.json`;
      const existsSessions = await exists(sessionsFile);
      if (!existsSessions) return [];
      const json = await readTextFile(sessionsFile);
      const sessions = JSON.parse(json);
      // Convert date strings back to Date objects
      return sessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        messages: s.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      }));
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  }

  // Delete a single session file and update sessions.json if present
  async deleteSession(workspaceId: string, sessionId: string): Promise<boolean> {
    try {
      const workspaceDir = `${this.chatlistDir}\\${workspaceId}`;
      const sessionFile = `${workspaceDir}\\${sessionId}.json`;
      // Use cmd del to remove the file on Windows
      const command = Command.create('cmd', ['/c', 'del', '/Q', sessionFile]);
      await command.execute();
      // Update sessions.json
      const sessions = await this.loadSessions(workspaceId);
      const filtered = sessions.filter(s => s.id !== sessionId);
      await this.saveSessions(workspaceId, filtered);
      return true;
    } catch (error) {
      console.error('Failed to delete session file:', error);
      return false;
    }
  }
}