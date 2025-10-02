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
            <label className="setting-label">🤖 モデル選択</label>
            <select
              className="setting-select"
              value={localSettings.model}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, model: e.target.value as 'default' | 'gemini-2.5-flash' })
              }
            >
              <option value="default">デフォルトGemini 2.5 Pro</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (高速・節約)</option>
            </select>
            <p className="setting-description">
              Gemini 2.5 Flashは応答速度が速く、トークン消費が少ないモデルです。
            </p>
          </div>

          <div className="setting-group api-key-group">
            <label className="setting-label">
              <span className="label-icon">🔑</span>
              カスタムAPIキー (オプション)
            </label>
            <input
              type="password"
              className="setting-input"
              placeholder="YOUR_API_KEY_HERE"
              value={localSettings.customApiKey || ''}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, customApiKey: e.target.value })
              }
            />
            <p className="setting-description">
              💡 カスタムAPIキーを設定すると、環境変数 <code>GEMINI_API_KEY</code> として使用されます。
              <br />
              <small>空白のままにすると、システムのデフォルトAPIキーが使用されます。</small>
            </p>
          </div>

          <div className="setting-group compact-group">
            <label className="setting-label">
              <span className="label-icon">💬</span>
              会話整理の推奨タイミング
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
              <span className="input-suffix">メッセージ</span>
            </div>
            <p className="setting-description">
              📊 このメッセージ数に達すると、<code>/compact</code>コマンドまたは新セッション作成を推奨します。
              <br />
              <small>会話が長くなるとトークン消費が増加するため、定期的な整理を推奨します。</small>
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">⚠️ バックアップの推奨</label>
            <div className="backup-warning">
              <p className="warning-text">
                このアプリケーションにはチェックポイント機能がありません。
                AIによるコード変更を行う前に、必ずGitやその他のバージョン管理システムで
                適切なバックアップを取ることを強くお勧めします。
              </p>
              <ul className="backup-tips">
                <li>✓ Gitでコミットしてから変更を開始する</li>
                <li>✓ 重要なファイルは別途バックアップを作成する</li>
                <li>✓ 大きな変更の前にブランチを作成する</li>
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
