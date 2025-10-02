import { Command } from '@tauri-apps/plugin-shell';

export interface GeminiResponse {
  response: string;
  stats: {
    models: {
      [modelName: string]: {
        api: {
          totalRequests: number;
          totalErrors: number;
          totalLatencyMs: number;
        };
        tokens: {
          prompt: number;
          candidates: number;
          total: number;
          cached: number;
          thoughts: number;
          tool: number;
        };
      };
    };
    tools: {
      totalCalls: number;
      totalSuccess: number;
      totalFail: number;
      totalDurationMs: number;
      totalDecisions: {
        accept: number;
        reject: number;
        modify: number;
        auto_accept: number;
      };
      byName: Record<string, any>;
    };
    files: {
      totalLinesAdded: number;
      totalLinesRemoved: number;
    };
  };
}

export async function callGemini(prompt: string, workspacePath?: string): Promise<GeminiResponse> {
  try {
    // gemini is a PowerShell script located at %APPDATA%\npm\gemini.ps1
    const geminiPath = 'C:\\Users\\issei\\AppData\\Roaming\\npm\\gemini.ps1';
    
    let commandArgs = ['-ExecutionPolicy', 'Bypass'];
    
    if (workspacePath) {
      // Change to workspace directory before running gemini
      commandArgs.push('-Command', `cd "${workspacePath}"; & "${geminiPath}" -p "${prompt}" -o json`);
    } else {
      commandArgs.push('-File', geminiPath, '-p', prompt, '-o', 'json');
    }
    
    const command = Command.create('powershell.exe', commandArgs);
    const output = await command.execute();

    if (output.code !== 0) {
      throw new Error(`Command failed with code ${output.code}: ${output.stderr}`);
    }

    const jsonString = output.stdout.trim();
    if (!jsonString) {
      throw new Error('No output from gemini command');
    }

    const response: GeminiResponse = JSON.parse(jsonString);
    return response;
  } catch (error) {
    console.error('Error calling Gemini:', error);
    throw error;
  }
}