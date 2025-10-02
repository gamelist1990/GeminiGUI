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

export interface GeminiOptions {
  approvalMode?: 'default' | 'auto_edit' | 'yolo';
  includeDirectories?: string[]; // Directories to include
  includes?: string[]; // Files or patterns to include (e.g., ['file:src', 'codebase'])
  checkpointing?: boolean; // Enable file change checkpointing
}

export async function callGemini(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions
): Promise<GeminiResponse> {
  try {
    // gemini is a PowerShell script located at %APPDATA%\npm\gemini.ps1
    const geminiPath = 'C:\\Users\\issei\\AppData\\Roaming\\npm\\gemini.ps1';
    
    let commandArgs = ['-ExecutionPolicy', 'Bypass'];
    
    // Build gemini command with options
    let geminiArgs = `-p "${prompt}" -o json`;
    
    // Add checkpointing flag
    if (options?.checkpointing) {
      geminiArgs += ' --checkpointing';
    }
    
    // Add approval mode
    if (options?.approvalMode && options.approvalMode !== 'default') {
      if (options.approvalMode === 'yolo') {
        geminiArgs += ' --yolo';
      } else {
        geminiArgs += ` --approval-mode ${options.approvalMode}`;
      }
    }
    
    // Add include directories
    if (options?.includeDirectories && options.includeDirectories.length > 0) {
      geminiArgs += ` --include-directories ${options.includeDirectories.join(',')}`;
    }
    
    // Add includes (files/patterns)
    if (options?.includes && options.includes.length > 0) {
      // Add @ prefix for each include
      const includeArgs = options.includes.map(inc => `@${inc}`).join(' ');
      geminiArgs = `${includeArgs} ${geminiArgs}`;
    }
    
    if (workspacePath) {
      // Change to workspace directory before running gemini
      commandArgs.push('-Command', `cd "${workspacePath}"; & "${geminiPath}" ${geminiArgs}`);
    } else {
      commandArgs.push('-File', geminiPath, ...geminiArgs.split(' '));
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