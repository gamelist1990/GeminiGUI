import React, { useState, useEffect, useRef } from 'react';
import './Setup.css';
import { geminiCheck, setupGemini } from '../utils/setupAPI';
import { autoSetupCloudProject } from '../utils/cloudSetup';
import { Config } from '../utils/configAPI';
import { t } from '../utils/i18n';

interface SetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
  workspaceId?: string; // ワークスペースIDを受け取る
}

type SetupStep = 'checking' | 'node-install' | 'gemini-install' | 'auth' | 'auth-verify' | 'cloud-setup' | 'complete' | 'error';

const SetupModal: React.FC<SetupModalProps> = ({ isOpen, onComplete, workspaceId }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('checking');
  const [logs, setLogs] = useState<string[]>([]);
  const [canProceed, setCanProceed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Config APIインスタンス
  const configAPI = workspaceId ? new Config(`${workspaceId}\\.geminiconfig`) : null;

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    if (isOpen && currentStep === 'checking') {
      performCheck();
    }
  }, [isOpen]);

  const performCheck = async () => {
    setIsProcessing(true);
    addLog(t('setup.logs.checkingStart'));

    try {
      const result = await geminiCheck(addLog);
      
      if (result.geminiExists && result.isAuthenticated) {
        addLog('✓ Gemini CLI が既にインストールされています');
        addLog('✓ Google アカウント認証も完了しています');
        setCurrentStep('complete');
        setCanProceed(true);
      } else if (result.geminiExists && !result.isAuthenticated) {
        addLog('✓ Gemini CLI がインストールされています');
        addLog('✗ Google アカウント認証が必要です');
        setCurrentStep('auth');
        setCanProceed(true);
      } else if (result.nodeExists) {
        addLog('✓ Node.js がインストールされています');
        addLog('✗ Gemini CLI がインストールされていません');
        setCurrentStep('gemini-install');
        setCanProceed(true);
      } else {
        addLog('✗ Node.js がインストールされていません');
        setCurrentStep('node-install');
        setCanProceed(true);
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
      setCanProceed(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNodeInstall = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t('setup.logs.nodeInstallStart'));
    addLog(t('setup.logs.nodeDownloadPage'));
    addLog(t('setup.logs.nodeInstallInstructions'));

    try {
      await setupGemini.installNodeJS(addLog);
      addLog(t('setup.logs.nodeInstallPrepComplete'));
      addLog(t('setup.logs.nodeInstallCheck'));
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNodeInstallComplete = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t('setup.logs.nodeInstallVerify'));

    try {
      const result = await geminiCheck(addLog);
      if (result.nodeExists) {
        addLog(t('setup.logs.nodeInstallConfirmed'));
        setCurrentStep('gemini-install');
        setCanProceed(true);
      } else {
        addLog(t('setup.logs.nodeInstallFailed'));
        setCanProceed(true);
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeminiInstall = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t('setup.logs.geminiInstallStart'));

    try {
      await setupGemini.installGeminiCLI(addLog);
      addLog(t('setup.logs.geminiInstallComplete'));
      setCurrentStep('auth');
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuth = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t('setup.logs.authSetupStart'));

    try {
      await setupGemini.configureAuth(addLog);
      addLog('✓ 認証設定が完了しました');
      addLog('認証プロセスを開始します...');
      addLog('ブラウザが開き、Google アカウントでのログインが求められます');
      addLog('');
      addLog('💡 ヒント: "Do you want to connect IDE to Gemini CLI?" が表示されたら "Yes" を選択してください');
      
      await setupGemini.startAuth(addLog);
      setCurrentStep('auth-verify');
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuthVerify = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t('setup.logs.authVerifyStart'));

    try {
      const result = await setupGemini.verifyAuth(addLog);
      
      if (result.success && result.hasProject) {
        // 認証成功 & プロジェクト存在 -> config.jsonに保存
        addLog('');
        addLog('========================================');
        addLog('✅ Gemini CLIのセットアップが完了しました!');
        addLog('========================================');
        
        if (configAPI) {
          addLog('設定を保存しています...');
          const settings = await configAPI.loadConfig();
          if (settings) {
            settings.geminiAuth = true;
            await configAPI.saveConfig(settings);
            addLog('✓ 設定を保存しました');
            addLog('今後、このセットアップは不要です');
          }
        }
        
        setCurrentStep('complete');
        setCanProceed(true);
      } else if (result.needsCloudSetup) {
        if (result.hasProject === false) {
          addLog('⚠️ Google Cloud Projectが見つかりません');
          addLog('自動セットアップでプロジェクトを作成します');
        } else {
          addLog('⚠️ Google Cloud Project の設定が必要です');
        }
        addLog('');
        setCurrentStep('cloud-setup');
        setCanProceed(true);
      } else {
        addLog('✗ 認証が完了していません');
        addLog('PowerShell ウィンドウで認証を完了してから、再度確認してください');
        setCanProceed(true);
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // handleCloudSetup 削除 (自動セットアップのみ使用)

  const handleAutoCloudSetup = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog('========================================');
    addLog('🤖 自動セットアップモードを開始します');
    addLog('========================================');
    addLog('');
    
    try {
      const result = await autoSetupCloudProject(addLog);
      
      if (result.success && result.projectId) {
        addLog('');
        addLog('========================================');
        addLog('✅ 自動セットアップが完了しました!');
        addLog('========================================');
        addLog(`プロジェクトID: ${result.projectId}`);
        
        // config.jsonに保存
        if (configAPI) {
          addLog('設定を保存しています...');
          const settings = await configAPI.loadConfig();
          if (settings) {
            settings.geminiAuth = true;
            await configAPI.saveConfig(settings);
            addLog('✓ 設定を保存しました');
            addLog('今後、このセットアップは不要です');
          }
        }
        
        setCurrentStep('complete');
        setCanProceed(true);
      } else {
        addLog('');
        addLog('========================================');
        addLog('⚠️ 自動セットアップが完了できませんでした');
        addLog('========================================');
        if (result.projectId) {
          addLog(`プロジェクトID: ${result.projectId}`);
        }
        addLog('エラーが発生しました。もう一度試すか、管理者にお問い合わせください。');
        setCanProceed(true);
        setCurrentStep('error');
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // handleEnableGeminiAPI 削除 (自動セットアップのみ使用)

  // handleSetEnvVar 削除 (自動セットアップのみ使用)

  const getStepTitle = () => {
    switch (currentStep) {
      case 'checking':
        return t('setup.checking');
      case 'node-install':
        return t('setup.nodeInstall');
      case 'gemini-install':
        return t('setup.geminiInstall');
      case 'auth':
        return t('setup.auth');
      case 'auth-verify':
        return '認証確認待ち';
      case 'cloud-setup':
        return 'Google Cloud Project 設定';
      case 'complete':
        return t('setup.complete');
      case 'error':
        return t('setup.error');
      default:
        return '';
    }
  };

  const getActionButton = () => {
    if (currentStep === 'complete') {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={onComplete}
          disabled={isProcessing}
        >
          {t('setup.finish')}
        </button>
      );
    }

    if (currentStep === 'error') {
      return (
        <button
          className="setup-button setup-button-secondary"
          onClick={() => {
            setLogs([]);
            setCurrentStep('checking');
            performCheck();
          }}
          disabled={isProcessing}
        >
          {t('setup.retry')}
        </button>
      );
    }

    if (currentStep === 'node-install') {
      return (
        <>
          <button
            className="setup-button setup-button-primary"
            onClick={handleNodeInstall}
            disabled={isProcessing || !canProceed}
          >
            {t('setup.installNode')}
          </button>
          <button
            className="setup-button setup-button-secondary"
            onClick={handleNodeInstallComplete}
            disabled={isProcessing || !canProceed}
          >
            {t('setup.installComplete')}
          </button>
        </>
      );
    }

    if (currentStep === 'gemini-install') {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={handleGeminiInstall}
          disabled={isProcessing || !canProceed}
        >
          {t('setup.installGemini')}
        </button>
      );
    }

    if (currentStep === 'auth') {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={handleAuth}
          disabled={isProcessing || !canProceed}
        >
          {t('setup.startAuth')}
        </button>
      );
    }

    if (currentStep === 'auth-verify') {
      return (
        <>
          <button
            className="setup-button setup-button-primary"
            onClick={handleAuthVerify}
            disabled={isProcessing || !canProceed}
          >
            認証を確認
          </button>
          <button
            className="setup-button setup-button-secondary"
            onClick={handleAutoCloudSetup}
            disabled={isProcessing}
            title="Google Cloud Projectエラーが発生した場合にクリック"
          >
            🚀 Cloud自動セットアップ
          </button>
        </>
      );
    }

    if (currentStep === 'cloud-setup') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div style={{ 
            padding: '16px', 
            backgroundColor: 'var(--vscode-textBlockQuote-background)',
            borderRadius: '4px',
            marginBottom: '8px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
              🤖 Google Cloud Project 自動セットアップ
            </div>
            <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', lineHeight: '1.6' }}>
              以下を全自動で実行します:<br/>
              <div style={{ marginLeft: '16px', marginTop: '8px' }}>
                ✓ Google Cloud Projectの作成<br/>
                ✓ Gemini APIの有効化<br/>
                ✓ 環境変数の設定<br/>
                ✓ 設定の保存
              </div>
              <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'var(--vscode-input-background)', borderRadius: '4px' }}>
                💡 OAuth認証情報を使用して約10秒で完了します
              </div>
            </div>
          </div>
          <button
            className="setup-button setup-button-primary"
            onClick={handleAutoCloudSetup}
            disabled={isProcessing || !canProceed}
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              fontWeight: 'bold',
              fontSize: '15px',
              padding: '12px'
            }}
          >
            🚀 自動セットアップを開始
          </button>
        </div>
      );
    }

    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="setup-modal-overlay">
      <div className="setup-modal">
        <div className="setup-modal-header">
          <h2>{getStepTitle()}</h2>
          <div className="setup-progress">
            <div className={`setup-progress-step ${currentStep !== 'checking' ? 'completed' : 'active'}`}>1</div>
            <div className={`setup-progress-line ${currentStep !== 'checking' && currentStep !== 'node-install' ? 'completed' : ''}`}></div>
            <div className={`setup-progress-step ${currentStep === 'gemini-install' || currentStep === 'auth' || currentStep === 'auth-verify' || currentStep === 'complete' ? 'completed' : currentStep === 'node-install' ? 'active' : ''}`}>2</div>
            <div className={`setup-progress-line ${currentStep === 'auth' || currentStep === 'auth-verify' || currentStep === 'complete' ? 'completed' : ''}`}></div>
            <div className={`setup-progress-step ${currentStep === 'complete' ? 'completed' : currentStep === 'auth' || currentStep === 'auth-verify' ? 'active' : ''}`}>3</div>
          </div>
        </div>

        <div className="setup-modal-body">
          <div className="setup-logs">
            {logs.map((log, index) => (
              <div key={index} className="setup-log-entry">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="setup-modal-footer">
          {isProcessing && (
            <div className="setup-spinner">
              <div className="spinner"></div>
              <span>{t('setup.processing')}</span>
            </div>
          )}
          <div className="setup-actions">
            {getActionButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupModal;
