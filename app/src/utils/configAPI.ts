import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { Settings, ChatSession } from '../types';

export class Config {
  private baseDir: string;
  private configFile: string;
  private chatlistDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.configFile = `${this.baseDir}\\config.json`;
    this.chatlistDir = `${this.baseDir}\\chatlist`;
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
      if (!existsConfig) return null;
      const json = await readTextFile(this.configFile);
      return JSON.parse(json);
    } catch (error) {
      console.error('Failed to load config:', error);
      return null;
    }
  }

  // Save chat session to chatlist/workspaceName/sessionId.json
  async saveChatSession(workspaceName: string, session: ChatSession): Promise<void> {
    const workspaceDir = `${this.chatlistDir}\\${workspaceName}`;
    await this.ensureDir(workspaceDir);
    const sessionFile = `${workspaceDir}\\${session.id}.json`;
    const json = JSON.stringify(session, null, 2);
    await writeTextFile(sessionFile, json);
  }

  // Load chat session from chatlist/workspaceName/sessionId.json
  async loadChatSession(workspaceName: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionFile = `${this.chatlistDir}\\${workspaceName}\\${sessionId}.json`;
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
  async listSessionsForWorkspace(workspaceName: string): Promise<string[]> {
    try {
      const workspaceDir = `${this.chatlistDir}\\${workspaceName}`;
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
  async saveSessions(workspaceName: string, sessions: ChatSession[]): Promise<void> {
    const sessionsFile = `${this.chatlistDir}\\${workspaceName}\\sessions.json`;
    await this.ensureDir(`${this.chatlistDir}\\${workspaceName}`);
    const json = JSON.stringify(sessions, null, 2);
    await writeTextFile(sessionsFile, json);
  }

  // Load sessions for a workspace
  async loadSessions(workspaceName: string): Promise<ChatSession[]> {
    try {
      const sessionsFile = `${this.chatlistDir}\\${workspaceName}\\sessions.json`;
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
}