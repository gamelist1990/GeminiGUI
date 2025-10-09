import { readTextFile, writeTextFile, exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { locale } from '@tauri-apps/plugin-os';
import { Settings, ChatSession, Workspace, Language, ToolConfig } from '../types';

// Session metadata type (without messages for efficient loading)
interface SessionMetadata {
  id: string;
  name: string;
  tokenUsage: number;
  createdAt: string; // ISO string
}

const SUPPORTED_LANGUAGE_PREFIXES: Record<string, Language> = {
  ja: 'ja_JP',
  en: 'en_US',
};

async function detectDefaultLanguage(): Promise<Language> {
  try {
    const systemLocale = (await locale())?.toLowerCase();
    if (systemLocale) {
      const prefix = systemLocale.split('-')[0];
      const mapped = SUPPORTED_LANGUAGE_PREFIXES[prefix as keyof typeof SUPPORTED_LANGUAGE_PREFIXES];
      if (mapped) {
        return mapped;
      }
    }
  } catch (error) {
    console.warn('Failed to determine system locale via plugin:', error);
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    const browserLocale = navigator.language.toLowerCase();
    const prefix = browserLocale.split('-')[0];
    const mapped = SUPPORTED_LANGUAGE_PREFIXES[prefix as keyof typeof SUPPORTED_LANGUAGE_PREFIXES];
    if (mapped) {
      return mapped;
    }
  }

  return 'en_US';
}

export class Config {
  private baseDir: string;
  private configFile: string;
  private configBackupFile: string;
  private chatlistDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.configFile = `${this.baseDir}\\config.json`;
    this.configBackupFile = `${this.baseDir}\\config.backup.json`;
    // store chat sessions under Chatrequest/<workspaceId>/<sessionId>.json
    this.chatlistDir = `${this.baseDir}\\Chatrequest`;
  }

  private async buildDefaultSettings(): Promise<Settings> {
    const language = await detectDefaultLanguage();
    
    // Import modern tools to get all tool names
    const { getAllToolNames } = await import('../AITool/modernTools');
    const allToolNames = getAllToolNames();
    
    // Create default tools config with all tools enabled
    const defaultTools: ToolConfig[] = allToolNames.map(toolName => ({
      name: toolName,
      enabled: true, // デフォルトですべて有効
      lastChecked: new Date().toISOString()
    }));
    
    return {
      language,
      theme: 'light',
      approvalMode: 'default',
      model: 'default',
      responseMode: 'async', // Default to async mode
      maxMessagesBeforeCompact: 25,
      geminiAuth: false,
      googleCloudProjectId: undefined, // Google Cloud Project IDのデフォルト値
      tools: defaultTools, // すべてのツールをデフォルトで有効化
      enabledTools: allToolNames, // enabledToolsも初期化
    };
  }

  /**
   * Validate and clean JSON content before parsing
   * @param jsonContent Raw JSON string content
   * @returns Cleaned JSON string
   */
  private cleanJsonContent(jsonContent: string): string {
    // Remove BOM if present
    if (jsonContent.charCodeAt(0) === 0xFEFF) {
      jsonContent = jsonContent.slice(1);
    }
    
    // Remove any null characters or other control characters except newlines and tabs
    jsonContent = jsonContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim whitespace
    jsonContent = jsonContent.trim();
    
    return jsonContent;
  }

  /**
   * Safely parse JSON with error recovery
   * @param jsonContent JSON string to parse
   * @returns Parsed object or null if parsing fails
   */
  private safeJsonParse(jsonContent: string): any | null {
    try {
      const cleanedContent = this.cleanJsonContent(jsonContent);
      
      if (!cleanedContent || cleanedContent.length === 0) {
        console.warn('[Config] Empty JSON content detected');
        return null;
      }
      
      return JSON.parse(cleanedContent);
    } catch (error) {
      console.error('[Config] JSON parse error:', error);
      console.error('[Config] Problematic JSON content (first 500 chars):', jsonContent.substring(0, 500));
      return null;
    }
  }

  /**
   * Create backup of current config file
   */
  private async createConfigBackup(): Promise<void> {
    try {
      const configExists = await exists(this.configFile);
      if (configExists) {
        const content = await readTextFile(this.configFile);
        await writeTextFile(this.configBackupFile, content);
        console.log('[Config] Backup created successfully');
      }
    } catch (error) {
      console.warn('[Config] Failed to create backup:', error);
    }
  }

  /**
   * Restore config from backup if available
   */
  private async restoreFromBackup(): Promise<Settings | null> {
    try {
      const backupExists = await exists(this.configBackupFile);
      if (backupExists) {
        console.log('[Config] Attempting to restore from backup');
        const backupContent = await readTextFile(this.configBackupFile);
        const parsedBackup = this.safeJsonParse(backupContent);
        
        if (parsedBackup) {
          console.log('[Config] Successfully restored from backup');
          // Save the restored backup as the main config
          await this.saveConfig(parsedBackup);
          return parsedBackup;
        }
      }
    } catch (error) {
      console.warn('[Config] Failed to restore from backup:', error);
    }
    return null;
  }

  /**
   * Validate tools array and remove non-existent tools
   * @param configTools Tools from config.json
   * @returns Validated and cleaned tools array
   * @deprecated Modern tools system uses MODERN_TOOLS directly
   */
  private async validateAndCleanupTools(configTools: ToolConfig[]): Promise<ToolConfig[]> {
    try {
      // Modern tools system: Use MODERN_TOOLS from AITool/modernTools
      const { getAllToolNames } = await import('../AITool/modernTools');
      const availableToolNames = new Set(getAllToolNames());
      
      // Filter out tools that no longer exist
      const validatedTools = configTools.filter(tool => {
        const exists = availableToolNames.has(tool.name);
        if (!exists) {
          console.log(`[Config] Removing non-existent tool from config: ${tool.name}`);
        }
        return exists;
      });
      
      // Add lastChecked timestamp to validated tools
      const now = new Date().toISOString();
      return validatedTools.map(tool => ({
        ...tool,
        lastChecked: now
      }));
    } catch (error) {
      console.error('[Config] Error validating tools:', error);
      // Return original tools on error to prevent data loss
      return configTools;
    }
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

  // Save settings to config.json with atomic write and backup
  async saveConfig(settings: Settings): Promise<void> {
    await this.ensureDir(this.baseDir);
    
    // Create backup before saving new config
    await this.createConfigBackup();
    
    const json = JSON.stringify(settings, null, 2);
    
    // Verify JSON is valid before writing
    try {
      JSON.parse(json);
    } catch (error) {
      throw new Error(`[Config] Generated invalid JSON: ${error}`);
    }
    
    await writeTextFile(this.configFile, json);
    console.log('[Config] Configuration saved successfully');
  }

  // Load settings from config.json with enhanced error recovery
  async loadConfig(): Promise<Settings | null> {
    try {
      const existsConfig = await exists(this.configFile);
      if (!existsConfig) {
        console.log('[Config] Config file does not exist, creating default');
        const defaultSettings = await this.buildDefaultSettings();
        await this.saveConfig(defaultSettings);
        return defaultSettings;
      }
      
      const json = await readTextFile(this.configFile);
      console.log('[Config] Raw config file length:', json.length);
      
      const parsedSettings = this.safeJsonParse(json);
      
      if (!parsedSettings) {
        console.warn('[Config] Failed to parse config file, attempting backup recovery');
        
        // Try to restore from backup
        const restoredSettings = await this.restoreFromBackup();
        if (restoredSettings) {
          return restoredSettings;
        }
        
        // If backup also fails, create new default config
        console.warn('[Config] Backup recovery failed, creating new default config');
        const defaultSettings = await this.buildDefaultSettings();
        await this.saveConfig(defaultSettings);
        return defaultSettings;
      }
      
      // Merge with default settings to ensure all required fields are present
      const defaultSettings = await this.buildDefaultSettings();
      const finalSettings = { ...defaultSettings, ...parsedSettings };
      
      // Validate and clean up tools array
      if (finalSettings.tools) {
        finalSettings.tools = await this.validateAndCleanupTools(finalSettings.tools);
      }
      
      console.log('[Config] Configuration loaded successfully');
      return finalSettings;
      
    } catch (error: any) {
      console.error('[Config] Failed to load config:', error);
      
      // Try to restore from backup first
      const restoredSettings = await this.restoreFromBackup();
      if (restoredSettings) {
        return restoredSettings;
      }
      
      // Last resort: create fresh default config
      try {
        await this.ensureDir(this.baseDir);
        const defaultSettings = await this.buildDefaultSettings();
        try {
          await writeTextFile(this.configFile, JSON.stringify(defaultSettings, null, 2));
          console.log('[Config] Created fresh default configuration');
        } catch (err) {
          console.warn('[Config] Could not write default config file, but returning defaults:', err);
        }
        return defaultSettings;
      } catch (err) {
        console.error('[Config] Failed to recover config by creating defaults:', err);
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