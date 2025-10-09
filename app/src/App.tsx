import React, { useState, useEffect } from "react";
import "./styles/theme.css";
import "./App.css";
const WorkspaceSelection = React.lazy(() => import('./pages/WorkspaceSelection')) as any;
const Chat = React.lazy(() => import('./pages/Chat')) as any;
const SettingsPage = React.lazy(() => import('./pages/SettingsPage')) as any;
import { useSettings } from "./hooks/useSettings";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useChatSessions } from "./hooks/useChatSessions";
import { Workspace, ChatMessage } from "./types";
import { Config } from "./utils/configAPI";
import { documentDir, join } from "@tauri-apps/api/path";
import { t } from "./utils/i18n";
import { cleanupManager } from "./utils/cleanupManager";

type View = 'workspace' | 'chat' | 'settings';

function App() {
  const { settings, updateSettings, isLoading } = useSettings();
  const {
    recentWorkspaces,
    favoriteWorkspaces,
    toggleFavorite,
    updateLastOpened,
    addWorkspace,
  } = useWorkspaces();
  
  const [currentView, setCurrentView] = useState<View>('workspace');
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  
  // セットアップチェック済みフラグ（アプリケーション起動時に一度だけチェック）
  const [setupCheckCompleted, setSetupCheckCompleted] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<Config | null>(null);

  useEffect(() => {
    (async () => {
      if (!globalConfig) {
        const baseDir = await documentDir();
        const configPath = await join(baseDir, "PEXData", "GeminiGUI");
        setGlobalConfig(new Config(configPath));
      }
    })();
  }, [globalConfig]);

  const {
    sessions,
    currentSession,
    currentSessionId,
    setCurrentSessionId,
    createNewSession,
    addMessage: sendMessage,
    resendMessage,
    compactSession,
    getTotalTokens,
    deleteSession,
    renameSession,
    maxSessionsReached,
  } = useChatSessions(currentWorkspace?.id);

  // Apply theme
  useEffect(() => {
    if (!isLoading) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme, isLoading]);

  const handleSelectWorkspace = async (workspace: Workspace) => {
    // Cleanup previous workspace's temporary files if switching workspaces
    if (currentWorkspace && currentWorkspace.id !== workspace.id) {
      console.log(`[App] Switching workspace from ${currentWorkspace.id} to ${workspace.id}`);
      await cleanupManager.cleanupWorkspace(currentWorkspace.id);
    }
    
    setCurrentWorkspace(workspace);
    updateLastOpened(workspace.id);
    addWorkspace(workspace);
    
    setCurrentView('chat');
  };

  const handleBackToWorkspace = () => {
    setCurrentView('workspace');
    // Note: We don't cleanup here because user might come back
    setCurrentWorkspace(null);
  };

  const handleOpenSettings = () => {
    setCurrentView('settings');
  };

  const handleCloseSettings = () => {
    if (currentWorkspace) {
      setCurrentView('chat');
    } else {
      setCurrentView('workspace');
    }
  };

  // Monitor current session changes
  useEffect(() => {
    // No-op: removed agent mode logic
  }, [currentSession?.id, currentWorkspace, currentView]);

  const handleCreateNewSession = async (): Promise<boolean> => {
    const success = await createNewSession();
    // Switch to chat view when creation succeeded
    if (success) {
      setCurrentView('chat');
    }
    return success;
  };

  const handleSendMessage = (sessionId: string, message: ChatMessage) => {
    sendMessage(sessionId, message);
  };

  const handleResendMessage = (sessionId: string, messageId: string, newMessage: ChatMessage) => {
    resendMessage(sessionId, messageId, newMessage);
  };

  const handleCompactSession = async (sessionId: string) => {
    // Compact the session by keeping only system messages
    await compactSession(sessionId);
  };

  const handleSwitchSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  if (isLoading || !globalConfig) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div className="loading-text">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <>
      {currentView === 'workspace' && (
        <React.Suspense fallback={<div className="loading-container"><div className="loading-spinner"></div><div className="loading-text">Loading…</div></div>}>
          <WorkspaceSelection
            recentWorkspaces={recentWorkspaces}
            favoriteWorkspaces={favoriteWorkspaces}
            onSelectWorkspace={handleSelectWorkspace}
            onOpenSettings={handleOpenSettings}
            onToggleFavorite={toggleFavorite}
            settings={settings}
            updateSettings={updateSettings}
            globalConfig={globalConfig}
            setupCheckCompleted={setupCheckCompleted}
            onSetupCheckCompleted={() => setSetupCheckCompleted(true)}
          />
        </React.Suspense>
      )}
      
      {currentView === 'chat' && currentWorkspace && (
        <React.Suspense fallback={<div className="loading-container"><div className="loading-spinner"></div><div className="loading-text">Loading chat…</div></div>}>
          <Chat
          workspace={currentWorkspace}
          sessions={sessions}
          currentSession={currentSession}
          currentSessionId={currentSessionId}
          maxSessionsReached={maxSessionsReached}
          approvalMode={settings.approvalMode}
          responseMode={settings.responseMode || 'async'}
          totalTokens={getTotalTokens()}
          customApiKey={settings.customApiKey}
          googleCloudProjectId={settings.googleCloudProjectId}
          maxMessagesBeforeCompact={settings.maxMessagesBeforeCompact}
          globalConfig={globalConfig}
          settings={settings}
          onCreateNewSession={handleCreateNewSession}
          onSwitchSession={handleSwitchSession}
          onSendMessage={handleSendMessage}
          onResendMessage={handleResendMessage}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onCompactSession={handleCompactSession}
          onBack={handleBackToWorkspace}
          />
        </React.Suspense>
      )}

      {currentView === 'settings' && (
        <React.Suspense fallback={<div className="loading-container"><div className="loading-spinner"></div><div className="loading-text">Loading settings…</div></div>}>
          <SettingsPage
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={handleCloseSettings}
          globalConfig={globalConfig}
          />
        </React.Suspense>
      )}
    </>
  );
}

export default App;
