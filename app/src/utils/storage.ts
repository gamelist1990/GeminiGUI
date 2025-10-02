import { Settings, Workspace } from '../types';
import { Config } from './configAPI';

// Delegate to Config class (file-backed storage)
const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

export function saveSettings(settings: Settings): void {
  // fire-and-forget async write
  void config.saveConfig(settings);
}

export function loadSettings(): Settings | null {
  // synchronous fallback: attempt to return null and let callers use async Config where available
  return null;
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  void config.saveWorkspaces(workspaces);
}

export function loadWorkspaces(): Workspace[] {
  // synchronous wrapper is not available; return empty and let hooks use async Config
  return [];
}

export function formatElapsedTime(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
