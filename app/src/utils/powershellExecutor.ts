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
 * PowerShell経由でバイナリデータをファイルに書き込む（改良版）
 *
 * @param filePath - 保存するファイルのパス
 * @param data - 書き込むデータ (Uint8ArrayまたはArrayBuffer)
 */
export async function writeBinaryFile(filePath: string, data: Uint8Array | ArrayBuffer): Promise<void> {
  try {
    // ArrayBufferの場合Uint8Arrayに変換
    const uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // 小さなファイル（1MB以下）はBase64で直接処理
    if (uint8Array.length <= 1000000) {
      const base64Data = btoa(String.fromCharCode(...uint8Array));
      const safePath = filePath.replace(/'/g, "''");

      const command = `
        [System.IO.File]::WriteAllBytes('${safePath}', [System.Convert]::FromBase64String('${base64Data}'))
      `.trim();

      await runPowerShellExpectSuccess(command);
      return;
    }

    // 大きなファイルは一時ファイル作成＆コピーの方法で処理
    const base64Chunks: string[] = [];
    const chunkSize = 500000; // ~500KBずつ分割

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64Chunks.push(btoa(String.fromCharCode(...chunk)));
    }

    const safePath = filePath.replace(/'/g, "''");

    // PowerShellスクリプトを作成（List<byte>を使って結合）
    const psScript = [
      '[System.Collections.Generic.List[System.Byte]]$bytes = New-Object System.Collections.Generic.List[System.Byte]',
      ...base64Chunks.map((chunk, index) => `$chunk${index} = '${chunk}'`),
      ...base64Chunks.map((_, index) => `$bytes.AddRange([System.Convert]::FromBase64String($chunk${index}))`),
      `[System.IO.File]::WriteAllBytes('${safePath}', $bytes.ToArray())`
    ].join('; ');

    await runPowerShellExpectSuccess(psScript);

  } catch (error) {
    console.error('PowerShell binary write failed:', error);
    throw new Error(`ファイル保存に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}