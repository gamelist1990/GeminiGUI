import React, { useState, useEffect, useRef } from "react";
import "./Setup.css";
import { geminiCheck, setupGemini, detectGlobalNpmPath } from "../utils/setupAPI";
import { autoSetupCloudProject, setupExistingProject } from "../utils/cloudSetup";
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
  | "checking"
  | "node-install"
  | "gemini-install"
  | "auth"
  | "auth-verify"
  | "cloud-setup"
  | "complete"
  | "error";

const SetupModal: React.FC<SetupModalProps> = ({
  isOpen,
  onComplete,
  workspaceId,
  globalConfig,
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>("checking");
  const [logs, setLogs] = useState<string[]>([]);
  const [canProceed, setCanProceed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
    if (isOpen && currentStep === "checking") {
      // モーダルが開いてから少し待ってから処理を開始
      // アプリケーション起動時の自動チェックの場合はより長めに待つ
      const timer = setTimeout(() => {
        performCheck();
      }, 500); // 500ms待つ
      return () => clearTimeout(timer);
    } else if (!isOpen) {
      // モーダルが閉じられたら状態をリセット
      setCurrentStep("checking");
      setLogs([]);
      setCanProceed(false);
      setIsProcessing(false);
    }
  }, [isOpen]);

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
          
          // 環境変数を設定
          try {
            addLog("環境変数を設定しています...");
            const envSetupResult = await setupExistingProject(addLog);
            
            if (envSetupResult.success && envSetupResult.projectId) {
              addLog("");
              addLog("✅ セットアップが完了しました!");
              
              if (configAPI) {
                  addLog(t('setup.logs.savingAuthAndProject'));
                addLog("設定を保存しています...");
                const settings = await configAPI.loadConfig();
                if (settings) {
                  settings.geminiAuth = true;
                  settings.googleCloudProjectId = envSetupResult.projectId;
                  await configAPI.saveConfig(settings);
                  addLog(t('setup.logs.authAndProjectSaved'));
                  addLog("✓ 設定を保存しました");
                  addLog(`✓ プロジェクトID: ${envSetupResult.projectId}`);
                  addLog("今後、このセットアップは不要です");
                }
              }
              
              addLog(t('setup.logs.movingToComplete'));
              setCurrentStep("complete");
              setCanProceed(true);
            } else {
              addLog("⚠️ 環境変数の設定に失敗しました");
              addLog("手動で設定してください");
              setCanProceed(true);
            }
          } catch (error) {
            console.error('[Setup] Environment setup error:', error);
            addLog(`エラー: ${error}`);
            setCanProceed(true);
          }
          return; // early return
        } else if (result.hasProject === false) {
        // プロジェクトが明示的にfalse（存在しない）の場合のみ自動セットアップを提案
  addLog(t('setup.logs.cloudSetupNeeded') + String(result.hasProject));
  addLog(t('setup.logs.noProjectFound'));
          addLog("⚠️ Google Cloud Projectが見つかりません");
          addLog("");

          // 一時的に処理を停止してダイアログを表示
          setIsProcessing(false);

          // ダイアログで自動セットアップを提案
          addLog(t('setup.logs.showingAutoSetupDialog'));
          const shouldAutoSetup = await confirm(
            "Google Cloud Projectが見つかりませんでした。\n\n自動的にプロジェクトを作成してGemini APIをセットアップしますか?\n\n※ この操作には数秒かかります",
            { title: "自動セットアップ", kind: "info" }
          );
          addLog(`[Setup] User choice for auto setup: ${shouldAutoSetup}`);

          if (shouldAutoSetup) {
            // 自動セットアップを実行
            addLog(t('setup.logs.startingAutoCloudSetup'));
            addLog("");
            addLog("========================================");
            addLog("🚀 自動セットアップを開始します");
            addLog("========================================");
            addLog("");
            setIsProcessing(true);

            try {
              addLog(t('setup.logs.stepLoadingOAuth'));
              addLog("📋 ステップ 1/5: OAuth認証情報を読み込んでいます...");
              
              addLog(t('setup.logs.callingAutoSetupCloudProject'));
              const autoResult = await autoSetupCloudProject(addLog);
              addLog(t('setup.logs.autoSetupResult') + JSON.stringify(autoResult));

              if (autoResult.success && autoResult.projectId) {
                addLog(`[Setup] Auto setup succeeded with project ID: ${autoResult.projectId}`);
                addLog("");
                addLog("========================================");
                addLog("✅ 自動セットアップが完了しました!");
                addLog("========================================");
                addLog(`📦 プロジェクトID: ${autoResult.projectId}`);
                addLog("✓ Gemini APIが有効化されました");
                addLog("✓ 環境変数が設定されました");
                addLog("");

                // config.jsonに保存
                if (configAPI) {
                  addLog(t('setup.logs.savingAuthAndProject'));
                  addLog("💾 設定を保存しています...");
                  const settings = await configAPI.loadConfig();
                  if (settings) {
                    settings.geminiAuth = true;
                    settings.googleCloudProjectId = autoResult.projectId;
                    await configAPI.saveConfig(settings);
                    addLog('[Setup] geminiAuth and googleCloudProjectId saved successfully');
                    addLog("✓ 設定を保存しました");
                    addLog(`✓ プロジェクトID: ${autoResult.projectId}`);
                    addLog("✓ 今後、このセットアップは不要です");
                    addLog("");
                  }
                } else {
                  console.warn('[Setup] configAPI not available, cannot save geminiAuth');
                }

                addLog("🎉 すべてのセットアップが完了しました!");
                addLog("");
                addLog('[Setup] Moving to complete step');
                setCurrentStep("complete");
                setCanProceed(true);
              } else {
                addLog('[Setup] Auto setup failed: ' + JSON.stringify(autoResult));
                addLog("");
                addLog("========================================");
                addLog("⚠️ 自動セットアップが完了できませんでした");
                addLog("========================================");
                addLog("手動でセットアップを行うか、再度試してください");
                addLog("");
                setCurrentStep("cloud-setup");
                setCanProceed(true);
              }
            } catch (error) {
              console.error('[Setup] Auto setup error:', error);
              console.error('[Setup] Error stack:', error instanceof Error ? error.stack : 'N/A');
              addLog("");
              addLog("========================================");
              addLog("❌ 自動セットアップエラー");
              addLog("========================================");
              addLog(`エラー内容: ${error}`);
              addLog("");
              addLog("💡 対処方法:");
              addLog("  1. 認証確認画面に戻り、再度試してください");
              addLog("  2. それでも失敗する場合は手動セットアップを行ってください");
              addLog("");
              setCurrentStep("cloud-setup");
              setCanProceed(true);
            } finally {
                addLog('[Setup] Auto setup process finished');
              setIsProcessing(false);
            }
          } else {
            // キャンセルされた場合は手動セットアップへ
            addLog('[Setup] User cancelled auto setup, moving to manual setup');
            addLog("手動セットアップモードに切り替えます");
            addLog("");
            setCurrentStep("cloud-setup");
            setCanProceed(true);
          }
          return; // early return
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
              addLog("今後、このセットアップは不要です");
            }
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

  const getStepTitle = () => {
    switch (currentStep) {
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
      case "complete":
        return t("setup.complete");
      case "error":
        return t("setup.error");
      default:
        return "";
    }
  };

  const getActionButton = () => {
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
          <div className="setup-actions">{getActionButton()}</div>
        </div>
      </div>
    </div>
  );
};

export default SetupModal;
