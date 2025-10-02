import { useState, useEffect } from 'react';
import { Workspace } from '../types';
import { Config } from '../utils/configAPI';
import { documentDir } from '@tauri-apps/api/path';


export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    (async () => {
      if (!config) {
        const baseDir = await documentDir();
        const configPath = `${baseDir}\\GeminiGUI`;
        const configInstance = new Config(configPath);
        setConfig(configInstance);
      }
    })();
  }, [config]);

  useEffect(() => {
    if (config) {
      (async () => {
        const loaded = await config.loadWorkspaces();
        setWorkspaces(loaded.length > 0 ? loaded : []);
      })();
    }
  }, [config]);

  const addWorkspace = async (workspace: Workspace) => {
    if (!config) return;
    // Check if workspace with same path already exists
    const exists = workspaces.some((w: Workspace) => w.path === workspace.path);
    if (exists) {
      // Update lastOpened for existing workspace
      updateLastOpened(workspaces.find((w: Workspace) => w.path === workspace.path)!.id);
      return;
    }
    const updated = [...workspaces, workspace];
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const toggleFavorite = async (id: string) => {
    if (!config) return;
    const updated = workspaces.map((w: Workspace) =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    );
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const updateLastOpened = async (id: string) => {
    if (!config) return;
    const updated = workspaces.map((w: Workspace) =>
      w.id === id ? { ...w, lastOpened: new Date() } : w
    );
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const recentWorkspaces = [...workspaces]
    .sort((a, b) => b.lastOpened.getTime() - a.lastOpened.getTime())
    .slice(0, 5);

  const favoriteWorkspaces = workspaces.filter((w: Workspace) => w.isFavorite);

  return {
    workspaces,
    recentWorkspaces,
    favoriteWorkspaces,
    addWorkspace,
    toggleFavorite,
    updateLastOpened,
  };
}
