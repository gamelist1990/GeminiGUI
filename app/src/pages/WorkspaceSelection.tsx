import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Workspace, Settings } from '../types';
import { t } from '../utils/i18n';
import { geminiCheck } from '../utils/setupAPI';
import { Config } from '../utils/configAPI';
import SetupModal from './Setup';
import './WorkspaceSelection.css';

interface WorkspaceSelectionProps {
  recentWorkspaces: Workspace[];
  favoriteWorkspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenSettings: () => void;
  onToggleFavorite: (id: string) => void;
  settings: Settings; // 設定を受け取る
  globalConfig: Config; // グローバルconfig.jsonを受け取る
  setupCheckCompleted: boolean; // セットアップチェック完了フラグ
  onSetupCheckCompleted: () => void; // セットアップチェック完了コールバック
}

export default function WorkspaceSelection({
  recentWorkspaces,
  favoriteWorkspaces,
  onSelectWorkspace,
  onOpenSettings,
  onToggleFavorite,
  settings,
  globalConfig,
  setupCheckCompleted,
  onSetupCheckCompleted,
}: WorkspaceSelectionProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Check Gemini CLI on component mount (only once per app session)
  useEffect(() => {
    const checkGeminiSetup = async () => {
      // 既にチェック済みの場合はスキップ
      if (setupCheckCompleted) {
        console.log('[Setup Check] Already checked in this app session, skipping');
        setIsCheckingSetup(false);
        return;
      }

      try {
        console.log('[Setup Check] Starting setup verification');
        console.log('[Setup Check] config.geminiAuth:', settings.geminiAuth);
        
        // geminiAuthフラグがtrueでも、実際のプロジェクト存在を確認
        const result = await geminiCheck((msg) => console.log('[Setup Check]', msg));
        
        console.log('[Setup Check] Result:', result);
        
        // Show setup modal if Gemini CLI is not installed OR not authenticated OR no cloud project
        if (!result.geminiExists || !result.isAuthenticated) {
          console.log('[Setup Check] セットアップが必要です (CLI未インストールまたは未認証)');
          setShowSetupModal(true);
        } else if (result.hasProject === false) {
          console.log('[Setup Check] セットアップが必要です (Cloud Projectなし)');
          setShowSetupModal(true);
        } else if (result.hasProject === true) {
          console.log('[Setup Check] ✓ セットアップは不要です (すべて完了)');
          // プロジェクトが存在する場合のみセットアップ完了
          setShowSetupModal(false);
        } else {
          // hasProjectがundefinedの場合（チェック失敗）は念のためセットアップ表示
          console.log('[Setup Check] プロジェクトチェック結果不明、セットアップを表示');
          setShowSetupModal(true);
        }
        
        // チェック完了フラグを設定（アプリケーションレベルで保持）
        onSetupCheckCompleted();
        console.log('[Setup Check] Setup check completed, flag set for app session');
      } catch (error) {
        console.error('[Setup Check] Failed to check Gemini setup:', error);
        // Show setup modal on error as well
        setShowSetupModal(true);
        onSetupCheckCompleted();
      } finally {
        setIsCheckingSetup(false);
      }
    };

    checkGeminiSetup();
  }, [settings.geminiAuth, setupCheckCompleted, onSetupCheckCompleted]);

  const handleSetupComplete = () => {
    setShowSetupModal(false);
    // セットアップ完了はconfig.jsonに保存される
  };

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
      <SetupModal 
        isOpen={showSetupModal} 
        onComplete={handleSetupComplete}
        globalConfig={globalConfig}
      />
      
      {isCheckingSetup ? (
        <div className="workspace-loading">
          <div className="spinner"></div>
          <p>Checking Gemini CLI setup...</p>
        </div>
      ) : (
        <>
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
        </>
      )}
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
