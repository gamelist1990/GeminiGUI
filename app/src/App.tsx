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
  
  const {
    sessions,
    currentSession,
    currentSessionId,
    setCurrentSessionId,
    createNewSession,
    addMessage,
    getTotalTokens,
    deleteSession,
    renameSession,
    maxSessionsReached,
  } = useChatSessions();

  const [currentView, setCurrentView] = useState<View>('workspace');
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);

  // Apply theme
  useEffect(() => {
    if (!isLoading) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme, isLoading]);

  const handleSelectWorkspace = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    updateLastOpened(workspace.id);
    addWorkspace(workspace);
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
    addMessage(sessionId, message);
  };

  if (isLoading) {
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
        />
      )}
      
      {currentView === 'chat' && currentWorkspace && (
        <Chat
          workspace={currentWorkspace}
          sessions={sessions}
          currentSession={currentSession}
          currentSessionId={currentSessionId}
          maxSessionsReached={maxSessionsReached}
          totalTokens={getTotalTokens()}
          onCreateNewSession={createNewSession}
          onSwitchSession={setCurrentSessionId}
          onSendMessage={handleSendMessage}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
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
