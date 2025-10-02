import React, { useState, useEffect, useRef } from 'react';
import './Setup.css';
import { geminiCheck, setupGemini } from '../utils/setupAPI';

interface SetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

type SetupStep = 'checking' | 'node-install' | 'gemini-install' | 'auth' | 'auth-verify' | 'complete' | 'error';

const SetupModal: React.FC<SetupModalProps> = ({ isOpen, onComplete }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('checking');
  const [logs, setLogs] = useState<string[]>([]);
  const [canProceed, setCanProceed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
    addLog('Gemini CLI のチェックを開始しています...');

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
    addLog('Node.js のインストールを開始します...');
    addLog('ブラウザで https://nodejs.org/ja/download が開かれます');
    addLog('Node.js をダウンロードしてインストールしてください');

    try {
      await setupGemini.installNodeJS(addLog);
      addLog('Node.js のインストール準備が完了しました');
      addLog('インストールが完了したら「次へ」をクリックしてください');
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
    addLog('Node.js のインストールを確認しています...');

    try {
      const result = await geminiCheck(addLog);
      if (result.nodeExists) {
        addLog('✓ Node.js のインストールが確認されました');
        setCurrentStep('gemini-install');
        setCanProceed(true);
      } else {
        addLog('✗ Node.js が見つかりません。再度インストールしてください');
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
    addLog('Gemini CLI のインストールを開始します...');

    try {
      await setupGemini.installGeminiCLI(addLog);
      addLog('✓ Gemini CLI のインストールが完了しました');
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
    addLog('認証設定を開始します...');

    try {
      await setupGemini.configureAuth(addLog);
      addLog('✓ 認証設定が完了しました');
      addLog('認証プロセスを開始します...');
      addLog('ブラウザが開き、Google アカウントでのログインが求められます');
      
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
    addLog('認証完了を確認しています...');

    try {
      const isAuthenticated = await setupGemini.verifyAuth(addLog);
      
      if (isAuthenticated) {
        setCurrentStep('complete');
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

  const getStepTitle = () => {
    switch (currentStep) {
      case 'checking':
        return 'Gemini CLI チェック中';
      case 'node-install':
        return 'Node.js インストール';
      case 'gemini-install':
        return 'Gemini CLI インストール';
      case 'auth':
        return '認証設定';
      case 'auth-verify':
        return '認証確認待ち';
      case 'complete':
        return 'セットアップ完了';
      case 'error':
        return 'エラー';
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
          完了
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
          再試行
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
            Node.js をインストール
          </button>
          <button
            className="setup-button setup-button-secondary"
            onClick={handleNodeInstallComplete}
            disabled={isProcessing || !canProceed}
          >
            インストール完了 - 次へ
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
          Gemini CLI をインストール
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
          認証を開始
        </button>
      );
    }

    if (currentStep === 'auth-verify') {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={handleAuthVerify}
          disabled={isProcessing || !canProceed}
        >
          認証を確認
        </button>
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
              <span>処理中...</span>
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
