import React, { useState } from 'react';
import { Settings } from '../../types';
import { t } from '../../utils/i18n';
import SetupModal from '../Setup';
import { detectGlobalNpmPath } from '../../utils/setupAPI';
import './SystemSettings.css';

interface SystemSettingsProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  globalConfig?: any;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({ settings, onUpdateSettings, globalConfig }) => {
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupCheckStatus, setSetupCheckStatus] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDetectingPath, setIsDetectingPath] = useState(false);
  const [pathDetectionMessage, setPathDetectionMessage] = useState('');

  const handleCheckSetup = async () => {
    try {
      setIsChecking(true);
      setSetupCheckStatus(null);
      // セットアップ確認モードでSetupModalを開く
      setShowSetupModal(true);
      // モーダルが完全に表示されるまで待つ
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      setSetupCheckStatus(t('settings.setupCheckError'));
      console.error('Setup check error:', error);
      setIsChecking(false);
    }
  };

  const handleDetectGeminiPath = async () => {
    setIsDetectingPath(true);
    setPathDetectionMessage('🔍 gemini.ps1 のパスを検出中...');

    try {
      const detectedPaths = await detectGlobalNpmPath((msg: string) => {
        setPathDetectionMessage(msg);
      });

      if (detectedPaths.npmPath && detectedPaths.hasGeminiCLI) {
        const geminiPath = `${detectedPaths.npmPath}\\gemini.ps1`;
        setPathDetectionMessage(`✓ パスを検出: ${geminiPath}`);

        // Update settings
        onUpdateSettings({ geminiPath });

        // Save to global config immediately
        if (globalConfig) {
          try {
            const currentConfig = await globalConfig.loadConfig();
            if (currentConfig) {
              currentConfig.geminiPath = geminiPath;
              await globalConfig.saveConfig(currentConfig);
              setPathDetectionMessage(`✓ gemini.ps1 パスを保存しました: ${geminiPath}`);
            }
          } catch (configError) {
            console.error('Failed to save geminiPath to config:', configError);
            setPathDetectionMessage(`✓ パスを検出しましたが、保存に失敗: ${geminiPath}`);
          }
        } else {
          setPathDetectionMessage(`✓ パスを検出: ${geminiPath}`);
        }

        setTimeout(() => {
          setPathDetectionMessage('');
        }, 5000);
      } else {
        setPathDetectionMessage('✗ gemini.ps1 が見つかりませんでした。Gemini CLI がインストールされているか確認してください。');
      }
    } catch (error) {
      setPathDetectionMessage(`✗ エラー: ${error}`);
      console.error('Path detection error:', error);
    } finally {
      setIsDetectingPath(false);
    }
  };

  return (
    <div className="settings-category">
      <h2>{t('settings.categories.system.title')}</h2>

      {/* Gemini Path Detection */}
      <div className="setting-card">
        <div className="card-header">
          <h3>📍 Gemini CLI パス設定</h3>
        </div>
        <div className="card-content">
          <div className="setting-group">
            <label className="setting-label">
              gemini.ps1 のパス
            </label>
            <div className="input-with-button">
              <input
                type="text"
                className="setting-input"
                placeholder="C:\\Users\\...\\npm\\gemini.ps1"
                value={settings.geminiPath || ''}
                onChange={(e) => onUpdateSettings({ geminiPath: e.target.value })}
                readOnly
              />
              <button
                onClick={handleDetectGeminiPath}
                disabled={isDetectingPath}
                className="setting-button"
              >
                {isDetectingPath ? '🔍 検出中...' : '🔍 自動検出'}
              </button>
            </div>
            {pathDetectionMessage && (
              <p className={`setting-description ${
                pathDetectionMessage.includes('✓') ? 'highlight' : 
                pathDetectionMessage.includes('✗') ? 'warning' : ''
              }`}>
                {pathDetectionMessage}
              </p>
            )}
            <p className="setting-description">
              Gemini CLI (gemini.ps1) のパスを自動検出します。検出されたパスは config.json に保存されます。
            </p>
          </div>
        </div>
      </div>

      {/* Gemini CLI Setup Check */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.geminiSetupCheck')}</h3>
        </div>
        <div className="card-content">
          <button 
            onClick={handleCheckSetup}
            disabled={isChecking || showSetupModal}
            className="setting-button"
          >
            {isChecking || showSetupModal ? '確認中...' : t('settings.checkSetup')}
          </button>
          {setupCheckStatus && (
            <p className={`setting-description ${setupCheckStatus.includes('✓') ? 'highlight' : 'warning'}`}>
              {setupCheckStatus}
            </p>
          )}
          <p className="setting-description">{t('settings.setupCheckDescription')}</p>
        </div>
      </div>

      {/* Backup Warning */}
      <div className="setting-card warning">
        <div className="card-header">
          <h3>{t('settings.backupWarning')}</h3>
        </div>
        <div className="card-content">
          <p className="setting-description">{t('settings.backupText')}</p>
          <ul className="backup-tips">
            <li>{t('settings.backupTip1')}</li>
            <li>{t('settings.backupTip2')}</li>
            <li>{t('settings.backupTip3')}</li>
          </ul>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetupModal && (
        <SetupModal 
          isOpen={showSetupModal}
          onComplete={() => {
            setShowSetupModal(false);
            setIsChecking(false);
            setSetupCheckStatus('セットアップ確認が完了しました。');
          }}
          globalConfig={globalConfig}
        />
      )}
    </div>
  );
};
