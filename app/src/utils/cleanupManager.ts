import { exists, remove } from '@tauri-apps/plugin-fs';

/**
 * Global Cleanup Manager
 * Manages temporary files across multiple sessions and workspaces
 * Provides automatic cleanup of unused temporary files
 */

interface CleanupEntry {
  path: string;
  workspaceId: string;
  sessionId: string;
  createdAt: number;
  type: 'file' | 'directory';
}

class CleanupManager {
  private static instance: CleanupManager;
  private registry: Map<string, CleanupEntry> = new Map();
  private cleanupInterval: number | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // Check every 1 minute
  private readonly MAX_AGE_MS = 10 * 60 * 1000; // Delete files older than 10 minutes

  private constructor() {
    this.startAutoCleanup();
  }

  static getInstance(): CleanupManager {
    if (!CleanupManager.instance) {
      CleanupManager.instance = new CleanupManager();
    }
    return CleanupManager.instance;
  }

  /**
   * Register a temporary file or directory for cleanup
   */
  register(path: string, workspaceId: string, sessionId: string, type: 'file' | 'directory' = 'file'): void {
    const key = this.getKey(path, workspaceId, sessionId);
    this.registry.set(key, {
      path,
      workspaceId,
      sessionId,
      createdAt: Date.now(),
      type,
    });
    console.log(`[CleanupManager] Registered ${type}: ${path} (workspace: ${workspaceId}, session: ${sessionId})`);
  }

  /**
   * Unregister a path (e.g., when manually cleaned up)
   */
  unregister(path: string, workspaceId: string, sessionId: string): void {
    const key = this.getKey(path, workspaceId, sessionId);
    this.registry.delete(key);
    console.log(`[CleanupManager] Unregistered: ${path}`);
  }

  /**
   * Mark a session as completed and immediately cleanup its files
   */
  async cleanupSession(sessionId: string, workspaceId?: string): Promise<void> {
    console.log(`[CleanupManager] Cleaning up session: ${sessionId} (workspace: ${workspaceId || 'any'})`);
    const toCleanup: CleanupEntry[] = [];

    for (const [key, entry] of this.registry.entries()) {
      if (entry.sessionId === sessionId && (!workspaceId || entry.workspaceId === workspaceId)) {
        toCleanup.push(entry);
        this.registry.delete(key);
      }
    }

    await this.cleanupEntries(toCleanup);
  }

  /**
   * Cleanup all temporary files for a workspace
   */
  async cleanupWorkspace(workspaceId: string): Promise<void> {
    console.log(`[CleanupManager] Cleaning up workspace: ${workspaceId}`);
    const toCleanup: CleanupEntry[] = [];

    for (const [key, entry] of this.registry.entries()) {
      if (entry.workspaceId === workspaceId) {
        toCleanup.push(entry);
        this.registry.delete(key);
      }
    }

    await this.cleanupEntries(toCleanup);
  }

  /**
   * Start automatic cleanup of old files
   */
  private startAutoCleanup(): void {
    if (this.cleanupInterval !== null) {
      return; // Already running
    }

    console.log('[CleanupManager] Starting auto-cleanup task');
    this.cleanupInterval = window.setInterval(() => {
      this.performAutoCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[CleanupManager] Stopped auto-cleanup task');
    }
  }

  /**
   * Perform automatic cleanup of old files
   */
  private async performAutoCleanup(): Promise<void> {
    const now = Date.now();
    const toCleanup: CleanupEntry[] = [];

    console.log(`[CleanupManager] Running auto-cleanup check (${this.registry.size} entries)`);

    for (const [key, entry] of this.registry.entries()) {
      const age = now - entry.createdAt;
      if (age > this.MAX_AGE_MS) {
        console.log(`[CleanupManager] Marking for cleanup (age: ${Math.floor(age / 1000)}s): ${entry.path}`);
        toCleanup.push(entry);
        this.registry.delete(key);
      }
    }

    if (toCleanup.length > 0) {
      await this.cleanupEntries(toCleanup);
      console.log(`[CleanupManager] Auto-cleanup completed: ${toCleanup.length} items cleaned`);
    }
  }

  /**
   * Cleanup a list of entries
   */
  private async cleanupEntries(entries: CleanupEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        const pathExists = await exists(entry.path);
        if (!pathExists) {
          console.log(`[CleanupManager] Path already removed: ${entry.path}`);
          continue;
        }

        if (entry.type === 'directory') {
          await this.cleanupDirectory(entry.path);
        } else {
          await remove(entry.path);
          console.log(`[CleanupManager] Removed file: ${entry.path}`);
        }
      } catch (error) {
        console.error(`[CleanupManager] Failed to cleanup ${entry.path}:`, error);
      }
    }
  }

  /**
   * Recursively cleanup a directory
   */
  private async cleanupDirectory(path: string): Promise<void> {
    try {
      const pathExists = await exists(path);
      if (!pathExists) {
        return;
      }

      await remove(path, { recursive: true });
      console.log(`[CleanupManager] Removed directory: ${path}`);
    } catch (error) {
      console.error(`[CleanupManager] Failed to cleanup directory ${path}:`, error);
    }
  }

  /**
   * Generate a unique key for registry
   */
  private getKey(path: string, workspaceId: string, sessionId: string): string {
    return `${workspaceId}:${sessionId}:${path}`;
  }

  /**
   * Get cleanup statistics
   */
  getStats(): { totalEntries: number; oldestAge: number; youngestAge: number } {
    const now = Date.now();
    let oldestAge = 0;
    let youngestAge = Infinity;

    for (const entry of this.registry.values()) {
      const age = now - entry.createdAt;
      if (age > oldestAge) oldestAge = age;
      if (age < youngestAge) youngestAge = age;
    }

    return {
      totalEntries: this.registry.size,
      oldestAge: Math.floor(oldestAge / 1000),
      youngestAge: youngestAge === Infinity ? 0 : Math.floor(youngestAge / 1000),
    };
  }

  /**
   * Manual cleanup of all registered entries
   */
  async cleanupAll(): Promise<void> {
    console.log('[CleanupManager] Cleaning up all registered entries');
    const entries = Array.from(this.registry.values());
    this.registry.clear();
    await this.cleanupEntries(entries);
  }
}

// Export singleton instance
export const cleanupManager = CleanupManager.getInstance();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cleanupManager.stopAutoCleanup();
  });
}
