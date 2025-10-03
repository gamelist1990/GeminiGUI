import { Command } from '@tauri-apps/plugin-shell';

export interface LocalFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface PowerShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

function escapePowerShellLiteral(input: string): string {
  return input.replace(/'/g, "''");
}

async function runPowerShell(command: string): Promise<PowerShellResult> {
  const psCommand = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    $ErrorActionPreference = 'Stop';
    ${command}
  `.replace(/\s+/g, ' ').trim();

  const process = Command.create('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    '-Command',
    psCommand,
  ]);

  const result = await process.execute();
  return {
    code: result.code ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function listDirectory(path: string): Promise<LocalFileEntry[]> {
  const safePath = escapePowerShellLiteral(path);
  const command = `
    $items = Get-ChildItem -LiteralPath '${safePath}' | Select-Object @{
      Name = "name"; Expression = { $_.Name }
    }, @{
      Name = "path"; Expression = { $_.FullName }
    }, @{
      Name = "isDirectory"; Expression = { $_.PSIsContainer }
    };
    $items | ConvertTo-Json -Depth 2 -Compress
  `;

  const { code, stdout, stderr } = await runPowerShell(command);
  if (code !== 0) {
    throw new Error(`PowerShell listDirectory failed: ${stderr || stdout}`);
  }

  if (!stdout) {
    return [];
  }

  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed) {
    return [parsed];
  }
  return [];
}

export async function readTextFile(path: string): Promise<string> {
  const safePath = escapePowerShellLiteral(path);
  const command = `
    Get-Content -LiteralPath '${safePath}' -Encoding UTF8 | Out-String
  `;

  const { code, stdout, stderr } = await runPowerShell(command);
  if (code !== 0) {
    throw new Error(`PowerShell readTextFile failed: ${stderr || stdout}`);
  }

  return stdout;
}

export async function pathExists(path: string): Promise<boolean> {
  const safePath = escapePowerShellLiteral(path);
  const command = `
    if (Test-Path -LiteralPath '${safePath}') { Write-Output 'true' } else { Write-Output 'false' }
  `;

  const { code, stdout, stderr } = await runPowerShell(command);
  if (code !== 0) {
    throw new Error(`PowerShell pathExists failed: ${stderr || stdout}`);
  }

  return stdout.trim().toLowerCase() === 'true';
}
