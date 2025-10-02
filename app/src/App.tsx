import { useState, useEffect } from "react";
import "./styles/theme.css";
import "./App.css";
import WorkspaceSelection from "./pages/WorkspaceSelection";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import { useSettings } from "./hooks/useSettings";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useChatSessions } from "./hooks/useChatSessions";
import { Workspace, ChatMessage } from "./types";
import { Config } from "./utils/configAPI";
import { documentDir, join } from "@tauri-apps/api/path";

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
    setCurrentWorkspace(workspace);
    updateLastOpened(workspace.id);
    addWorkspace(workspace);
    
    // Auto-create first session if no sessions exist
    if (sessions.length === 0) {
      await createNewSession();
    }
    
    setCurrentView('chat');
  };

  const handleBackToWorkspace = () => {
    setCurrentView('workspace');
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

  if (isLoading || !globalConfig) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        backgroundColor: 'var(--background)',
        color: 'var(--text-primary)'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      {currentView === 'workspace' && (
        <WorkspaceSelection
          recentWorkspaces={recentWorkspaces}
          favoriteWorkspaces={favoriteWorkspaces}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenSettings={handleOpenSettings}
          onToggleFavorite={toggleFavorite}
          settings={settings}
          globalConfig={globalConfig}
          setupCheckCompleted={setupCheckCompleted}
          onSetupCheckCompleted={() => setSetupCheckCompleted(true)}
        />
      )}
      
      {currentView === 'chat' && currentWorkspace && (
        <Chat
          workspace={currentWorkspace}
          sessions={sessions}
          currentSession={currentSession}
          currentSessionId={currentSessionId}
          maxSessionsReached={maxSessionsReached}
          approvalMode={settings.approvalMode}
          totalTokens={getTotalTokens()}
          customApiKey={settings.customApiKey}
          googleCloudProjectId={settings.googleCloudProjectId}
          maxMessagesBeforeCompact={settings.maxMessagesBeforeCompact}
          onCreateNewSession={createNewSession}
          onSwitchSession={setCurrentSessionId}
          onSendMessage={handleSendMessage}
          onResendMessage={handleResendMessage}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onCompactSession={handleCompactSession}
          onBack={handleBackToWorkspace}
        />
      )}

      {currentView === 'settings' && (
        <Settings
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}

export default App;
