import { useState } from 'react';
import { Settings as SettingsType } from '../types';
import { t } from '../utils/i18n';
import { GeneralSettings } from './Settings/GeneralSettings';
import { AISettings } from './Settings/AISettings';
import { ToolsSettings } from './Settings/ToolsSettings';
import { AppearanceSettings } from './Settings/AppearanceSettings';
import { SystemSettings } from './Settings/SystemSettings';
import './SettingsPage.css';

interface SettingsPageProps {
  settings: SettingsType;
  onUpdateSettings: (settings: Partial<SettingsType>) => void;
  onClose: () => void;
  globalConfig?: any;
}

type SettingsCategory = 'general' | 'ai' | 'tools' | 'appearance' | 'system';

interface SettingsCategoryItem {
  id: SettingsCategory;
  icon: string;
  label: string;
  description: string;
}

const categories: SettingsCategoryItem[] = [
  {
    id: 'general',
    icon: '⚙️',
    label: 'settings.categories.general.label',
    description: 'settings.categories.general.description'
  },
  {
    id: 'ai',
    icon: '🤖',
    label: 'settings.categories.ai.label',
    description: 'settings.categories.ai.description'
  },
  {
    id: 'tools',
    icon: '🛠️',
    label: 'settings.categories.tools.label',
    description: 'settings.categories.tools.description'
  },
  {
    id: 'appearance',
    icon: '🎨',
    label: 'settings.categories.appearance.label',
    description: 'settings.categories.appearance.description'
  },
  {
    id: 'system',
    icon: '💻',
    label: 'settings.categories.system.label',
    description: 'settings.categories.system.description'
  }
];

export default function SettingsPage({ settings, onUpdateSettings, onClose, globalConfig }: SettingsPageProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleSettingChange = (updates: Partial<SettingsType>) => {
    const newSettings = { ...localSettings, ...updates };
    setLocalSettings(newSettings);
    setHasUnsavedChanges(true);
    
    // ツール設定の変更は即座に保存（toolsとenabledToolsの両方が含まれる場合のみ）
    if ('tools' in updates && 'enabledTools' in updates) {
      console.log('[Settings] Tool configuration changed, saving immediately...', {
        tools: updates.tools?.length,
        enabledTools: updates.enabledTools?.length
      });
      onUpdateSettings(newSettings);
      setHasUnsavedChanges(false);
    }
  };

  const handleSave = () => {
    onUpdateSettings(localSettings);
    setHasUnsavedChanges(false);
    onClose();
    // Reload to apply language changes
    window.location.reload();
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(t('settings.unsavedChanges'));
      if (!confirmed) return;
    }
    onClose();
  };

  const renderCategoryContent = () => {
    const props = {
      settings: localSettings,
      onUpdateSettings: handleSettingChange
    };

    const systemProps = {
      ...props,
      globalConfig
    };

    switch (activeCategory) {
      case 'general':
        return <GeneralSettings {...props} />;
      case 'ai':
        return <AISettings {...props} />;
      case 'tools':
        return <ToolsSettings {...props} />;
      case 'appearance':
        return <AppearanceSettings {...props} />;
      case 'system':
        return <SystemSettings {...systemProps} />;
      default:
        return <GeneralSettings {...props} />;
    }
  };

  return (
    <div className="settings-page-fullscreen">
      {/* Header */}
      <div className="settings-header-bar">
        <div className="header-left">
          <h1>⚙️ {t('settings.title')}</h1>
          <p className="header-subtitle">{t('settings.closeSettings')}</p>
        </div>
        <div className="header-actions">
          {hasUnsavedChanges && (
            <span className="unsaved-indicator">● {t('settings.unsavedChanges')}</span>
          )}
          <button className="btn-secondary" onClick={handleCancel}>
            {t('settings.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            💾 {t('settings.save')}
          </button>
        </div>
      </div>

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <aside className="settings-sidebar">
          <nav className="sidebar-nav">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`nav-item ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="nav-icon">{category.icon}</span>
                <div className="nav-text">
                  <span className="nav-label">{t(category.label)}</span>
                  <span className="nav-description">{t(category.description)}</span>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="settings-main">
          <div className="settings-content-wrapper">
            {renderCategoryContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
