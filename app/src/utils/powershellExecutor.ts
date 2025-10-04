import { Command } from '@tauri-apps/plugin-shell';

export interface PowerShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * PowerShellコマンドを実行するユーティリティ関数
 * UTF-8エンコーディングを適切に設定して文字化けを防ぐ
 *
 * @param command - 実行するPowerShellコマンド
 * @returns PowerShell実行結果
 */
export async function runPowerShell(command: string): Promise<PowerShellResult> {
  // PowerShellでUTF-8エンコーディングを設定
  // - $OutputEncoding: PowerShellから外部プログラムへの出力エンコーディング
  // - [Console]::OutputEncoding: コンソール出力エンコーディング
  // - $InputEncoding: 外部からの入力エンコーディング
  const psSetup = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    $OutputEncoding = [System.Text.Encoding]::UTF8;
    $InputEncoding = [System.Text.Encoding]::UTF8;
    $ErrorActionPreference = 'Stop';
  `.replace(/\s+/g, ' ').trim();

  // 実行コマンドを構築
  const fullCommand = `${psSetup}; ${command}`;

  const process = Command.create('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    '-Command',
    fullCommand,
  ]);

  const result = await process.execute();
  return {
    code: result.code ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * PowerShellコマンドを実行し、成功時はstdoutを、非成功時はエラーを投げる
 *
 * @param command - 実行するPowerShellコマンド
 * @throws Error - 実行失敗時のエラー
 * @returns stdout文字列
 */
export async function runPowerShellExpectSuccess(command: string): Promise<string> {
  const result = await runPowerShell(command);
  if (result.code !== 0) {
    throw new Error(`PowerShell command failed (${result.code}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

/**
 * ファイルをオープンするPowerShellコマンドを実行
 *
 * @param filePath - 開くファイルのパス
 */
export async function openFile(filePath: string): Promise<void> {
  // startコマンドでファイルを開く (エクスプローラーで開く)
  const safePath = filePath.replace(/"/g, '""'); // ダブルクォートのエスケープ
  await runPowerShellExpectSuccess(`start "${safePath}"`);
}

/**
 * 環境変数を設定するPowerShellコマンドを実行
 *
 * @param name - 環境変数名
 * @param value - 設定する値
 * @param target - 対象スコープ ('User', 'Machine', 'Process')
 */
export async function setEnvironmentVariable(
  name: string,
  value: string,
  target: 'User' | 'Machine' | 'Process' = 'User'
): Promise<void> {
  const safeName = name.replace(/'/g, "''");
  const safeValue = value.replace(/'/g, "''");
  const targetString = `[System.EnvironmentVariableTarget]::${target}`;

  await runPowerShellExpectSuccess(
    `[System.Environment]::SetEnvironmentVariable('${safeName}', '${safeValue}', ${targetString})`
  );
}

/**
 * ファイルやパスが存在するかを確認するPowerShellコマンド
 *
 * @param path - 確認するパス
 * @returns 存在するかどうか
 */
export async function fileExists(path: string): Promise<boolean> {
  const safePath = path.replace(/'/g, "''");
  const result = await runPowerShellExpectSuccess(
    `if (Test-Path -LiteralPath '${safePath}') { Write-Output 'true' } else { Write-Output 'false' }`
  );

  return result.toLowerCase() === 'true';
}

/**
 * ユーザーPROFILEパスを取得
 *
 * @returns ユーザーPROFILEパス
 */
export async function getUserProfilePath(): Promise<string> {
  return runPowerShellExpectSuccess('Write-Output $env:USERPROFILE');
}</content>
<parameter name="file_path">app/src/utils/powershellExecutor.ts