import React, { useState, useEffect, useRef } from "react";
import "./Setup.css";
import { geminiCheck, setupGemini, detectGlobalNpmPath } from "../utils/setupAPI";
import { Config } from "../utils/configAPI";
import { t } from "../utils/i18n";
import { confirm } from "@tauri-apps/plugin-dialog";

interface SetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
  workspaceId?: string; // ワークスペースIDを受け取る
  globalConfig?: Config; // グローバルconfig.jsonのインスタンスを受け取る
}

type SetupStep =
  | "provider-selection"
  | "checking"
  | "node-install"
  | "gemini-install"
  | "auth"
  | "auth-verify"
  | "cloud-setup"
  | "openai-setup"
  | "complete"
  | "error";

const SetupModal: React.FC<SetupModalProps> = ({
  isOpen,
  onComplete,
  workspaceId,
  globalConfig,
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>("provider-selection");
  const [logs, setLogs] = useState<string[]>([]);
  const [canProceed, setCanProceed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [, setSelectedProvider] = useState<'gemini' | 'openai' | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Debug effect for modal open state
  useEffect(() => {
    console.log('[SetupModal] isOpen changed:', isOpen);
  }, [isOpen]);

  // Config APIインスタンス（ワークスペース用またはグローバル）
  const configAPI = workspaceId
    ? new Config(`${workspaceId}\\.geminiconfig`)
    : globalConfig; // グローバルconfigを使用

  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    if (isOpen && currentStep === "provider-selection") {
      // 初回起動時はプロバイダー選択画面を表示
      console.log('[SetupModal] Showing provider selection');
      setCanProceed(true);
      setIsProcessing(false);
    } else if (isOpen && currentStep === "checking") {
      // モーダルが開いてから処理を開始
      // モーダルのレンダリングを確実に完了させるため少し待つ
      const timer = setTimeout(() => {
        console.log('[SetupModal] Starting performCheck after modal render');
        performCheck();
      }, 300); // 300ms待つ（UIスレッドの確実な更新を保証）
      return () => clearTimeout(timer);
    } else if (!isOpen) {
      // モーダルが閉じられたら状態をリセット
      setCurrentStep("provider-selection");
      setSelectedProvider(null);
      setLogs([]);
      setCanProceed(false);
      setIsProcessing(false);
    }
  }, [isOpen, currentStep]);

  const performCheck = async () => {
    setIsProcessing(true);
    addLog(t("setup.logs.checkingStart"));
    addLog("Gemini CLI のセットアップを確認しています...");
    addLog(""); // 空行を追加して読みやすくする

    try {
      // If config indicates auth is already completed, skip running the full geminiCheck
      try {
        if (configAPI) {
          const existingSettings = await configAPI.loadConfig();
          if (existingSettings && existingSettings.geminiAuth === true) {
            addLog(t('setup.logs.authAlreadyComplete'));
            // If project ID is already saved, we can consider setup complete
            if (existingSettings.googleCloudProjectId) {
              addLog(t('setup.logs.googleCloudProjectIdSet'));
              setCurrentStep('complete');
              setCanProceed(true);
            } else {
              // Otherwise move to auth-verify step so user can confirm project status
              addLog(t('setup.logs.googleCloudProjectMissing'));
              setCurrentStep('auth-verify');
              setCanProceed(true);
            }
            setIsProcessing(false);
            return;
          }
        }
      } catch (cfgErr) {
        console.warn('[Setup] 設定読み込み中にエラーが発生しました:', cfgErr);
        // If config read fails, fall back to running the full check
      }
      // 初期セットアップ時にgemini.ps1のパスを検知してconfigに保存
      if (configAPI) {
        const detectedPaths = await detectGlobalNpmPath(addLog);
        if (detectedPaths.npmPath && detectedPaths.hasGeminiCLI) {
          const geminiPath = `${detectedPaths.npmPath}\\gemini.ps1`;
          addLog(`📍 gemini.ps1 パスを設定: ${geminiPath}`);

          // config.jsonに保存
          const currentSettings = await configAPI.loadConfig();
          if (currentSettings) {
            currentSettings.geminiPath = geminiPath;
            await configAPI.saveConfig(currentSettings);
            addLog(t('setup.logs.geminiPathSaved'));
          }
        } else {
          addLog(t('setup.logs.geminiPathDetectFailed'));
        }
      }

      const result = await geminiCheck(addLog);

      if (result.geminiExists && result.isAuthenticated && result.hasProject === true) {
        addLog(t("setup.logs.statusAllComplete"));
        setCurrentStep("complete");
        setCanProceed(true);
      } else if (result.geminiExists && result.isAuthenticated && result.hasProject === false) {
        addLog(t("setup.logs.statusGeminiAuthReady"));
        addLog(t("setup.logs.statusProjectMissing"));
        setCurrentStep("auth-verify");
        setCanProceed(true);
      } else if (result.geminiExists && !result.isAuthenticated) {
        addLog(t("setup.logs.statusGeminiAuthNeeded"));
        setCurrentStep("auth");
        setCanProceed(true);
      } else if (result.nodeExists) {
        addLog(t("setup.logs.statusNodeReadyGeminiMissing"));
        setCurrentStep("gemini-install");
        setCanProceed(true);
      } else {
        addLog(t("setup.logs.statusNodeMissing"));
        setCurrentStep("node-install");
        setCanProceed(true);
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
      setCanProceed(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNodeInstall = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.nodeInstallStart"));

    try {
      await setupGemini.installNodeJS(addLog);
      addLog(t("setup.logs.nodeInstallPrepComplete"));
      addLog(t("setup.logs.nodeInstallCheck"));
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNodeInstallComplete = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.nodeInstallVerify"));

    try {
      const result = await geminiCheck(addLog);
      if (result.nodeExists) {
        addLog(t("setup.logs.nodeInstallConfirmed"));
        setCurrentStep("gemini-install");
        setCanProceed(true);
      } else {
        addLog(t("setup.logs.nodeInstallFailed"));
        setCanProceed(true);
      }
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeminiInstall = async () => {
    setIsProcessing(true);
    setCanProceed(false);

    try {
      await setupGemini.installGeminiCLI(addLog);
      setCurrentStep("auth");
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuth = async () => {
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.authSetupStart"));

    try {
      await setupGemini.configureAuth(addLog);
      addLog("✓ 認証設定が完了しました");
      addLog("認証プロセスを開始します...");
      addLog("ブラウザが開き、Google アカウントでのログインが求められます");
      addLog("");
      addLog(
        '💡 ヒント: "Do you want to connect IDE to Gemini CLI?" が表示されたら "Yes" を選択してください'
      );

      await setupGemini.startAuth(addLog);
      setCurrentStep("auth-verify");
      setCanProceed(true);
    } catch (error) {
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuthVerify = async () => {
  addLog(t('setup.logs.handleAuthVerifyStarted'));
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.authVerifyStart"));

    try {
  addLog(t('setup.logs.callingVerifyAuth'));
  addLog(t('setup.logs.debugVerifyAuth'));

      const result = await setupGemini.verifyAuth(addLog);

  addLog(t('setup.logs.verifyAuthCompleted'));
      addLog(`[Debug] verifyAuth 完了: ${JSON.stringify(result)}`);

      // 認証成功の場合の処理
      if (result.success) {
        // hasProjectがtrueなら既存プロジェクトを使用
        if (result.hasProject === true) {
          addLog(t('setup.logs.projectExistsEnvSetup'));
          addLog("");
          addLog("========================================");
          addLog("✅ Google Cloud Projectが見つかりました");
          addLog("========================================");
          
          // 環境変数設定は不要になりました
          addLog("");
          addLog("✅ セットアップが完了しました!");
          
          if (configAPI) {
            addLog(t('setup.logs.savingAuthAndProject'));
            addLog("設定を保存しています...");
            const settings = await configAPI.loadConfig();
            if (settings) {
              settings.geminiAuth = true;
              await configAPI.saveConfig(settings);
              addLog(t('setup.logs.authAndProjectSaved'));
              addLog("✓ 設定を保存しました");
              addLog(`✓ geminiAuth: ${settings.geminiAuth}`);
              addLog("今後、このセットアップは不要です");
              console.log('[Setup] Successfully saved geminiAuth=true to config');
            } else {
              console.error('[Setup] Failed to load settings for saving geminiAuth');
              addLog('⚠️ 設定の読み込みに失敗しました');
            }
          } else {
            console.error('[Setup] configAPI is not available');
            addLog('⚠️ 設定APIが利用できません');
          }
          
          addLog(t('setup.logs.movingToComplete'));
          setCurrentStep("complete");
          setCanProceed(true);
          return; // early return
        } else if (result.hasProject === false) {
          // プロジェクトが明示的にfalse（存在しない）の場合
          addLog(t('setup.logs.cloudSetupNeeded') + String(result.hasProject));
          addLog(t('setup.logs.noProjectFound'));
          addLog("⚠️ Google Cloud Projectが見つかりません");
          addLog("");
          addLog("💡 手動でセットアップしてください:");
          addLog("  1. https://console.cloud.google.com/ でプロジェクトを作成");
          addLog("  2. Generative Language API を有効化");
          addLog("  3. PowerShell で 'gemini auth' を実行");
          addLog("");
          
          // 設定を保存してセットアップ完了へ
          if (configAPI) {
            const settings = await configAPI.loadConfig();
            if (settings) {
              settings.geminiAuth = true;
              await configAPI.saveConfig(settings);
              addLog("✓ 設定を保存しました");
            }
          }
          
          setCurrentStep("complete");
          setCanProceed(true);
          return;
        } else {
          // hasProjectがundefinedの場合は認証成功として扱う（プロジェクトチェックなし）
          addLog('[Setup] Auth succeeded without project check');
          addLog("");
          addLog("========================================");
          addLog("✅ 認証が完了しました");
          addLog("========================================");
          
          if (configAPI) {
            addLog("設定を保存しています...");
            const settings = await configAPI.loadConfig();
            if (settings) {
              settings.geminiAuth = true;
              await configAPI.saveConfig(settings);
              addLog("✓ 設定を保存しました");
              addLog(`✓ geminiAuth: ${settings.geminiAuth}`);
              addLog("今後、このセットアップは不要です");
              console.log('[Setup] Successfully saved geminiAuth=true to config (no project check)');
            } else {
              console.error('[Setup] Failed to load settings for saving geminiAuth (no project check)');
              addLog('⚠️ 設定の読み込みに失敗しました');
            }
          } else {
            console.error('[Setup] configAPI is not available (no project check)');
            addLog('⚠️ 設定APIが利用できません');
          }
          
          addLog(t('setup.logs.movingToComplete'));
          setCurrentStep("complete");
          setCanProceed(true);
          return; // early return
        }
      } else {
        // 認証失敗の場合
        addLog('[Setup] Auth not completed or verification failed');
        addLog("✗ 認証が完了していないか、セットアップが必要です");
        addLog(
          "PowerShell ウィンドウで認証を完了してから、再度確認してください"
        );
        setCanProceed(true);
      }
    } catch (error) {
      addLog('[Setup] handleAuthVerify error: ' + String(error));
      addLog('[Setup] Error stack: ' + (error instanceof Error ? error.stack : 'N/A'));
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      addLog('[Setup] handleAuthVerify finished');
      setIsProcessing(false);
    }
  };

  const handleProviderSelection = async (provider: 'gemini' | 'openai') => {
    setSelectedProvider(provider);
    setIsProcessing(true);
    setCanProceed(false);

    if (provider === 'openai') {
      // OpenAI選択時の処理
      addLog('');
      addLog('========================================');
      addLog('🤖 OpenAI セットアップを開始します');
      addLog('========================================');
      addLog('');
      
      setCurrentStep('openai-setup');
      setCanProceed(true);
      setIsProcessing(false);
    } else {
      // Gemini選択時の処理
      addLog('');
      addLog('========================================');
      addLog('🤖 Gemini CLI セットアップを開始します');
      addLog('========================================');
      addLog('');
      
      setCurrentStep('checking');
      // performCheck は useEffect で自動的に実行される
    }
  };

  const handleOpenAISetup = async (apiKey: string, model: string) => {
    setIsProcessing(true);
    setCanProceed(false);

    try {
      addLog('');
      addLog('========================================');
      addLog('💾 OpenAI 設定を保存しています...');
      addLog('========================================');
      addLog('');

      if (configAPI) {
        const settings = await configAPI.loadConfig();
        if (settings) {
          settings.enableOpenAI = true;
          settings.openAIApiKey = apiKey;
          settings.openAIBaseURL = 'https://models.inference.ai.azure.com';
          settings.openAIModel = model || 'gpt-4o';
          settings.responseMode = 'stream';
          settings.geminiSetupSkipped = true; // Geminiをスキップ
          settings.geminiAuth = false;

          await configAPI.saveConfig(settings);

          addLog('✓ OpenAI 設定を保存しました');
          addLog(`✓ API Key: ${apiKey ? '***設定済み***' : '未設定'}`);
          addLog(`✓ Base URL: ${settings.openAIBaseURL}`);
          addLog(`✓ Model: ${settings.openAIModel}`);
          addLog(`✓ Response Mode: stream`);
          addLog('');
          addLog('🎉 OpenAI セットアップが完了しました！');
          addLog('');

          setCurrentStep('complete');
          setCanProceed(true);
        }
      }
    } catch (error) {
      addLog(`❌ エラー: ${error}`);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSetup = async () => {
    const shouldCancel = await confirm(
      "⚠️ Geminiセットアップをキャンセルしますか?\n\n" +
      "【重要】キャンセルすると:\n" +
      "✓ OpenAI APIのみ使用可能になります\n" +
      "✗ Gemini AIは使用できません\n\n" +
      "後からセットアップを再開することもできます。",
      { 
        title: "セットアップのキャンセル", 
        kind: "warning",
        okLabel: "キャンセルする",
        cancelLabel: "続ける"
      }
    );

    if (shouldCancel) {
      addLog('');
      addLog('========================================');
      addLog('⚠️ セットアップがキャンセルされました');
      addLog('========================================');
      addLog('');
      addLog('📌 重要な情報:');
      addLog('  ✓ OpenAI APIは引き続き使用できます');
      addLog('  ✗ Gemini AIは使用できません');
      addLog('');
      addLog('💡 後からセットアップを再開するには:');
      addLog('  1. 設定画面を開く');
      addLog('  2. 「Geminiセットアップを再実行」をクリック');
      addLog('');

      // config.jsonにスキップフラグを保存
      if (configAPI) {
        try {
          const settings = await configAPI.loadConfig();
          if (settings) {
            settings.geminiAuth = false;
            settings.geminiSetupSkipped = true;
            await configAPI.saveConfig(settings);
            addLog('✓ 設定を保存しました（Geminiセットアップスキップ）');
            console.log('[Setup] User cancelled Gemini setup, saved skip flag');
          }
        } catch (error) {
          console.error('[Setup] Failed to save skip flag:', error);
          addLog('⚠️ 設定の保存に失敗しました');
        }
      }

      // 完了状態にして閉じる
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "provider-selection":
        return "AIプロバイダーの選択";
      case "checking":
        return t("setup.checking");
      case "node-install":
        return t("setup.nodeInstall");
      case "gemini-install":
        return t("setup.geminiInstall");
      case "auth":
        return t("setup.auth");
      case "auth-verify":
        return "認証確認待ち";
      case "cloud-setup":
        return "Google Cloud Project 設定";
      case "openai-setup":
        return "OpenAI セットアップ";
      case "complete":
        return t("setup.complete");
      case "error":
        return t("setup.error");
      default:
        return "";
    }
  };

  const getActionButton = () => {
    if (currentStep === "provider-selection") {
      return <ProviderSelectionUI onSelect={handleProviderSelection} />;
    }

    if (currentStep === "openai-setup") {
      return <OpenAISetupUI onSetup={handleOpenAISetup} isProcessing={isProcessing} />;
    }

    if (currentStep === "complete") {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={onComplete}
          disabled={isProcessing}
        >
          {t("setup.finish")}
        </button>
      );
    }

    if (currentStep === "error") {
      return (
        <button
          className="setup-button setup-button-secondary"
          onClick={() => {
            setLogs([]);
            setCurrentStep("checking");
            performCheck();
          }}
          disabled={isProcessing}
        >
          {t("setup.retry")}
        </button>
      );
    }

    if (currentStep === "node-install") {
      return (
        <>
          <button
            className="setup-button setup-button-primary"
            onClick={handleNodeInstall}
            disabled={isProcessing || !canProceed}
          >
            {t("setup.installNode")}
          </button>
          <button
            className="setup-button setup-button-secondary"
            onClick={handleNodeInstallComplete}
            disabled={isProcessing || !canProceed}
          >
            {t("setup.installComplete")}
          </button>
        </>
      );
    }

    if (currentStep === "gemini-install") {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={handleGeminiInstall}
          disabled={isProcessing || !canProceed}
        >
          {t("setup.installGemini")}
        </button>
      );
    }

    if (currentStep === "auth") {
      return (
        <button
          className="setup-button setup-button-primary"
          onClick={handleAuth}
          disabled={isProcessing || !canProceed}
        >
          {t("setup.startAuth")}
        </button>
      );
    }

    if (currentStep === "auth-verify") {
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

    if (currentStep === "cloud-setup") {
      return (
        <div className="manual-setup-container">
          {/* Header Section with Google Cloud Branding */}
          <div className="manual-setup-header">
            <div className="manual-setup-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="#4285f4"/>
                <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="white"/>
              </svg>
            </div>
            <h3 className="manual-setup-title">Google Cloud プロジェクトの設定</h3>
            <p className="manual-setup-subtitle">
              Gemini APIを使用するには、Google Cloudプロジェクトの設定が必要です
            </p>
          </div>

          {/* Step Cards */}
          <div className="manual-setup-steps">
            {/* Step 1 */}
            <div className="manual-setup-step-card">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4 className="step-title">Google Cloud Consoleにアクセス</h4>
                <p className="step-description">
                  Google Cloudの管理画面を開きます
                </p>
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="step-link"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                  </svg>
                  コンソールを開く
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="manual-setup-step-card">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4 className="step-title">新しいプロジェクトを作成</h4>
                <p className="step-description">
                  コンソール上部の「プロジェクトを選択」→「新しいプロジェクト」をクリック
                </p>
                <div className="step-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  プロジェクト名は任意です（例: gemini-app）
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="manual-setup-step-card">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4 className="step-title">Gemini APIを有効化</h4>
                <p className="step-description">
                  「APIとサービス」→「ライブラリ」から以下のAPIを有効にします
                </p>
                <code className="step-code">generativelanguage.googleapis.com</code>
                <div className="step-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  検索バーで「Generative Language API」を検索してください
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="manual-setup-step-card">
              <div className="step-number">4</div>
              <div className="step-content">
                <h4 className="step-title">環境変数を設定</h4>
                <p className="step-description">
                  プロジェクトIDをコピーして、以下の環境変数に設定します
                </p>
                <code className="step-code">GOOGLE_CLOUD_PROJECT</code>
                <div className="step-note important">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                  </svg>
                  環境変数は、システムの環境変数またはユーザー環境変数に設定してください
                </div>
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="manual-setup-help">
            <div className="help-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
              </svg>
            </div>
            <div className="help-content">
              <p className="help-text">
                💡 <strong>ヒント:</strong> 「戻る」ボタンで認証確認画面に戻り、自動セットアップを再度試すこともできます
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="manual-setup-actions">
            <button
              className="setup-button setup-button-secondary"
              onClick={() => setCurrentStep("auth-verify")}
              disabled={isProcessing}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
              戻る
            </button>
            <button
              className="setup-button setup-button-primary"
              onClick={() => setCurrentStep("complete")}
              disabled={isProcessing}
            >
              セットアップ完了
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </button>
          </div>
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
            <div
              className={`setup-progress-step ${
                currentStep !== "checking" ? "completed" : "active"
              }`}
            >
              1
            </div>
            <div
              className={`setup-progress-line ${
                currentStep !== "checking" && currentStep !== "node-install"
                  ? "completed"
                  : ""
              }`}
            ></div>
            <div
              className={`setup-progress-step ${
                currentStep === "gemini-install" ||
                currentStep === "auth" ||
                currentStep === "auth-verify" ||
                currentStep === "complete"
                  ? "completed"
                  : currentStep === "node-install"
                  ? "active"
                  : ""
              }`}
            >
              2
            </div>
            <div
              className={`setup-progress-line ${
                currentStep === "auth" ||
                currentStep === "auth-verify" ||
                currentStep === "complete"
                  ? "completed"
                  : ""
              }`}
            ></div>
            <div
              className={`setup-progress-step ${
                currentStep === "complete"
                  ? "completed"
                  : currentStep === "auth" || currentStep === "auth-verify"
                  ? "active"
                  : ""
              }`}
            >
              3
            </div>
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
              {/* Replace ring spinner with 3-dot processing indicator */}
              <div className="processing-dots" aria-hidden>
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
              {/* Show localized label; some places expect "setup.processing" -> Japanese json has "処理中..." */}
              <span>{t("setup.processing")}</span>
            </div>
          )}
          <div className="setup-actions">
            {/* キャンセルボタンを追加（provider-selection, openai-setup, complete, error ステップ以外で表示） */}
            {currentStep !== "provider-selection" && 
             currentStep !== "openai-setup" && 
             currentStep !== "complete" && 
             currentStep !== "error" && (
              <button
                className="setup-button setup-button-danger"
                onClick={handleCancelSetup}
                disabled={isProcessing}
                style={{ marginRight: "auto" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: "4px" }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                キャンセル（OpenAIのみ使用）
              </button>
            )}
            {getActionButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

// プロバイダー選択UI
interface ProviderSelectionUIProps {
  onSelect: (provider: 'gemini' | 'openai') => void;
}

const ProviderSelectionUI: React.FC<ProviderSelectionUIProps> = ({ onSelect }) => {
  return (
    <div className="provider-selection-container">
      <h3 className="provider-selection-title">使用するAIプロバイダーを選択してください</h3>
      <p className="provider-selection-subtitle">
        後から設定画面で変更することもできます
      </p>

      <div className="provider-cards">
        {/* Gemini Card */}
        <button
          className="provider-card"
          onClick={() => onSelect('gemini')}
        >
          <div className="provider-icon gemini-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="#4285f4"/>
              <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="white"/>
            </svg>
          </div>
          <h4 className="provider-name">Google Gemini</h4>
          <p className="provider-description">
            Google の最新AI。高度な推論能力とマルチモーダル対応。
          </p>
          <ul className="provider-features">
            <li>✓ 無料枠あり</li>
            <li>✓ 高速なレスポンス</li>
            <li>✓ Google Cloud統合</li>
          </ul>
        </button>

        {/* OpenAI Card */}
        <button
          className="provider-card"
          onClick={() => onSelect('openai')}
        >
          <div className="provider-icon openai-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
            </svg>
          </div>
          <h4 className="provider-name">OpenAI</h4>
          <p className="provider-description">
            GPT-4を含む強力なAIモデル。ストリーミング対応で快適なチャット体験。
          </p>
          <ul className="provider-features">
            <li>✓ GPT-4o対応</li>
            <li>✓ ストリーミングモード</li>
            <li>✓ Azure統合</li>
          </ul>
        </button>
      </div>
    </div>
  );
};

// OpenAIセットアップUI
interface OpenAISetupUIProps {
  onSetup: (apiKey: string, model: string) => void;
  isProcessing: boolean;
}

const OpenAISetupUI: React.FC<OpenAISetupUIProps> = ({ onSetup, isProcessing }) => {
  const [apiKey, setApiKey] = React.useState('');
  const [model, setModel] = React.useState('gpt-4o');

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      alert('API Keyを入力してください');
      return;
    }
    onSetup(apiKey, model);
  };

  return (
    <div className="openai-setup-container">
      <div className="openai-setup-header">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="openai-logo">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
        </svg>
        <h3>OpenAI セットアップ</h3>
        <p>Azure OpenAI Service の設定を行います</p>
      </div>

      <div className="openai-setup-form">
        <div className="form-group">
          <label htmlFor="apiKey">API Key *</label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="your-api-key-here"
            className="form-input"
            disabled={isProcessing}
          />
          <p className="form-help">Azure OpenAI Service の API キーを入力してください</p>
        </div>

        <div className="form-group">
          <label htmlFor="baseUrl">Base URL</label>
          <input
            id="baseUrl"
            type="text"
            value="https://models.inference.ai.azure.com"
            disabled
            className="form-input"
          />
          <p className="form-help">デフォルト: Azure AI Inference エンドポイント</p>
        </div>

        <div className="form-group">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="form-select"
            disabled={isProcessing}
          >
            <option value="gpt-4o">gpt-4o (推奨)</option>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4">gpt-4</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
          </select>
          <p className="form-help">使用するモデルを選択してください</p>
        </div>

        <div className="form-info">
          <p>📌 <strong>自動設定される項目:</strong></p>
          <ul>
            <li>✓ Response Mode: <strong>stream</strong> (ストリーミングモード)</li>
            <li>✓ OpenAI: <strong>有効</strong></li>
          </ul>
        </div>

        <button
          className="setup-button setup-button-primary"
          onClick={handleSubmit}
          disabled={isProcessing || !apiKey.trim()}
        >
          セットアップ完了
        </button>
      </div>
    </div>
  );
};

export default SetupModal;
