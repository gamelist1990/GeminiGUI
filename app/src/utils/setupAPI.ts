import { Command } from '@tauri-apps/plugin-shell';
import * as opener from '@tauri-apps/plugin-opener';

type LogFunction = (message: string) => void;

interface CheckResult {
  geminiExists: boolean;
  nodeExists: boolean;
  isAuthenticated: boolean;
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
    log('Node.js のインストールを確認しています...');
    const nodeCheck = await Command.create('powershell.exe', [
      '-Command',
      'node --version',
    ]).execute();

    if (nodeCheck.code === 0) {
      result.nodeExists = true;
      log(`✓ Node.js が見つかりました: ${nodeCheck.stdout.trim()}`);
    } else {
      log('✗ Node.js が見つかりません');
      return result;
    }

    // Gemini CLI (ps1) の存在確認
    log('Gemini CLI の存在を確認しています...');
    const geminiCheck = await Command.create('powershell.exe', [
      '-Command',
      'Get-Command gemini -ErrorAction SilentlyContinue',
    ]).execute();

    if (geminiCheck.code === 0 && geminiCheck.stdout.trim()) {
      result.geminiExists = true;
      log('✓ Gemini CLI が見つかりました');
      
      // 認証状態の確認 - google_accounts.json の存在チェック（PowerShellで実行）
      log('認証状態を確認しています...');
      const authCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
      ]).execute();

      if (authCheckCommand.code === 0) {
        const testResult = authCheckCommand.stdout.trim();
        log(`認証チェック結果: "${testResult}"`);
        if (testResult === 'True') {
          result.isAuthenticated = true;
          log('✓ Google アカウント認証が確認されました');
        } else {
          log('✗ Google アカウント認証が必要です');
        }
      } else {
        log(`✗ 認証ファイルの確認に失敗しました (終了コード: ${authCheckCommand.code})`);
        if (authCheckCommand.stderr) {
          log(`エラー出力: ${authCheckCommand.stderr}`);
        }
      }
    } else {
      log('✗ Gemini CLI が見つかりません');
    }
  } catch (error) {
    log(`チェック中にエラーが発生しました: ${error}`);
    throw error;
  }

  log(`チェック完了 - geminiExists: ${result.geminiExists}, nodeExists: ${result.nodeExists}, isAuthenticated: ${result.isAuthenticated}`);
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
      log('Node.js のダウンロードページを開いています...');
      await opener.openUrl('https://nodejs.org/ja/download');
      log('ブラウザで Node.js のダウンロードページが開きました');
      log('インストーラーをダウンロードして実行してください');
    } catch (error) {
      log(`Node.js ダウンロードページを開けませんでした: ${error}`);
      throw error;
    }
  },

  /**
   * Gemini CLI のインストール
   */
  async installGeminiCLI(log: LogFunction): Promise<void> {
    try {
      log('npm を使用して Gemini CLI をインストールしています...');
      log('これには数分かかる場合があります...');

      const installCommand = await Command.create('powershell.exe', [
        '-Command',
        'npm install -g @google/gemini-cli',
      ]).execute();

      if (installCommand.code === 0) {
        log('✓ Gemini CLI のインストールが完了しました');
        if (installCommand.stdout) {
          log(`出力: ${installCommand.stdout}`);
        }
      } else {
        const errorMsg = installCommand.stderr || 'インストールに失敗しました';
        log(`✗ エラー: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`Gemini CLI のインストール中にエラーが発生しました: ${error}`);
      throw error;
    }
  },

  /**
   * 認証設定の構成
   */
  async configureAuth(log: LogFunction): Promise<void> {
    try {
      log('認証設定ファイルを作成しています...');

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
        log(`✓ 設定ファイルを作成しました: ${settingsPath}`);
      } else {
        const errorMsg = createSettingsCommand.stderr || '設定ファイルの作成に失敗しました';
        log(`✗ エラー: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`認証設定中にエラーが発生しました: ${error}`);
      throw error;
    }
  },

  /**
   * 認証プロセスの開始
   */
  async startAuth(log: LogFunction): Promise<void> {
    try {
      log('Gemini CLI を起動して認証を開始します...');
      log('ブラウザが自動的に開きます...');
      log('Google アカウントでログインしてください');

      // gemini コマンドを実行して認証を開始
      // 注: この処理は対話的なので、バックグラウンドで実行
      const authCommand = await Command.create('powershell.exe', [
        '-Command',
        'Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "gemini"',
      ]).execute();

      if (authCommand.code === 0) {
        log('✓ 認証プロセスを開始しました');
        log('PowerShell ウィンドウが開きます');
        log('ブラウザで認証を完了してください');
        log('');
        log('⚠️ 重要: PowerShell ウィンドウで Gemini のロゴが表示されたら、');
        log('そのウィンドウを閉じてから「認証を確認」をクリックしてください');
      } else {
        const errorMsg = authCommand.stderr || '認証開始に失敗しました';
        log(`✗ エラー: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      log(`認証開始中にエラーが発生しました: ${error}`);
      throw error;
    }
  },

  /**
   * 認証完了の確認
   */
  async verifyAuth(log: LogFunction): Promise<boolean> {
    try {
      log('認証状態を確認しています...');

      // PowerShellで google_accounts.json の存在を確認
      const authCheckCommand = await Command.create('powershell.exe', [
        '-Command',
        'Test-Path "$env:USERPROFILE\\.gemini\\google_accounts.json"',
      ]).execute();

      if (authCheckCommand.code === 0) {
        const testResult = authCheckCommand.stdout.trim();
        
        if (testResult === 'True') {
          log('✓ Google アカウント認証が確認されました!');
          log('✓ Gemini CLI のセットアップが完全に完了しました');
          return true;
        } else {
          log('✗ 認証ファイルが見つかりません');
          log('PowerShell ウィンドウで認証が完了していることを確認してください');
          log('ヒント: ブラウザで認証完了後、PowerShell に戻って Gemini のロゴが表示されるまで待ってください');
          return false;
        }
      } else {
        log('✗ 認証ファイルの確認に失敗しました');
        return false;
      }
    } catch (error) {
      log(`認証確認中にエラーが発生しました: ${error}`);
      throw error;
    }
  },
};
