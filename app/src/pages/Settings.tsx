import { useState } from 'react';
import { Settings as SettingsType, ToolConfig } from '../types';
import { t } from '../utils/i18n';
import ModernSetup from './ModernSetup';
import { detectGlobalNpmPath } from '../utils/setupAPI';
import { Config } from '../utils/configAPI';
import ModernToolSettingsPanel from '../components/ModernToolSettingsPanel';

interface SettingsProps {
  settings: SettingsType;
  onUpdateSettings: (settings: Partial<SettingsType>) => void;
  onClose: () => void;
  globalConfig?: Config;
}

export default function Settings({ settings, onUpdateSettings, onClose, globalConfig }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isDetectingPath, setIsDetectingPath] = useState(false);
  const [pathDetectionMessage, setPathDetectionMessage] = useState('');

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
    // Reload to apply language changes
    window.location.reload();
  };

  const handleCheckGeminiSetup = async () => {
    // ModernSetup を開いてセットアップ確認モードで表示
    setShowSetupModal(true);
  };

  const handleResetGeminiAuth = () => {
    // geminiAuth を false に戻してセットアップを再実行可能にする
    const updatedSettings = { ...localSettings, geminiAuth: false };
    setLocalSettings(updatedSettings);
    onUpdateSettings(updatedSettings);
    setShowSetupModal(true);
  };

  const handleSetupComplete = async () => {
    setShowSetupModal(false);
    // セットアップ完了後に設定を再読み込みしてgeminiAuthを更新
    if (globalConfig) {
      const updatedSettings = await globalConfig.loadConfig();
      if (updatedSettings) {
        setLocalSettings(updatedSettings);
        onUpdateSettings(updatedSettings);
      }
    }
  };

  const handleRedetectGeminiPath = async () => {
    setIsDetectingPath(true);
    setPathDetectionMessage('gemini.ps1 のパスを検出中...');

    try {
      const detectedPaths = await detectGlobalNpmPath((msg: string) => {
        setPathDetectionMessage(msg);
      });

      if (detectedPaths.npmPath && detectedPaths.hasGeminiCLI) {
        const geminiPath = `${detectedPaths.npmPath}\\gemini.ps1`;
        setPathDetectionMessage(`✓ パスを検出: ${geminiPath}`);

        // Update local settings
        const updatedSettings = { ...localSettings, geminiPath };
        setLocalSettings(updatedSettings);

        // Save to global config immediately
        if (globalConfig) {
          const currentConfig = await globalConfig.loadConfig();
          if (currentConfig) {
            currentConfig.geminiPath = geminiPath;
            await globalConfig.saveConfig(currentConfig);
            setPathDetectionMessage('✓ パスを保存しました');
          }
        }

        setTimeout(() => {
          setPathDetectionMessage('');
        }, 3000);
      } else {
        setPathDetectionMessage('✗ gemini.ps1 が見つかりませんでした。Gemini CLI がインストールされているか確認してください。');
      }
    } catch (error) {
      setPathDetectionMessage(`✗ エラー: ${error}`);
    } finally {
      setIsDetectingPath(false);
    }
  };

  return (
    <div className="settings-page">
      <ModernSetup isOpen={showSetupModal} onComplete={handleSetupComplete} globalConfig={globalConfig} />
      
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
            <label className="setting-label">
              <span className="label-icon">⚡</span>
              {t('settings.responseMode')}
            </label>
            <select
              className="setting-select"
              value={localSettings.responseMode || 'async'}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, responseMode: e.target.value as 'async' | 'stream' })
              }
              disabled={!localSettings.enableOpenAI}
            >
              <option value="async">{t('settings.asyncMode')}</option>
              <option value="stream">{t('settings.streamMode')}</option>
            </select>
            <p className="setting-description">
              {t('settings.responseModeDescription')}
              {!localSettings.enableOpenAI && (
                <>
                  <br />
                  <span style={{ color: 'var(--vscode-charts-orange)' }}>
                    {t('settings.streamNotAvailable')}
                  </span>
                </>
              )}
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

          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">☁️</span>
              Google Cloud Project ID
            </label>
            <input
              type="text"
              className="setting-input"
              placeholder="gemini-project-xxxxx"
              value={localSettings.googleCloudProjectId || ''}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, googleCloudProjectId: e.target.value })
              }
            />
            <p className="setting-description">
              Google Cloud ProjectのIDを入力してください。自動セットアップで作成されたIDが自動的に設定されます。
              <br />
              <small>※ 環境変数にPATHが設定済みの場合は不要です</small>
            </p>
          </div>

          {/* OpenAI API Support Section */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">🤖</span>
              {t('settings.enableOpenAI')}
            </label>
            <div className="theme-options">
              <button
                className={`theme-option ${!localSettings.enableOpenAI ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, enableOpenAI: false })}
              >
                ❌ {t('settings.disabled')}
              </button>
              <button
                className={`theme-option ${localSettings.enableOpenAI ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, enableOpenAI: true })}
              >
                ✅ {t('settings.enabled')}
              </button>
            </div>
            <p className="setting-description">
              {t('settings.openAIDescription')}
            </p>
          </div>

          {localSettings.enableOpenAI && (
            <>
              <div className="setting-group api-key-group">
                <label className="setting-label">
                  <span className="label-icon">🔑</span>
                  {t('settings.openAIApiKey')}
                </label>
                <input
                  type="password"
                  className="setting-input"
                  placeholder={t('settings.openAIApiKeyPlaceholder')}
                  value={localSettings.openAIApiKey || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, openAIApiKey: e.target.value })
                  }
                />
                <p className="setting-description">
                  {t('settings.openAIApiKeyDescription')}
                  <br />
                  <small>{t('settings.openAIApiKeyNote')}</small>
                </p>
              </div>

              <div className="setting-group">
                <label className="setting-label">
                  <span className="label-icon">🌐</span>
                  {t('settings.openAIBaseURL')}
                </label>
                <input
                  type="text"
                  className="setting-input"
                  placeholder="https://api.openai.com/v1"
                  value={localSettings.openAIBaseURL || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, openAIBaseURL: e.target.value })
                  }
                />
                <p className="setting-description">
                  {t('settings.openAIBaseURLDescription')}
                  <br />
                  <small>{t('settings.openAIBaseURLNote')}</small>
                </p>
              </div>

              <div className="setting-group">
                <label className="setting-label">
                  <span className="label-icon">🎯</span>
                  {t('settings.openAIModel')}
                </label>
                <input
                  type="text"
                  className="setting-input"
                  placeholder="gpt-3.5-turbo"
                  value={localSettings.openAIModel || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, openAIModel: e.target.value })
                  }
                />
                <p className="setting-description">
                  {t('settings.openAIModelDescription')}
                  <br />
                  <small>{t('settings.openAIModelNote')}</small>
                </p>
              </div>

              <div className="setting-group">
                <label className="setting-label">
                  <span className="label-icon">⚡</span>
                  {t('settings.responseMode')}
                </label>
                <select
                  className="setting-select"
                  value={localSettings.responseMode || 'async'}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, responseMode: e.target.value as 'async' | 'stream' })
                  }
                >
                  <option value="async">{t('settings.asyncMode')}</option>
                  <option value="stream">{t('settings.streamMode')}</option>
                </select>
                <p className="setting-description">
                  {t('settings.openAIStreamDescription')}
                </p>
              </div>
            </>
          )}

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
            <label className="setting-label">
              <span className="label-icon">📍</span>
              Gemini CLI パス設定
            </label>
            <div className="setting-action" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="setting-input"
                placeholder="C:\\path\\to\\gemini.ps1"
                value={localSettings.geminiPath || ''}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, geminiPath: e.target.value })
                }
                style={{ flex: 1, minWidth: '300px' }}
              />
              <button
                className="action-button secondary"
                onClick={handleRedetectGeminiPath}
                disabled={isDetectingPath}
                title="自動的にgemini.ps1のパスを検出して設定"
              >
                {isDetectingPath ? '検出中...' : '🔍 自動検出'}
              </button>
            </div>
            {pathDetectionMessage && (
              <p className="setting-description" style={{ 
                color: pathDetectionMessage.includes('✓') ? 'var(--vscode-charts-green)' : 
                       pathDetectionMessage.includes('✗') ? 'var(--vscode-charts-red)' : 
                       'var(--text-secondary)'
              }}>
                {pathDetectionMessage}
              </p>
            )}
            <p className="setting-description">
              gemini.ps1 スクリプトへのフルパスを指定してください。
              「自動検出」ボタンでnpmのグローバルインストールパスから自動的に検出できます。
              <br />
              <small>※ パスが正しくないと「Command failed with code 1」エラーが発生します</small>
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

          {/* Tool Settings Section */}
          <div className="setting-group">
            <label className="setting-label">🛠️ Tool Settings</label>
            <p className="setting-description">
              Manage AI tools that extend capabilities during chat sessions. 
              Modern tools use Rust/Tauri for safe and efficient execution.
            </p>
            <ModernToolSettingsPanel
              enabledTools={localSettings.enabledTools || []}
              tools={localSettings.tools || []}
              onUpdateEnabledTools={(enabledTools: string[]) => 
                setLocalSettings({ ...localSettings, enabledTools })
              }
              onUpdateTools={(tools: ToolConfig[]) =>
                setLocalSettings({ ...localSettings, tools })
              }
            />
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
