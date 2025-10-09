import React, { useState, useEffect } from 'react';
import './ModernSetup.css';
import { Config } from '../utils/configAPI';
import { geminiCheck, setupGemini, detectGlobalNpmPath } from '../utils/setupAPI';

interface ModernSetupProps {
  isOpen: boolean;
  onComplete: () => void;
  workspaceId?: string;
  globalConfig?: Config;
}

type Provider = 'gemini' | 'openai' | null;
type SetupPhase = 'provider-select' | 'gemini-check' | 'gemini-install' | 'gemini-auth' | 'openai-setup' | 'complete';

interface StepStatus {
  status: 'pending' | 'active' | 'success' | 'error';
  message?: string;
}

export const ModernSetup: React.FC<ModernSetupProps> = ({
  isOpen,
  onComplete,
  workspaceId,
  globalConfig,
}) => {
  const [phase, setPhase] = useState<SetupPhase>('provider-select');
  const [provider, setProvider] = useState<Provider>(null);
  const [steps, setSteps] = useState<Record<string, StepStatus>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // OpenAI form state
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [openAIModel, setOpenAIModel] = useState('gpt-4o');

  const configAPI = workspaceId
    ? new Config(`${workspaceId}\\.geminiconfig`)
    : globalConfig;

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setPhase('provider-select');
      setProvider(null);
      setSteps({});
      setIsProcessing(false);
      setErrorMessage('');
      setOpenAIApiKey('');
      setOpenAIModel('gpt-4o');
    }
  }, [isOpen]);

  const updateStep = (stepId: string, status: StepStatus) => {
    setSteps(prev => ({ ...prev, [stepId]: status }));
  };

  const handleProviderSelect = async (selectedProvider: 'gemini' | 'openai') => {
    setProvider(selectedProvider);
    setErrorMessage('');

    if (selectedProvider === 'openai') {
      setPhase('openai-setup');
    } else {
      setPhase('gemini-check');
      await checkGeminiSetup();
    }
  };

  const checkGeminiSetup = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      // Check if already configured
      if (configAPI) {
        const existingSettings = await configAPI.loadConfig();
        if (existingSettings?.geminiAuth === true) {
          if (existingSettings.googleCloudProjectId) {
            updateStep('check', { status: 'success', message: 'Gemini は既に設定されています' });
            setPhase('complete');
            setIsProcessing(false);
            return;
          }
        }
      }

      updateStep('check', { status: 'active', message: 'Gemini CLI を確認中...' });

      const result = await geminiCheck(() => {});

      if (result.geminiExists && result.isAuthenticated && result.hasProject) {
        // All set
        updateStep('check', { status: 'success', message: 'Gemini は正常に動作しています' });
        
        if (configAPI) {
          const detectedPaths = await detectGlobalNpmPath(() => {});
          if (detectedPaths.npmPath && detectedPaths.hasGeminiCLI) {
            const geminiPath = `${detectedPaths.npmPath}\\gemini.ps1`;
            const settings = await configAPI.loadConfig();
            if (settings) {
              settings.geminiPath = geminiPath;
              settings.geminiAuth = true;
              await configAPI.saveConfig(settings);
            }
          }
        }

        setPhase('complete');
      } else if (result.geminiExists && result.isAuthenticated && !result.hasProject) {
        // Need Cloud Project
        updateStep('check', { status: 'success', message: 'Gemini CLI は動作していますが、Cloud Projectの設定が必要です' });
        await handleCloudProjectSetup();
      } else if (result.geminiExists && !result.isAuthenticated) {
        // Need auth
        updateStep('check', { status: 'success', message: 'Gemini CLI がインストールされています' });
        setPhase('gemini-auth');
      } else if (result.nodeExists) {
        // Need Gemini install
        updateStep('check', { status: 'success', message: 'Node.js がインストールされています' });
        setPhase('gemini-install');
      } else {
        // Need Node.js
        updateStep('check', { status: 'error', message: 'Node.js がインストールされていません' });
        setErrorMessage('Node.js をインストールしてから再度お試しください: https://nodejs.org/');
      }
    } catch (error) {
      updateStep('check', { status: 'error', message: `エラー: ${error}` });
      setErrorMessage(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeminiInstall = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      updateStep('install', { status: 'active', message: 'Gemini CLI をインストール中...' });
      await setupGemini.installGeminiCLI(() => {});
      updateStep('install', { status: 'success', message: 'Gemini CLI のインストールが完了しました' });
      setPhase('gemini-auth');
    } catch (error) {
      updateStep('install', { status: 'error', message: `インストールエラー: ${error}` });
      setErrorMessage(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeminiAuth = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      updateStep('auth', { status: 'active', message: '認証を開始しています...' });
      await setupGemini.configureAuth(() => {});
      await setupGemini.startAuth(() => {});
      
      updateStep('auth', { status: 'active', message: 'ブラウザで認証を完了してください...' });
      
      // Wait a bit for user to complete auth
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const result = await setupGemini.verifyAuth(() => {});
      
      if (result.success) {
        updateStep('auth', { status: 'success', message: '認証が完了しました' });
        
        if (result.hasProject) {
          await handleCloudProjectSetup();
        } else {
          await handleCloudProjectSetup();
        }
      } else {
        updateStep('auth', { status: 'error', message: '認証が完了していません' });
        setErrorMessage('ブラウザで認証を完了してから「認証確認」をクリックしてください');
      }
    } catch (error) {
      updateStep('auth', { status: 'error', message: `認証エラー: ${error}` });
      setErrorMessage(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloudProjectSetup = async () => {
    // Google Cloud自動セットアップは削除されました
    // 認証が完了したら、ユーザーにセットアップ完了を通知
    try {
      if (configAPI) {
        const settings = await configAPI.loadConfig();
        if (settings) {
          settings.geminiAuth = true;
          await configAPI.saveConfig(settings);
        }
      }
      
      // セットアップ完了
      setPhase('complete');
    } catch (error) {
      console.error('[ModernSetup] Failed to save settings:', error);
      setErrorMessage(`設定の保存に失敗しました: ${error}`);
    }
  };

  const handleOpenAISetup = async () => {
    if (!openAIApiKey.trim()) {
      setErrorMessage('API Key を入力してください');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      updateStep('openai', { status: 'active', message: 'OpenAI 設定を保存中...' });
      
      if (configAPI) {
        const settings = await configAPI.loadConfig();
        if (settings) {
          settings.enableOpenAI = true;
          settings.openAIApiKey = openAIApiKey;
          settings.openAIBaseURL = 'https://models.inference.ai.azure.com';
          settings.openAIModel = openAIModel;
          settings.responseMode = 'stream';
          settings.geminiSetupSkipped = true;
          settings.geminiAuth = false;
          
          await configAPI.saveConfig(settings);
          
          updateStep('openai', { status: 'success', message: 'OpenAI 設定が完了しました' });
          setPhase('complete');
        }
      }
    } catch (error) {
      updateStep('openai', { status: 'error', message: `設定エラー: ${error}` });
      setErrorMessage(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipGemini = async () => {
    if (configAPI) {
      try {
        const settings = await configAPI.loadConfig();
        if (settings) {
          settings.geminiAuth = false;
          settings.geminiSetupSkipped = true;
          await configAPI.saveConfig(settings);
        }
      } catch (error) {
        console.error('[ModernSetup] Failed to save skip flag:', error);
      }
    }
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="modern-setup-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modern-setup-container">
        {/* Header */}
        <div className="modern-setup-header">
          <h1 className="modern-setup-title">
            {phase === 'provider-select' && '🚀 セットアップへようこそ'}
            {phase === 'gemini-check' && '🔍 Gemini 確認'}
            {phase === 'gemini-install' && '📦 Gemini インストール'}
            {phase === 'gemini-auth' && '🔐 Gemini 認証'}
            {phase === 'openai-setup' && '🤖 OpenAI セットアップ'}
            {phase === 'complete' && '✅ セットアップ完了'}
          </h1>
          <p className="modern-setup-subtitle">
            {phase === 'provider-select' && '使用するAIプロバイダーを選択してください'}
            {phase === 'gemini-check' && 'Gemini CLI の状態を確認しています'}
            {phase === 'gemini-install' && 'Gemini CLI をインストールします'}
            {phase === 'gemini-auth' && 'Google アカウントで認証します'}
            {phase === 'openai-setup' && 'OpenAI の設定を行います'}
            {phase === 'complete' && 'すべての設定が完了しました！'}
          </p>
        </div>

        {/* Content */}
        <div className="modern-setup-content">
          {/* Provider Selection */}
          {phase === 'provider-select' && (
            <div className="provider-grid">
              <button
                className="provider-card gemini-card"
                onClick={() => handleProviderSelect('gemini')}
                disabled={isProcessing}
              >
                <div className="provider-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="#4285f4"/>
                    <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="white"/>
                  </svg>
                </div>
                <h3>Google Gemini</h3>
                <p>高度な推論能力とマルチモーダル対応</p>
                <ul>
                  <li>✓ 無料枠あり</li>
                  <li>✓ 高速レスポンス</li>
                  <li>✓ Cloud統合</li>
                </ul>
              </button>

              <button
                className="provider-card openai-card"
                onClick={() => handleProviderSelect('openai')}
                disabled={isProcessing}
              >
                <div className="provider-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/>
                  </svg>
                </div>
                <h3>OpenAI</h3>
                <p>GPT-4を含む強力なAIモデル</p>
                <ul>
                  <li>✓ GPT-4o対応</li>
                  <li>✓ ストリーミング</li>
                  <li>✓ Azure統合</li>
                </ul>
              </button>
            </div>
          )}

          {/* Gemini Setup Steps */}
          {(phase === 'gemini-check' || phase === 'gemini-install' || phase === 'gemini-auth') && (
            <div className="setup-steps">
              {Object.entries(steps).map(([stepId, step]) => (
                <div key={stepId} className={`setup-step setup-step-${step.status}`}>
                  <div className="step-icon">
                    {step.status === 'pending' && '⏳'}
                    {step.status === 'active' && <div className="spinner-small" />}
                    {step.status === 'success' && '✅'}
                    {step.status === 'error' && '❌'}
                  </div>
                  <div className="step-content">
                    <p className="step-message">{step.message}</p>
                  </div>
                </div>
              ))}

              {errorMessage && (
                <div className="error-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* OpenAI Setup Form */}
          {phase === 'openai-setup' && (
            <div className="openai-form">
              <div className="form-field">
                <label htmlFor="apiKey">API Key *</label>
                <input
                  id="apiKey"
                  type="password"
                  value={openAIApiKey}
                  onChange={(e) => setOpenAIApiKey(e.target.value)}
                  placeholder="your-api-key-here"
                  disabled={isProcessing}
                />
              </div>

              <div className="form-field">
                <label htmlFor="baseUrl">Base URL</label>
                <input
                  id="baseUrl"
                  type="text"
                  value="https://models.inference.ai.azure.com"
                  disabled
                />
                <small>Azure AI Inference エンドポイント</small>
              </div>

              <div className="form-field">
                <label htmlFor="model">Model</label>
                <select
                  id="model"
                  value={openAIModel}
                  onChange={(e) => setOpenAIModel(e.target.value)}
                  disabled={isProcessing}
                >
                  <option value="gpt-4o">gpt-4o (推奨)</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4">gpt-4</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>

              {errorMessage && (
                <div className="error-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* Completion */}
          {phase === 'complete' && (
            <div className="completion-card">
              <div className="completion-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#34A853"/>
                  <path d="M9 12.5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>セットアップ完了！</h2>
              <p>
                {provider === 'gemini' && 'Gemini AI の設定が完了しました。チャットを開始できます。'}
                {provider === 'openai' && 'OpenAI の設定が完了しました。チャットを開始できます。'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modern-setup-footer">
          {phase === 'gemini-install' && (
            <>
              <button className="btn-secondary" onClick={handleSkipGemini} disabled={isProcessing}>
                OpenAIのみ使用
              </button>
              <button className="btn-primary" onClick={handleGeminiInstall} disabled={isProcessing}>
                {isProcessing ? <div className="spinner-small" /> : 'インストール開始'}
              </button>
            </>
          )}

          {phase === 'gemini-auth' && (
            <>
              <button className="btn-secondary" onClick={handleSkipGemini} disabled={isProcessing}>
                OpenAIのみ使用
              </button>
              <button className="btn-primary" onClick={handleGeminiAuth} disabled={isProcessing}>
                {isProcessing ? <div className="spinner-small" /> : '認証開始'}
              </button>
            </>
          )}

          {phase === 'openai-setup' && (
            <>
              <button className="btn-secondary" onClick={() => setPhase('provider-select')} disabled={isProcessing}>
                戻る
              </button>
              <button className="btn-primary" onClick={handleOpenAISetup} disabled={isProcessing || !openAIApiKey.trim()}>
                {isProcessing ? <div className="spinner-small" /> : 'セットアップ完了'}
              </button>
            </>
          )}

          {phase === 'complete' && (
            <button className="btn-primary btn-full" onClick={onComplete}>
              開始する
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModernSetup;
