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

  // Pre-check setup status before rendering loading state
  useEffect(() => {
    let isComponentMounted = true;

    const preCheckSetup = async () => {
      try {
        // If geminiAuth is true, skip all setup checks completely
        if (settings.geminiAuth) {
          console.log('[Setup] geminiAuth is true, skipping all setup checks');
          if (isComponentMounted) {
            setIsCheckingSetup(false);
            onSetupCheckCompleted();
          }
          return;
        }

        // Quick pre-check: see if we already have auth complete status
        if (setupCheckCompleted) {
          console.log('[Setup] Already completed, skipping load');
          if (isComponentMounted) setIsCheckingSetup(false);
          return;
        }

        // If we have config and auth settings, do a quick validation
        if (globalConfig) {
          try {
            const config = await globalConfig.loadConfig();
            if (config?.googleCloudProjectId) {
              console.log('[Setup] Pre-check: googleCloudProjectId found, auth complete');
              if (isComponentMounted) setIsCheckingSetup(false);
              return;
            }
          } catch (configError) {
            console.log('[Setup] Pre-check: config error, will run full check');
          }
        }
      } catch (error) {
        console.log('[Setup] Pre-check failed, will run full check');
      }

      // If pre-check didn't trigger return, proceed with full check
      if (isComponentMounted) {
        await checkGeminiSetup();
      }
    };

    const checkGeminiSetup = async () => {
      const logCallback = (msg: string) => console.log('[Setup]', msg);

      // geminiAuth が true の場合は完全にスキップ
      if (settings.geminiAuth) {
        logCallback('geminiAuth is true, skipping all setup checks');
        setIsCheckingSetup(false);
        onSetupCheckCompleted();
        return;
      }

      // 既にチェック済みの場合はスキップ
      if (setupCheckCompleted) {
        logCallback('認証は既に完了しています。セットアップチェックをスキップします');
        setIsCheckingSetup(false);
        return;
      }

      // 事前チェック: 設定から認証状態を確認
      logCallback('Gemini CLI のチェックを開始しています...');
      try {
        // googleCloudProjectId が設定されている場合のみスキップ
        if (globalConfig) {
          try {
            const config = await globalConfig.loadConfig();
            if (config?.googleCloudProjectId) {
              logCallback('googleCloudProjectId が設定されています。セットアップを完了と見なします');
              setIsCheckingSetup(false);
              return; // チェックを完全にスキップ
            }
          } catch (configError) {
            logCallback(`設定読み込みエラー: ${configError}`);
          }
        }
      } catch (error) {
        logCallback(`事前チェックエラー: ${error}`);
      }

      try {
        logCallback(`config.geminiAuth: ${settings.geminiAuth}`);

        // geminiAuthフラグがtrueでも、実際のプロジェクト存在を確認
        const result = await geminiCheck(logCallback);

        logCallback(`Result: ${JSON.stringify(result)}`);

        // Show setup modal if Gemini CLI is not installed OR not authenticated OR no cloud project
        if (!result.geminiExists || !result.isAuthenticated) {
          logCallback('セットアップが必要です (CLI未インストールまたは未認証)');
          setShowSetupModal(true);
        } else if (result.hasProject === false) {
          logCallback('セットアップが必要です (Cloud Projectなし)');
          setShowSetupModal(true);
        } else if (result.hasProject === true) {
          logCallback('✓ セットアップは不要です (すべて完了)');
          // プロジェクトが存在する場合のみセットアップ完了
          setShowSetupModal(false);
        } else {
          // hasProjectがundefinedの場合（チェック失敗）は念のためセットアップ表示
          logCallback('プロジェクトチェック結果不明、セットアップを表示');
          setShowSetupModal(true);
        }

        // チェック完了フラグを設定（アプリケーションレベルで保持）
        onSetupCheckCompleted();
        logCallback('Setup check completed, flag set for app session');
      } catch (error) {
        logCallback(`Failed to check Gemini setup: ${error}`);
        // Show setup modal on error as well
        setShowSetupModal(true);
        onSetupCheckCompleted();
      } finally {
        setIsCheckingSetup(false);
      }
    };

    preCheckSetup();

    return () => {
      isComponentMounted = false;
    }
  }, [settings.geminiAuth, setupCheckCompleted, onSetupCheckCompleted, globalConfig, settings]);

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
          <p>{t('workspace.checkingSetup')}</p>
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
