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

export async function writeBinaryFile(filePath: string, data: Uint8Array | ArrayBuffer): Promise<void> {
  // Try using the Tauri fs plugin first (preferred). If that fails, fall back
  // to the PowerShell-based approach. This reduces issues with long file paths
  // and avoids passing huge strings through command-line arguments.
  try {
    const uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Try to dynamically import @tauri-apps/plugin-fs to avoid hard dependency
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = await import('@tauri-apps/plugin-fs');
      if (fs) {
        // plugin-fs.writeFile typically accepts Uint8Array or a ReadableStream
        const writeFn = (fs as any).writeFile || (fs as any).writeBinaryFile;
        if (typeof writeFn === 'function') {
          const toWrite = uint8Array instanceof Uint8Array ? uint8Array : new Uint8Array(uint8Array);
          await writeFn(filePath, toWrite as any);
          return;
        }
      }
    } catch (fsImportError) {
      // plugin may not be available in this runtime - fall through to PowerShell method
      console.warn('plugin-fs not available or failed, falling back to PowerShell write:', fsImportError);
    }

    // If we reach here, fallback to PowerShell approach.
    // Prepare base64 safely in JS, then write through PowerShell in chunks.
    let base64Data = '';
    try {
      const chunkSize = 10000;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
        base64Data += btoa(String.fromCharCode.apply(null, Array.from(chunk)));
      }
    } catch (encodeError) {
      throw new Error(`Base64エンコーディング失敗: ${encodeError}`);
    }

    // Windows: if path is long, prefix with \\\\?\\ to support long paths
    let safePath = filePath.replace(/'/g, "''");
    try {
      if (process.platform === 'win32' || navigator?.userAgent?.includes('Windows')) {
        // Only prefix if not already using long path prefix
        if (!safePath.startsWith('\\\\?\\')) {
          // Convert forward slashes to backslashes for Windows
          const normalized = safePath.replace(/\//g, '\\\\');
          safePath = '\\\\?\\' + normalized;
        }
      }
    } catch (e) {
      // ignore environment detection failures
    }

    const base64ChunkSize = 8000;
    const base64Chunks: string[] = [];
    for (let i = 0; i < base64Data.length; i += base64ChunkSize) {
      base64Chunks.push(base64Data.slice(i, i + base64ChunkSize));
    }

    let psScript = '';
    base64Chunks.forEach((chunk, index) => {
      const safeChunk = chunk.replace(/'/g, "''");
      psScript += `$base64_${index} = '${safeChunk}'; `;
    });

    psScript += `
      $fullBase64 = $base64_0;
      ${base64Chunks.slice(1).map((_, index) => `$fullBase64 += $base64_${index + 1};`).join(' ')}
      [System.IO.File]::WriteAllBytes('${safePath}', [System.Convert]::FromBase64String($fullBase64.Trim()));
      Write-Output 'success';
    `;

    await runPowerShellExpectSuccess(psScript);

  } catch (error) {
    console.error('PowerShell binary write failed:', error);
    throw new Error(`ファイル保存に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * ユーザーPROFILEパスを取得
 *
 * @returns ユーザーPROFILEパス
 */
export async function getUserProfilePath(): Promise<string> {
  return runPowerShellExpectSuccess('Write-Output $env:USERPROFILE');
}