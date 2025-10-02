import { Settings, Workspace } from '../types';

const SETTINGS_KEY = 'gemini-gui-settings';
const WORKSPACES_KEY = 'gemini-gui-workspaces';

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSettings(): Settings | null {
  const data = localStorage.getItem(SETTINGS_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}

export function loadWorkspaces(): Workspace[] {
  const data = localStorage.getItem(WORKSPACES_KEY);
  if (data) {
    const workspaces = JSON.parse(data);
    // Convert date strings back to Date objects
    return workspaces.map((w: any) => ({
      ...w,
      lastOpened: new Date(w.lastOpened),
    }));
  }
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
