import { Command } from '@tauri-apps/plugin-shell';
import * as opener from '@tauri-apps/plugin-opener';
import { hasCloudProject } from './cloudSetup';
import { Config } from './configAPI';
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
 * Gemini CLI と Node.js の存在チェック（段階的な順序で実行）
 * 
 * チェック順序:
 * 1. Node.js の存在確認 → なければエラーで停止
 * 2. npm -g list で Gemini CLI パッケージの存在確認 → なければインストール推奨
 * 3. Gemini CLI の実行ファイル (gemini.ps1) の存在確認 → なければエラー
 * 4. 認証状態の確認 (google_accounts.json)
 * 5. Google Cloud Project の確認
 */
export async function geminiCheck(log: LogFunction): Promise<CheckResult> {
  const result: CheckResult = {
    geminiExists: false,
    nodeExists: false,
    isAuthenticated: false,
  };

  try {
    // config.jsonから既存の認証状態を確認
    try {
      const baseDir = await import('@tauri-apps/api/path').then(m => m.documentDir());
      const configPath = `${baseDir}\\PEXData\\GeminiGUI`;
      const config = new Config(configPath);
      const settings = await config.loadConfig();
      if (settings?.geminiAuth === true) {
        log('✓ config.jsonで既に認証済みと記録されています');
        result.isAuthenticated = true;
        result.nodeExists = true;
        result.geminiExists = true;
        
        // 認証済みの場合でもプロジェクトチェックは実行
        log('Google Cloud Projectの存在を確認しています...');
        try {
          const hasProject = await hasCloudProject(log);
          result.hasProject = hasProject;
          log(`hasCloudProject result: ${hasProject}`);
          
          if (hasProject) {
            log('✓ Google Cloud Projectが見つかりました');
          } else {
            log('⚠️ Google Cloud Projectが見つかりません');
          }
        } catch (error) {
          log(`⚠️ プロジェクトチェックエラー: ${error}`);
          result.hasProject = false;
        }
        
        log(`${t('setup.logs.checkComplete')} geminiExists: ${result.geminiExists}, nodeExists: ${result.nodeExists}, isAuthenticated: ${result.isAuthenticated}`);
        return result;
      }
    } catch (configError) {
      log(`⚠️ config.jsonの読み込みに失敗しました。ファイルシステムチェックを続行します: ${configError}`);
    }

    // ========================================
    // ステップ 1: Node.js の存在確認
    // ========================================
    log('');
    log('========================================');
    log('ステップ 1/5: Node.js の確認');
    log('========================================');
    
    const nodeCheck = await Command.create('powershell.exe', [
      '-Command',
      'node --version',
    ]).execute();

    if (nodeCheck.code === 0) {
      result.nodeExists = true;
      const nodeVersion = nodeCheck.stdout.trim();
      log(`✓ Node.js が見つかりました (バージョン: ${nodeVersion})`);
      log('');
    } else {
      log('✗ Node.js がインストールされていません');
      log('');
      log('【エラー】Node.js が必要です');
      log('以下の手順でインストールしてください:');
      log('1. 「Node.js をインストール」ボタンをクリック');
      log('2. 公式サイトからインストーラーをダウンロード');
      log('3. インストール後、このアプリを再起動');
      log('');
      return result;
    }

    // ========================================
    // ステップ 2: npm -g list で Gemini CLI パッケージの確認
    // ========================================
    log('========================================');
    log('ステップ 2/5: Gemini CLI パッケージの確認');
    log('========================================');
    
    const npmListCommand = await Command.create('powershell.exe', [
      '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npm -g list',
    ]).execute();

    if (npmListCommand.code !== 0) {
      log('✗ npm -g list の実行に失敗しました');
      log(`エラー: ${npmListCommand.stderr || '不明なエラー'}`);
      log('');
      return result;
    }

    const npmListOutput = npmListCommand.stdout || '';
    
    // npmのグローバルインストールパスを取得
    let npmGlobalPath: string | undefined;
    try {
      const lines = npmListOutput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const firstLine = lines[0];
        // Windows絶対パスまたは"npm"で終わるパスを検出
        if (/^[A-Za-z]:\\/.test(firstLine) || firstLine.endsWith('\\npm') || firstLine.endsWith('/npm')) {
          npmGlobalPath = firstLine;
          log(`📂 npmグローバルパス: ${npmGlobalPath}`);
        }
      }
    } catch (err) {
      log(`⚠️ npmパスの解析に失敗: ${err}`);
    }

    const hasGeminiPackage = npmListOutput.includes('@google/gemini-cli');
    
    if (hasGeminiPackage) {
      log('✓ @google/gemini-cli パッケージが見つかりました');
      
      // バージョン情報を表示
      const versionMatch = npmListOutput.match(/@google\/gemini-cli@([\d.]+)/);
      if (versionMatch) {
        log(`📦 バージョン: ${versionMatch[1]}`);
      }
      log('');
    } else {
      log('✗ @google/gemini-cli パッケージがインストールされていません');
      log('');
      log('【エラー】Gemini CLI が必要です');
      log('「Gemini CLI をインストール」ボタンをクリックしてインストールしてください');
      log('');
      return result;
    }

    // ========================================
    // ステップ 3: gemini.ps1 実行ファイルの存在確認
    // ========================================
    log('========================================');
    log('ステップ 3/5: gemini.ps1 実行ファイルの確認');
    log('========================================');
    
    if (!npmGlobalPath) {
      log('⚠️ npmグローバルパスが特定できませんでした');
      log('gemini.ps1 の存在確認をスキップします');
      log('');
    } else {
      const geminiPs1Path = `${npmGlobalPath}\\gemini.ps1`;
      log(`📍 確認パス: ${geminiPs1Path}`);
      
      const geminiPs1Check = await Command.create('powershell.exe', [
        '-Command',
        `Test-Path "${geminiPs1Path}"`,
      ]).execute();

      if (geminiPs1Check.code === 0 && geminiPs1Check.stdout.trim() === 'True') {
        log('✓ gemini.ps1 が見つかりました');
        result.geminiExists = true;
        log('');
      } else {
        log('✗ gemini.ps1 が見つかりません');
        log('');
        log('【エラー】Gemini CLI の実行ファイルが見つかりません');
        log('以下の可能性があります:');
        log('1. インストールが不完全');
        log('2. PATHが正しく設定されていない');
        log('');
        log('対処方法:');
        log('- npm install -g @google/gemini-cli を再実行');
        log('- PowerShellを再起動');
        log('');
        return result;
      }
    }

    // ========================================
    // ステップ 4: 認証状態の確認
    // ========================================
    log('========================================');
    log('ステップ 4/5: 認証状態の確認');
    log('========================================');
    
    const authCheckCommand = await Command.create('powershell.exe', [
      '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
    ]).execute();

    if (authCheckCommand.code === 0) {
      const testResult = authCheckCommand.stdout.trim();
      if (testResult === 'True') {
        result.isAuthenticated = true;
        log('✓ 認証済み (google_accounts.json が存在)');
        log('');
      } else {
        log('✗ 未認証 (google_accounts.json が存在しません)');
        log('「認証を開始」ボタンをクリックして認証を完了してください');
        log('');
        return result;
      }
    } else {
      log(`✗ 認証ファイルの確認に失敗 (終了コード: ${authCheckCommand.code})`);
      if (authCheckCommand.stderr) {
        log(`エラー: ${authCheckCommand.stderr}`);
      }
      log('');
      return result;
    }

    // ========================================
    // ステップ 5: Google Cloud Project の確認
    // ========================================
    log('========================================');
    log('ステップ 5/5: Google Cloud Project の確認');
    log('========================================');
    
    try {
      const hasProject = await hasCloudProject(log);
      result.hasProject = hasProject;
      
      if (hasProject) {
        log('✓ Google Cloud Project が見つかりました');
      } else {
        log('⚠️ Google Cloud Project が見つかりません');
        log('プロジェクトの設定が必要です');
      }
      log('');
    } catch (error) {
      log(`⚠️ プロジェクトチェックエラー: ${error}`);
      result.hasProject = false;
      log('');
    }

  } catch (error) {
    log(`${t('setup.logs.checkError')} ${error}`);
    throw error;
  }

  log('========================================');
  log('チェック完了');
  log('========================================');
  log(`✓ Node.js: ${result.nodeExists ? '有効' : '無効'}`);
  log(`✓ Gemini CLI: ${result.geminiExists ? '有効' : '無効'}`);
  log(`✓ 認証: ${result.isAuthenticated ? '完了' : '未完了'}`);
  log(`✓ Cloud Project: ${result.hasProject === true ? '有効' : result.hasProject === false ? '無効' : '不明'}`);
  log('');
  
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
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npm install -g @google/gemini-cli',
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
      log('[VerifyAuth] Step 1: Checking google_accounts.json existence');

      // PowerShellで google_accounts.json の存在を確認
      const authCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
      ]).execute();

      log(`[VerifyAuth] google_accounts.json check result: code=${authCheckCommand.code}, stdout="${authCheckCommand.stdout.trim()}"`);

      if (authCheckCommand.code !== 0) {
        log('[VerifyAuth] Failed to check google_accounts.json');
        log(t('setup.logs.authVerifyFailed'));
        return { success: false, needsCloudSetup: false };
      }

      const testResult = authCheckCommand.stdout.trim();
      if (testResult !== 'True') {
        log('[VerifyAuth] google_accounts.json does not exist');
        log(t('setup.logs.authFileNotFound'));
        log(t('setup.logs.authNotComplete'));
        log(t('setup.logs.authHint'));
        return { success: false, needsCloudSetup: false };
      }

      // oauth_creds.json の存在も確認
      log('[VerifyAuth] google_accounts.json exists, checking OAuth credentials');
      const oauthCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\oauth_creds.json"',
      ]).execute();

      log(`[VerifyAuth] oauth_creds.json check result: code=${oauthCheckCommand.code}, stdout="${oauthCheckCommand.stdout.trim()}"`);

      if (oauthCheckCommand.code !== 0 || oauthCheckCommand.stdout.trim() !== 'True') {
        log('⚠️ OAuth認証情報が見つかりません');
        log('Gemini CLIで再度認証を実行してください');
        return { success: false, needsCloudSetup: false };
      }

      // Gemini CLIを実行してテスト
      log('[VerifyAuth] Step 2: Testing with Gemini CLI');
      const geminiTestCommand = await Command.create('powershell.exe', [
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; gemini "test" 2>&1',
      ]).execute();

      const output = (geminiTestCommand.stdout || '') + (geminiTestCommand.stderr || '');
      log(`[VerifyAuth] Gemini CLI test output length: ${output.length} chars`);

      // GOOGLE_CLOUD_PROJECT に関するエラーが含まれるかチェック
      const needsProjectSetup = output.includes('GOOGLE_CLOUD_PROJECT');
      
      if (needsProjectSetup) {
        log('⚠️ Google Cloud Project の設定が必要です');
      }
      
      // プロジェクトチェックを実行
      log('[VerifyAuth] Step 3: Checking for existing Cloud Projects');
      const hasProject = await hasCloudProject(log);
      log(`[VerifyAuth] hasProject result: ${hasProject}`);

      if (hasProject) {
        log('✓ Google Cloud Projectが見つかりました');
        log(t('setup.logs.authSetupComplete'));
        return { success: true, needsCloudSetup: false, hasProject: true };
      } else if (needsProjectSetup) {
        // プロジェクトが必要だがない場合
        log('⚠️ Google Cloud Projectが見つかりません');
        log('プロジェクトを作成する必要があります');
        return { success: false, needsCloudSetup: true, hasProject: false };
      } else {
        // プロジェクトが不要な場合（エラーメッセージなし）
        log('✓ Gemini CLI のテストに成功しました');
        log(t('setup.logs.authSetupComplete'));
        return { success: true, needsCloudSetup: false, hasProject: false };
      }
    } catch (error) {
      log(`${t('setup.logs.authVerifyError')} ${error}`);
      log(`[VerifyAuth] Error details: ${error instanceof Error ? error.stack : 'Unknown'}`);
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

/**
 * npm -g list を実行してグローバルインストールパスとGemini CLIの存在を確認
 * 
 * @returns npmPath: npmグローバルインストールパス
 * @returns hasGeminiCLI: Gemini CLIパッケージが見つかったかどうか
 */
export async function detectGlobalNpmPath(log?: LogFunction): Promise<{ npmPath?: string; hasGeminiCLI: boolean }> {
  try {
    if (log) {
      log('npm -g list を実行してグローバルインストールパスを検知しています...');
    }

    // npm -g list を実行
    const npmListCommand = await Command.create('powershell.exe', [
      '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npm -g list',
    ]).execute();

    if (npmListCommand.code !== 0) {
      const errorMsg = npmListCommand.stderr || 'npm -g listの実行に失敗しました';
      if (log) {
        log(`✗ npmパッケージリスト取得エラー: ${errorMsg}`);
      }
      return { hasGeminiCLI: false };
    }

    const npmListOutput = npmListCommand.stdout || '';

    // npm -g list の先頭行からグローバルパスを抽出
    let npmGlobalPath: string | undefined = undefined;
    try {
      const lines = npmListOutput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const firstLine = lines[0];
        // Windows絶対パスまたは"npm"で終わるパスを検出
        if (/^[A-Za-z]:\\/.test(firstLine) || firstLine.endsWith('\\npm') || firstLine.endsWith('/npm')) {
          npmGlobalPath = firstLine;
          if (log) {
            log(`✓ npmグローバルパス: ${npmGlobalPath}`);
          }
        }
      }
    } catch (err) {
      if (log) {
        log(`⚠️ npm -g list 出力の解析に失敗: ${err}`);
      }
    }

    // @google/gemini-cli パッケージの存在確認
    const hasGeminiCLI = npmListOutput.includes('@google/gemini-cli');

    if (log) {
      if (hasGeminiCLI) {
        log('✓ @google/gemini-cli パッケージが見つかりました');
        
        // バージョン情報を表示
        const versionMatch = npmListOutput.match(/@google\/gemini-cli@([\d.]+)/);
        if (versionMatch) {
          log(`📦 バージョン: ${versionMatch[1]}`);
        }
        
        // gemini.ps1の期待パスを表示
        if (npmGlobalPath) {
          const expectedGeminiPath = `${npmGlobalPath}\\gemini.ps1`;
          log(`📍 gemini.ps1 の期待パス: ${expectedGeminiPath}`);
        }
      } else {
        log('✗ @google/gemini-cli パッケージが見つかりません');
      }
    }

    return { npmPath: npmGlobalPath, hasGeminiCLI };
  } catch (error) {
    if (log) {
      log(`npmパスの検知中にエラーが発生しました: ${error}`);
    }
    return { hasGeminiCLI: false };
  }
}
