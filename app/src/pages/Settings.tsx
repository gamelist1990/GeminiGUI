import { useState } from 'react';
import { Settings as SettingsType } from '../types';
import { t } from '../utils/i18n';
import './Settings.css';

interface SettingsProps {
  settings: SettingsType;
  onUpdateSettings: (settings: Partial<SettingsType>) => void;
  onClose: () => void;
}

export default function Settings({ settings, onUpdateSettings, onClose }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
    // Reload to apply language changes
    window.location.reload();
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1>{t('settings.title')}</h1>
          <button className="close-button secondary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-content">
          <div className="setting-group">
            <label className="setting-label">{t('settings.language')}</label>
            <select
              className="setting-select"
              value={localSettings.language}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, language: e.target.value })
              }
            >
              <option value="en_US">English (US)</option>
              <option value="ja_JP">日本語 (Japanese)</option>
            </select>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.theme')}</label>
            <div className="theme-options">
              <button
                className={`theme-option ${localSettings.theme === 'light' ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, theme: 'light' })}
              >
                ☀️ {t('settings.light')}
              </button>
              <button
                className={`theme-option ${localSettings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, theme: 'dark' })}
              >
                🌙 {t('settings.dark')}
              </button>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">Approval Mode</label>
            <select
              className="setting-select"
              value={localSettings.approvalMode}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, approvalMode: e.target.value as 'default' | 'auto_edit' | 'yolo' })
              }
            >
              <option value="default">Default (Prompt for approval)</option>
              <option value="auto_edit">Auto Edit (Auto-approve edit tools)</option>
              <option value="yolo">YOLO (Auto-approve all tools)</option>
            </select>
            <p className="setting-description">
              Controls how Gemini handles tool approvals. Default requires manual approval, Auto Edit automatically approves edits, and YOLO approves all actions.
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">Checkpointing</label>
            <div className="checkbox-container">
              <input
                type="checkbox"
                id="checkpointing"
                checked={localSettings.checkpointing}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, checkpointing: e.target.checked })
                }
              />
              <label htmlFor="checkpointing">Enable file change checkpointing</label>
            </div>
            <p className="setting-description">
              When enabled, Gemini will automatically track file changes and allow you to rollback to previous versions. This is useful when editing prompts and replaying conversations.
            </p>
          </div>
        </div>

        <div className="settings-footer">
          <button className="secondary" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button className="primary" onClick={handleSave}>
            {t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
