import React, { useState, useEffect, useRef } from "react";
import "./Setup.css";
import { geminiCheck, setupGemini } from "../utils/setupAPI";
import { autoSetupCloudProject } from "../utils/cloudSetup";
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
      performCheck();
    }
  }, [isOpen]);

  const performCheck = async () => {
    setIsProcessing(true);
    addLog(t("setup.logs.checkingStart"));

    try {
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
    addLog('[Setup] handleAuthVerify started');
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.authVerifyStart"));

    try {
      addLog('[Setup] Calling setupGemini.verifyAuth');
      addLog('[Debug] verifyAuth を呼び出しています...');

      const result = await setupGemini.verifyAuth(addLog);

      addLog('[Setup] verifyAuth completed');
      addLog(`[Debug] verifyAuth 完了: ${JSON.stringify(result)}`);

      // hasProjectがtrueなら必ずセットアップ完了
      if (result.hasProject === true) {
  addLog('[Setup] Project exists, setting up environment variable');
        addLog("");
        addLog("========================================");
        addLog("✅ Google Cloud Projectが見つかりました");
        addLog("========================================");
        
        // 環境変数を設定
        try {
          addLog("環境変数を設定しています...");
          const { setupExistingProject } = await import('../utils/cloudSetup');
          const envSetupResult = await setupExistingProject(addLog);
          
          if (envSetupResult.success && envSetupResult.projectId) {
            addLog("");
            addLog("✅ セットアップが完了しました!");
            
            if (configAPI) {
                addLog('[Setup] Saving geminiAuth and googleCloudProjectId to config.json');
              addLog("設定を保存しています...");
              const settings = await configAPI.loadConfig();
              if (settings) {
                settings.geminiAuth = true;
                settings.googleCloudProjectId = envSetupResult.projectId;
                await configAPI.saveConfig(settings);
                addLog('[Setup] geminiAuth and googleCloudProjectId saved');
                addLog("✓ 設定を保存しました");
                addLog(`✓ プロジェクトID: ${envSetupResult.projectId}`);
                addLog("今後、このセットアップは不要です");
              }
            }
            
            addLog('[Setup] Moving to complete step');
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
      } else if (result.hasProject === false) {
        // プロジェクトが明示的にfalse（存在しない）の場合のみ自動セットアップを提案
        addLog('[Setup] Cloud setup needed, hasProject: ' + String(result.hasProject));
        addLog('[Setup] No project found, showing auto setup dialog');
          addLog("⚠️ Google Cloud Projectが見つかりません");
          addLog("");

          // 一時的に処理を停止してダイアログを表示
          setIsProcessing(false);

          // ダイアログで自動セットアップを提案
          addLog('[Setup] Showing auto setup confirmation dialog');
          const shouldAutoSetup = await confirm(
            "Google Cloud Projectが見つかりませんでした。\n\n自動的にプロジェクトを作成してGemini APIをセットアップしますか?\n\n※ この操作には数秒かかります",
            { title: "自動セットアップ", kind: "info" }
          );
          addLog(`[Setup] User choice for auto setup: ${shouldAutoSetup}`);

          if (shouldAutoSetup) {
            // 自動セットアップを実行
            addLog('[Setup] Starting auto cloud setup process');
            addLog("");
            addLog("========================================");
            addLog("🚀 自動セットアップを開始します");
            addLog("========================================");
            addLog("");
            setIsProcessing(true);

            try {
              addLog('[Setup] Step 1: Loading OAuth credentials');
              addLog("📋 ステップ 1/5: OAuth認証情報を読み込んでいます...");
              
              addLog('[Setup] Calling autoSetupCloudProject');
              const autoResult = await autoSetupCloudProject(addLog);
              addLog('[Setup] autoSetupCloudProject result: ' + JSON.stringify(autoResult));

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
                  addLog('[Setup] Saving geminiAuth and googleCloudProjectId to config.json');
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
        // hasProjectがfalseでもundefinedでもない場合、または認証未完了
  addLog('[Setup] Auth not completed or project status unclear');
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
        <div className="cloud-setup-container">
          <div className="cloud-setup-info">
            <div className="cloud-setup-title">
              ⚠️ 手動セットアップが必要です
            </div>
            <div className="cloud-setup-description">
              自動セットアップをキャンセルされました。
              <br />
              以下の手順で手動でセットアップしてください:
              <br />
              <div className="cloud-setup-steps">
                1.{" "}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Cloud Console
                </a>{" "}
                にアクセス
                <br />
                2. 新しいプロジェクトを作成
                <br />
                3. Gemini API (generativelanguage.googleapis.com) を有効化
                <br />
                4. 環境変数 <code>GOOGLE_CLOUD_PROJECT</code>{" "}
                にプロジェクトIDを設定
              </div>
              <div className="cloud-setup-hint">
                💡 ヒント: 「←
                戻る」ボタンで認証確認に戻り、再度確認すると自動セットアップを選択できます。
              </div>
            </div>
          </div>
          <div className="cloud-setup-buttons">
            <button
              className="setup-button setup-button-secondary"
              onClick={() => setCurrentStep("auth-verify")}
              disabled={isProcessing}
            >
              ← 戻る
            </button>
            <button
              className="setup-button setup-button-primary"
              onClick={() => setCurrentStep("complete")}
              disabled={isProcessing}
            >
              完了 →
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
              <div className="spinner"></div>
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
