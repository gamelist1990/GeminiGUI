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
  updateSettings: (settings: Partial<Settings>) => void; // 設定更新関数
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
  updateSettings,
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
        if (settings.geminiAuth === true) {
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

        // geminiAuth が false の場合は、必ずフルチェックを実行
        console.log('[Setup] geminiAuth is false, running full setup check');
      } catch (error) {
        console.log('[Setup] Pre-check failed, will run full check');
      }

      // geminiAuth が false の場合は常にフルチェックを実行
      if (isComponentMounted) {
        await checkGeminiSetup();
      }
    };

    const checkGeminiSetup = async () => {
      const logCallback = (msg: string) => console.log('[Setup]', msg);

      // geminiAuth が true の場合は完全にスキップ
      if (settings.geminiAuth === true) {
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

      // セットアップチェックを開始
      logCallback('Gemini CLI のチェックを開始しています...');
      
      try {
        logCallback(`config.geminiAuth: ${settings.geminiAuth}`);

        // geminiCheck を実行
        const result = await geminiCheck(logCallback);

        logCallback(`Result: ${JSON.stringify(result)}`);
        logCallback(`Detailed result breakdown:`);
        logCallback(`  - geminiExists: ${result.geminiExists}`);
        logCallback(`  - nodeExists: ${result.nodeExists}`);
        logCallback(`  - isAuthenticated: ${result.isAuthenticated}`);
        logCallback(`  - hasProject: ${result.hasProject}`);

        // セットアップが必要な条件をチェック
        const needsSetup = !result.geminiExists || !result.nodeExists || !result.isAuthenticated || result.hasProject === false;
        logCallback(`needsSetup calculation: geminiExists=${result.geminiExists}, nodeExists=${result.nodeExists}, isAuthenticated=${result.isAuthenticated}, hasProject=${result.hasProject} => needsSetup=${needsSetup}`);

        if (needsSetup) {
          logCallback('セットアップが必要なため、SetupModalを表示します');
          setShowSetupModal(true);
          // モーダルが完全に表示されるまで待つ
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          logCallback('セットアップは不要です');
          // セットアップ不要の場合は geminiAuth を true に更新
          logCallback('geminiAuth を true に更新します');
          updateSettings({ geminiAuth: true });
          if (globalConfig) {
            const config = await globalConfig.loadConfig();
            if (config) {
              config.geminiAuth = true;
              await globalConfig.saveConfig(config);
              logCallback('geminiAuth を config.json に保存しました');
            }
          }
        }

        // チェック完了フラグを設定（アプリケーションレベルで保持）
        onSetupCheckCompleted();
        logCallback('Setup check completed, flag set for app session');
      } catch (error) {
        logCallback(`Failed to check Gemini setup: ${error}`);
        // Show setup modal on error as well
        setShowSetupModal(true);
        // モーダルが完全に表示されるまで待つ
        await new Promise(resolve => setTimeout(resolve, 100));
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

  const handleSetupComplete = async () => {
    setShowSetupModal(false);
    // セットアップ完了後に設定を再読み込みしてgeminiAuthを更新
    if (globalConfig) {
      const updatedSettings = await globalConfig.loadConfig();
      if (updatedSettings) {
        updateSettings(updatedSettings);
      }
    }
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

  // Debug effect for modal state
  useEffect(() => {
    console.log('[WorkspaceSelection] Modal state changed - showSetupModal:', showSetupModal, 'isCheckingSetup:', isCheckingSetup);
  }, [showSetupModal, isCheckingSetup]);

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
