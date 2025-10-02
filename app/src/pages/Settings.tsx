import { useState } from 'react';
import { Settings as SettingsType } from '../types';
import { t } from '../utils/i18n';
import SetupModal from './Setup';
import './Settings.css';

interface SettingsProps {
  settings: SettingsType;
  onUpdateSettings: (settings: Partial<SettingsType>) => void;
  onClose: () => void;
}

export default function Settings({ settings, onUpdateSettings, onClose }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
    // Reload to apply language changes
    window.location.reload();
  };

  const handleCheckGeminiSetup = async () => {
    // SetupModal を直接開いてチェックを実行
    setShowSetupModal(true);
  };

  const handleResetGeminiAuth = () => {
    // geminiAuth を false に戻してセットアップを再実行可能にする
    const updatedSettings = { ...localSettings, geminiAuth: false };
    setLocalSettings(updatedSettings);
    onUpdateSettings(updatedSettings);
    setShowSetupModal(true);
  };

  const handleSetupComplete = () => {
    setShowSetupModal(false);
    // セットアップ完了をローカルストレージに保存
    localStorage.setItem('geminiSetupCompleted', 'true');
  };

  return (
    <div className="settings-page">
      <SetupModal isOpen={showSetupModal} onComplete={handleSetupComplete} />
      
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
            <label className="setting-label">{t('settings.approvalMode')}</label>
            <select
              className="setting-select"
              value={localSettings.approvalMode}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, approvalMode: e.target.value as 'default' | 'auto_edit' | 'yolo' })
              }
            >
              <option value="default">{t('settings.defaultApproval')}</option>
              <option value="auto_edit">{t('settings.autoEditApproval')}</option>
              <option value="yolo">{t('settings.yoloApproval')}</option>
            </select>
            <p className="setting-description">
              {t('settings.approvalDescription')}
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.modelSelection')}</label>
            <select
              className="setting-select"
              value={localSettings.model}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, model: e.target.value as 'default' | 'gemini-2.5-flash' })
              }
            >
              <option value="default">{t('settings.defaultModel')}</option>
              <option value="gemini-2.5-flash">{t('settings.flashModel')}</option>
            </select>
            <p className="setting-description">
              {t('settings.flashDescription')}
            </p>
          </div>

          <div className="setting-group api-key-group">
            <label className="setting-label">
              <span className="label-icon">🔑</span>
              {t('settings.customApiKey')}
            </label>
            <input
              type="password"
              className="setting-input"
              placeholder={t('settings.apiKeyPlaceholder')}
              value={localSettings.customApiKey || ''}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, customApiKey: e.target.value })
              }
            />
            <p className="setting-description">
              {t('settings.apiKeyDescription')}
              <br />
              <small>{t('settings.apiKeyDefaultNote')}</small>
            </p>
          </div>

          <div className="setting-group compact-group">
            <label className="setting-label">
              <span className="label-icon">💬</span>
              {t('settings.conversationCleanup')}
            </label>
            <div className="number-input-container">
              <input
                type="number"
                className="setting-input"
                min="10"
                max="100"
                value={localSettings.maxMessagesBeforeCompact}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, maxMessagesBeforeCompact: parseInt(e.target.value) })
                }
              />
              <span className="input-suffix">{t('settings.messages')}</span>
            </div>
            <p className="setting-description">
              {t('settings.cleanupDescription')}
              <br />
              <small>{t('settings.cleanupReason')}</small>
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.geminiSetupCheck')}</label>
            <div className="setting-action" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="action-button primary"
                onClick={handleCheckGeminiSetup}
              >
                {t('settings.checkSetup')}
              </button>
              {localSettings.geminiAuth && (
                <button
                  className="action-button secondary"
                  onClick={handleResetGeminiAuth}
                  title="セットアップ状態をリセットして再実行"
                >
                  🔄 セットアップをリセット
                </button>
              )}
            </div>
            <p className="setting-description">
              {t('settings.setupCheckDescription')}
              {localSettings.geminiAuth && (
                <>
                  <br />
                  <span style={{ color: 'var(--vscode-charts-green)' }}>
                    ✓ Gemini CLIのセットアップが完了しています
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">{t('settings.backupWarning')}</label>
            <div className="backup-warning">
              <p className="warning-text">
                {t('settings.backupText')}
              </p>
              <ul className="backup-tips">
                <li>{t('settings.backupTip1')}</li>
                <li>{t('settings.backupTip2')}</li>
                <li>{t('settings.backupTip3')}</li>
              </ul>
            </div>
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
