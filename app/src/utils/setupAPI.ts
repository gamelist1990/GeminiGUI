import { Command } from '@tauri-apps/plugin-shell';
import * as opener from '@tauri-apps/plugin-opener';
import { t } from './i18n';

type LogFunction = (message: string) => void;

export interface CheckResult {
  geminiExists: boolean;
  nodeExists: boolean;
  isAuthenticated: boolean;
  hasProject?: boolean; // Google Cloud Projectが存在するか
}

export interface VerifyAuthResult {
  success: boolean;
  needsCloudSetup: boolean;
  hasProject?: boolean; // Google Cloud Projectが存在するか
}

/**
 * Gemini CLI と Node.js の存在チェック
 */
export async function geminiCheck(log: LogFunction): Promise<CheckResult> {
  const result: CheckResult = {
    geminiExists: false,
    nodeExists: false,
    isAuthenticated: false,
  };

  try {
    // Node.js の存在確認
    log(t('setup.logs.nodeCheck'));
    const nodeCheck = await Command.create('powershell.exe', [
      '-Command',
      'node --version',
    ]).execute();

    if (nodeCheck.code === 0) {
      result.nodeExists = true;
      log(`${t('setup.logs.nodeFound')} ${nodeCheck.stdout.trim()}`);
    } else {
      log(t('setup.logs.nodeNotFound'));
      return result;
    }

    // Gemini CLI (ps1) の存在確認
    log(t('setup.logs.geminiCheck'));
    const geminiCheck = await Command.create('powershell.exe', [
      '-Command',
      'Get-Command gemini -ErrorAction SilentlyContinue',
    ]).execute();

    if (geminiCheck.code === 0 && geminiCheck.stdout.trim()) {
      result.geminiExists = true;
      log(t('setup.logs.geminiFound'));
      
      // 認証状態の確認 - google_accounts.json の存在チェック（PowerShellで実行）
      log(t('setup.logs.authCheck'));
      const authCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
      ]).execute();

      if (authCheckCommand.code === 0) {
        const testResult = authCheckCommand.stdout.trim();
        log(`認証チェック結果: "${testResult}"`);
        if (testResult === 'True') {
          result.isAuthenticated = true;
          log(t('setup.logs.authConfirmed'));
          
          // 認証済みの場合、Google Cloud Projectの存在もチェック
          log('Google Cloud Projectの存在を確認しています...');
          try {
            const { hasCloudProject } = await import('./cloudSetup');
            const hasProject = await hasCloudProject(log);
            result.hasProject = hasProject;
            
            if (hasProject) {
              log('✓ Google Cloud Projectが見つかりました');
            } else {
              log('⚠️ Google Cloud Projectが見つかりません');
            }
          } catch (error) {
            log(`⚠️ プロジェクトチェックエラー: ${error}`);
            result.hasProject = false;
          }
        } else {
          log(t('setup.logs.authRequired'));
        }
      } else {
        log(`✗ 認証ファイルの確認に失敗しました (終了コード: ${authCheckCommand.code})`);
        if (authCheckCommand.stderr) {
          log(`エラー出力: ${authCheckCommand.stderr}`);
        }
      }
    } else {
      log(t('setup.logs.nodeNotFound'));
    }
  } catch (error) {
    log(`${t('setup.logs.checkError')} ${error}`);
    throw error;
  }

  log(`${t('setup.logs.checkComplete')} ${result.geminiExists}, nodeExists: ${result.nodeExists}, isAuthenticated: ${result.isAuthenticated}`);
  return result;
}

/**
 * セットアップユーティリティ
 */
export const setupGemini = {
  /**
   * Node.js のインストールページを開く
   */
  async installNodeJS(log: LogFunction): Promise<void> {
    try {
      log(t('setup.logs.nodeDownloadPage'));
      await opener.openUrl('https://nodejs.org/ja/download');
      log(t('setup.logs.nodeDownloadComplete'));
      log(t('setup.logs.nodeInstallInstructions'));
    } catch (error) {
      log(`${t('setup.logs.installNodeError')} ${error}`);
      throw error;
    }
  },

  /**
   * Gemini CLI のインストール
   */
  async installGeminiCLI(log: LogFunction): Promise<void> {
    try {
      log(t('setup.logs.geminiInstallStart'));
      log(t('setup.logs.geminiInstallNote'));

      const installCommand = await Command.create('powershell.exe', [
        '-Command',
        'npm install -g @google/gemini-cli',
      ]).execute();

      if (installCommand.code === 0) {
        log(t('setup.logs.geminiInstallComplete'));
        if (installCommand.stdout) {
          log(`出力: ${installCommand.stdout}`);
        }
      } else {
        const errorMsg = installCommand.stderr || 'インストールに失敗しました';
        log(`${t('setup.logs.geminiInstallError')} ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`${t('setup.logs.installGeminiError')} ${error}`);
      throw error;
    }
  },

  /**
   * 認証設定の構成
   */
  async configureAuth(log: LogFunction): Promise<void> {
    try {
      log(t('setup.logs.authConfigCreate'));

      // PowerShellを使用して .gemini ディレクトリと settings.json を作成
      const createSettingsCommand = await Command.create('powershell.exe', [
        '-Command',
        `$geminiDir = "$env:USERPROFILE\\.gemini"; ` +
        `if (-not (Test-Path $geminiDir)) { New-Item -ItemType Directory -Path $geminiDir -Force | Out-Null }; ` +
        `$settingsPath = "$geminiDir\\settings.json"; ` +
        `$settings = @{ security = @{ auth = @{ selectedType = 'oauth-personal' } } }; ` +
        `$settings | ConvertTo-Json | Set-Content -Path $settingsPath; ` +
        `Write-Output $settingsPath`
      ]).execute();

      if (createSettingsCommand.code === 0) {
        const settingsPath = createSettingsCommand.stdout.trim();
        log(`${t('setup.logs.authConfigComplete')} ${settingsPath}`);
      } else {
        const errorMsg = createSettingsCommand.stderr || '設定ファイルの作成に失敗しました';
        log(`${t('setup.logs.authConfigError')} ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`${t('setup.logs.authSetupError')} ${error}`);
      throw error;
    }
  },

  /**
   * 認証プロセスの開始
   */
  async startAuth(log: LogFunction): Promise<void> {
    try {
      log(t('setup.logs.authProcessStart'));
      log(t('setup.logs.authBrowserOpen'));
      log(t('setup.logs.authLoginPrompt'));

      // gemini コマンドを実行して認証を開始
      // 注: この処理は対話的なので、バックグラウンドで実行
      const authCommand = await Command.create('powershell.exe', [
        '-Command',
        'Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "gemini"',
      ]).execute();

      if (authCommand.code === 0) {
        log(t('setup.logs.authProcessStarted'));
        log(t('setup.logs.authPowershellOpen'));
        log(t('setup.logs.authCompleteInBrowser'));
        log('');
        log(t('setup.logs.authImportantNote'));
        log(t('setup.logs.authCloseWindow'));
      } else {
        const errorMsg = authCommand.stderr || '認証開始に失敗しました';
        log(`${t('setup.logs.authStartError')} ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`${t('setup.logs.authStartError')} ${error}`);
      throw error;
    }
  },

  /**
   * 認証完了の確認
   */
  async verifyAuth(log: LogFunction): Promise<VerifyAuthResult> {
    try {
      log(t('setup.logs.authVerifyStart'));

      // PowerShellで google_accounts.json の存在を確認
      const authCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
      ]).execute();

      if (authCheckCommand.code === 0) {
        const testResult = authCheckCommand.stdout.trim();
        
        if (testResult === 'True') {
          // 認証ファイルが存在する場合、Gemini CLIを実行して確認
          log('認証ファイルが見つかりました。Gemini CLIで確認しています...');
          
          const geminiTestCommand = await Command.create('powershell.exe', [
            '-Command',
            'gemini "test" 2>&1',
          ]).execute();

          const output = geminiTestCommand.stdout + geminiTestCommand.stderr;
          
          // GOOGLE_CLOUD_PROJECT エラーをチェック
          if (output.includes('GOOGLE_CLOUD_PROJECT')) {
            log('⚠️ Google Cloud Project の設定が必要です');
            
            // プロジェクト存在チェックを実行
            log('Google Cloud Projectの存在を確認しています...');
            const { hasCloudProject } = await import('./cloudSetup');
            const hasProject = await hasCloudProject(log);
            
            return { 
              success: false, 
              needsCloudSetup: true,
              hasProject 
            };
          }
          
          log(t('setup.logs.authVerifyComplete'));
          
          // 認証成功時もプロジェクト存在チェック
          log('Google Cloud Projectの存在を確認しています...');
          const { hasCloudProject } = await import('./cloudSetup');
          const hasProject = await hasCloudProject(log);
          
          if (hasProject) {
            log('✓ Google Cloud環境の設定が完了しています');
            log(t('setup.logs.authSetupComplete'));
            return { success: true, needsCloudSetup: false, hasProject: true };
          } else {
            log('⚠️ Google Cloud Projectが見つかりません');
            log('プロジェクトを作成する必要があります');
            return { success: false, needsCloudSetup: true, hasProject: false };
          }
        } else {
          log(t('setup.logs.authFileNotFound'));
          log(t('setup.logs.authNotComplete'));
          log(t('setup.logs.authHint'));
          return { success: false, needsCloudSetup: false };
        }
      } else {
        log(t('setup.logs.authVerifyFailed'));
        return { success: false, needsCloudSetup: false };
      }
    } catch (error) {
      log(`${t('setup.logs.authVerifyError')} ${error}`);
      throw error;
    }
  },

  /**
   * Google Cloud Project 作成ページを開く
   */
  async openCloudProjectCreate(log: LogFunction): Promise<void> {
    try {
      log('Google Cloud Project 作成ページを開いています...');
      await opener.openUrl('https://console.cloud.google.com/projectcreate');
      log('✓ ブラウザでプロジェクト作成ページを開きました');
    } catch (error) {
      log(`エラー: Google Cloud Console を開けませんでした: ${error}`);
      throw error;
    }
  },

  /**
   * Gemini API 有効化ページを開く
   */
  async openGeminiAPIEnable(projectId: string, log: LogFunction): Promise<void> {
    try {
      log(`プロジェクト "${projectId}" の Gemini API 有効化ページを開いています...`);
      const url = `https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?hl=ja&project=${projectId}`;
      await opener.openUrl(url);
      log('✓ ブラウザでGemini API有効化ページを開きました');
    } catch (error) {
      log(`エラー: API有効化ページを開けませんでした: ${error}`);
      throw error;
    }
  },

  /**
   * GOOGLE_CLOUD_PROJECT 環境変数を設定
   */
  async setCloudProjectEnv(projectId: string, log: LogFunction): Promise<void> {
    try {
      log(`環境変数 GOOGLE_CLOUD_PROJECT を "${projectId}" に設定しています...`);
      
      // PowerShellでシステム環境変数を設定（管理者権限が必要な場合があります）
      const setEnvCommand = await Command.create('powershell.exe', [
        '-Command',
        `[System.Environment]::SetEnvironmentVariable('GOOGLE_CLOUD_PROJECT', '${projectId}', [System.EnvironmentVariableTarget]::User)`,
      ]).execute();

      if (setEnvCommand.code === 0) {
        log('✓ 環境変数を設定しました');
        log('注: この設定を反映するには、アプリケーションを再起動する必要があります');
      } else {
        const errorMsg = setEnvCommand.stderr || '環境変数の設定に失敗しました';
        log(`✗ エラー: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`環境変数の設定中にエラーが発生しました: ${error}`);
      throw error;
    }
  },
};
