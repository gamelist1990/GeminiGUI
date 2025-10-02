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
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>("checking");
  const [logs, setLogs] = useState<string[]>([]);
  const [canProceed, setCanProceed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Config APIインスタンス
  const configAPI = workspaceId
    ? new Config(`${workspaceId}\\.geminiconfig`)
    : null;

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

      if (result.geminiExists && result.isAuthenticated) {
        addLog("✓ Gemini CLI が既にインストールされています");
        addLog("✓ Google アカウント認証も完了しています");
        setCurrentStep("complete");
        setCanProceed(true);
      } else if (result.geminiExists && !result.isAuthenticated) {
        addLog("✓ Gemini CLI がインストールされています");
        addLog("✗ Google アカウント認証が必要です");
        setCurrentStep("auth");
        setCanProceed(true);
      } else if (result.nodeExists) {
        addLog("✓ Node.js がインストールされています");
        addLog("✗ Gemini CLI がインストールされていません");
        setCurrentStep("gemini-install");
        setCanProceed(true);
      } else {
        addLog("✗ Node.js がインストールされていません");
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
    addLog(t("setup.logs.nodeDownloadPage"));
    addLog(t("setup.logs.nodeInstallInstructions"));

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
    addLog(t("setup.logs.geminiInstallStart"));

    try {
      await setupGemini.installGeminiCLI(addLog);
      addLog(t("setup.logs.geminiInstallComplete"));
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
    console.log('[Setup] handleAuthVerify started');
    setIsProcessing(true);
    setCanProceed(false);
    addLog(t("setup.logs.authVerifyStart"));

    try {
      console.log('[Setup] Calling setupGemini.verifyAuth');
      const result = await setupGemini.verifyAuth(addLog);
      console.log('[Setup] verifyAuth result:', result);

      if (result.success && result.hasProject) {
        // 認証成功 & プロジェクト存在 -> config.jsonに保存
        console.log('[Setup] Auth verified and project exists');
        addLog("");
        addLog("========================================");
        addLog("✅ Gemini CLIのセットアップが完了しました!");
        addLog("========================================");

        if (configAPI) {
          console.log('[Setup] Saving geminiAuth to config.json (project exists)');
          addLog("設定を保存しています...");
          const settings = await configAPI.loadConfig();
          if (settings) {
            settings.geminiAuth = true;
            await configAPI.saveConfig(settings);
            console.log('[Setup] geminiAuth saved (project exists)');
            addLog("✓ 設定を保存しました");
            addLog("今後、このセットアップは不要です");
          }
        }

        console.log('[Setup] Moving to complete step');
        setCurrentStep("complete");
        setCanProceed(true);
      } else if (result.needsCloudSetup && result.hasProject === false) {
        // プロジェクトが明示的にfalse（存在しない）の場合のみ自動セットアップを提案
        console.log('[Setup] Cloud setup needed, hasProject:', result.hasProject);
        console.log('[Setup] No project found, showing auto setup dialog');
          addLog("⚠️ Google Cloud Projectが見つかりません");
          addLog("");

          // 一時的に処理を停止してダイアログを表示
          setIsProcessing(false);

          // ダイアログで自動セットアップを提案
          console.log('[Setup] Showing auto setup confirmation dialog');
          const shouldAutoSetup = await confirm(
            "Google Cloud Projectが見つかりませんでした。\n\n自動的にプロジェクトを作成してGemini APIをセットアップしますか?\n\n※ この操作には数秒かかります",
            { title: "自動セットアップ", kind: "info" }
          );
          console.log(`[Setup] User choice for auto setup: ${shouldAutoSetup}`);

          if (shouldAutoSetup) {
            // 自動セットアップを実行
            console.log('[Setup] Starting auto cloud setup process');
            addLog("");
            addLog("========================================");
            addLog("🚀 自動セットアップを開始します");
            addLog("========================================");
            addLog("");
            setIsProcessing(true);

            try {
              console.log('[Setup] Step 1: Loading OAuth credentials');
              addLog("📋 ステップ 1/5: OAuth認証情報を読み込んでいます...");
              
              console.log('[Setup] Calling autoSetupCloudProject');
              const autoResult = await autoSetupCloudProject(addLog);
              console.log('[Setup] autoSetupCloudProject result:', autoResult);

              if (autoResult.success && autoResult.projectId) {
                console.log(`[Setup] Auto setup succeeded with project ID: ${autoResult.projectId}`);
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
                  console.log('[Setup] Saving geminiAuth to config.json');
                  addLog("💾 設定を保存しています...");
                  const settings = await configAPI.loadConfig();
                  if (settings) {
                    settings.geminiAuth = true;
                    await configAPI.saveConfig(settings);
                    console.log('[Setup] geminiAuth saved successfully');
                    addLog("✓ 設定を保存しました");
                    addLog("✓ 今後、このセットアップは不要です");
                    addLog("");
                  }
                } else {
                  console.warn('[Setup] configAPI not available, cannot save geminiAuth');
                }

                addLog("🎉 すべてのセットアップが完了しました!");
                addLog("");
                console.log('[Setup] Moving to complete step');
                setCurrentStep("complete");
                setCanProceed(true);
              } else {
                console.error('[Setup] Auto setup failed:', autoResult);
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
              console.log('[Setup] Auto setup process finished, setting isProcessing to false');
              setIsProcessing(false);
            }
          } else {
            // キャンセルされた場合は手動セットアップへ
            console.log('[Setup] User cancelled auto setup, moving to manual setup');
            addLog("手動セットアップモードに切り替えます");
            addLog("");
            setCurrentStep("cloud-setup");
            setCanProceed(true);
          }
          return; // early return
      } else if (result.needsCloudSetup) {
        // プロジェクト存在が不明またはその他のCloud設定が必要な場合
        console.log('[Setup] Cloud setup needed but project may exist or unclear');
        addLog("⚠️ Google Cloud Project の設定が必要です");
        addLog("");
        console.log('[Setup] Moving to cloud-setup step');
        setCurrentStep("cloud-setup");
        setCanProceed(true);
      } else {
        console.log('[Setup] Auth not completed');
        addLog("✗ 認証が完了していません");
        addLog(
          "PowerShell ウィンドウで認証を完了してから、再度確認してください"
        );
        setCanProceed(true);
      }
    } catch (error) {
      console.error('[Setup] handleAuthVerify error:', error);
      console.error('[Setup] Error stack:', error instanceof Error ? error.stack : 'N/A');
      addLog(`エラー: ${error}`);
      setCurrentStep("error");
    } finally {
      console.log('[Setup] handleAuthVerify finished, setting isProcessing to false');
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
