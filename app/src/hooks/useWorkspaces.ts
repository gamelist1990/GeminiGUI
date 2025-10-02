import { useState, useEffect } from 'react';
import { Workspace } from '../types';
import { loadWorkspaces, saveWorkspaces } from '../utils/storage';
import { mockWorkspaces } from '../mock';

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    const loaded = loadWorkspaces();
    // Use mock data if no workspaces saved
    setWorkspaces(loaded.length > 0 ? loaded : mockWorkspaces);
  }, []);

  const addWorkspace = (workspace: Workspace) => {
    const updated = [...workspaces, workspace];
    setWorkspaces(updated);
    saveWorkspaces(updated);
  };

  const toggleFavorite = (id: string) => {
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    );
    setWorkspaces(updated);
    saveWorkspaces(updated);
  };

  const updateLastOpened = (id: string) => {
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, lastOpened: new Date() } : w
    );
    setWorkspaces(updated);
    saveWorkspaces(updated);
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
