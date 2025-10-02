import { useState, useEffect } from 'react';
import { Workspace } from '../types';
import { Config } from '../utils/configAPI';

const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    (async () => {
      const loaded = await config.loadWorkspaces();
      setWorkspaces(loaded.length > 0 ? loaded : []);
    })();
  }, []);

  const addWorkspace = async (workspace: Workspace) => {
    // Check if workspace with same path already exists
    const exists = workspaces.some(w => w.path === workspace.path);
    if (exists) {
      // Update lastOpened for existing workspace
      updateLastOpened(workspaces.find(w => w.path === workspace.path)!.id);
      return;
    }
    const updated = [...workspaces, workspace];
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const toggleFavorite = async (id: string) => {
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    );
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const updateLastOpened = async (id: string) => {
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, lastOpened: new Date() } : w
    );
    setWorkspaces(updated);
    await config.saveWorkspaces(updated);
  };

  const recentWorkspaces = [...workspaces]
    .sort((a, b) => b.lastOpened.getTime() - a.lastOpened.getTime())
    .slice(0, 5);

  const favoriteWorkspaces = workspaces.filter(w => w.isFavorite);

  return {
    workspaces,
    recentWorkspaces,
    favoriteWorkspaces,
    addWorkspace,
    toggleFavorite,
    updateLastOpened,
  };
}
