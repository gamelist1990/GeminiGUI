import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Workspace } from '../types';
import { t } from '../utils/i18n';
import './WorkspaceSelection.css';

interface WorkspaceSelectionProps {
  recentWorkspaces: Workspace[];
  favoriteWorkspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenSettings: () => void;
  onToggleFavorite: (id: string) => void;
}

export default function WorkspaceSelection({
  recentWorkspaces,
  favoriteWorkspaces,
  onSelectWorkspace,
  onOpenSettings,
  onToggleFavorite,
}: WorkspaceSelectionProps) {
  const [isOpening, setIsOpening] = useState(false);

  // Filter out favorite workspaces from recent workspaces to avoid duplicates
  // Dedupe by id: keep favorite order, then recent unique by id
  const favoriteIds = new Set(favoriteWorkspaces.map(f => f.id));
  const filteredRecentWorkspaces = recentWorkspaces.filter(r => !favoriteIds.has(r.id));

  // Additionally guard against duplicate ids within same list (sometimes generated ids may collide)
  const uniqueFavorites = Array.from(new Map(favoriteWorkspaces.map(f => [f.id, f])).values());
  const uniqueRecents = Array.from(new Map(filteredRecentWorkspaces.map(r => [r.id, r])).values());

  const handleOpenWorkspace = async () => {
    setIsOpening(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected) {
        const path = typeof selected === 'string' ? selected : String(selected);
        // Handle both forward and backslashes for cross-platform support
        const name = path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
        
        const newWorkspace: Workspace = {
          id: Date.now().toString(),
          name,
          path,
          lastOpened: new Date(),
          isFavorite: false,
        };

        onSelectWorkspace(newWorkspace);
      }
    } catch (error) {
      console.error('Failed to open workspace:', error);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="workspace-selection">
      <div className="workspace-header">
        <div className="logo-container">
          <div className="logo-gradient">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" fill="url(#gradient)" />
              <defs>
                <linearGradient id="gradient" x1="4" y1="4" x2="44" y2="44">
                  <stop offset="0%" stopColor="#4285f4" />
                  <stop offset="100%" stopColor="#9334e6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1>{t('workspace.title')}</h1>
        </div>
        <button className="settings-button secondary" onClick={onOpenSettings}>
          ⚙️ {t('workspace.settings')}
        </button>
      </div>

      <div className="workspace-content">
        <div className="workspace-actions">
          <button
            className="open-workspace-button primary"
            onClick={handleOpenWorkspace}
            disabled={isOpening}
          >
            📁 {t('workspace.openWorkspace')}
          </button>
        </div>

        <div className="workspace-sections">
          {uniqueFavorites.length > 0 && (
            <section className="workspace-section">
              <h2>⭐ {t('workspace.favoriteWorkspaces')}</h2>
              <div className="workspace-list">
                {uniqueFavorites.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id + '-fav'}
                    workspace={workspace}
                    onSelect={onSelectWorkspace}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {uniqueRecents.length > 0 && (
            <section className="workspace-section">
              <h2>🕐 {t('workspace.recentWorkspaces')}</h2>
              <div className="workspace-list">
                {uniqueRecents.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id + '-recent'}
                    workspace={workspace}
                    onSelect={onSelectWorkspace}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onSelect: (workspace: Workspace) => void;
  onToggleFavorite: (id: string) => void;
}

function WorkspaceCard({ workspace, onSelect, onToggleFavorite }: WorkspaceCardProps) {
  return (
    <div className="workspace-card card" onClick={() => onSelect(workspace)}>
      <div className="workspace-card-header">
        <div className="workspace-icon">📂</div>
        <div className="workspace-info">
          <h3>{workspace.name}</h3>
          <p>{workspace.path}</p>
        </div>
        <button
          className="favorite-button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(workspace.id);
          }}
        >
          {workspace.isFavorite ? '⭐' : '☆'}
        </button>
      </div>
    </div>
  );
}
