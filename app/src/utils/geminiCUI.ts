import { Command } from '@tauri-apps/plugin-shell';

type LogFunction = (message: string) => void;

function internalLog(msg: string, log?: LogFunction) {
  if (log) {
    try { log(msg); } catch (_) { console.log('[GeminiCUI]', msg); }
  } else {
    console.log('[GeminiCUI]', msg);
  }
}

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
  model?: string; // Model to use (e.g., 'gemini-2.5-flash')
  customApiKey?: string; // Custom API key
  conversationHistory?: string; // Conversation history as system message
}

export async function callGemini(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions,
  googleCloudProjectId?: string,
  log?: LogFunction
): Promise<GeminiResponse> {
  try {
    internalLog(`callGemini called with prompt length: ${prompt.length}`, log);
    internalLog(`Workspace path: ${workspacePath}`, log);
    internalLog(`Options: ${JSON.stringify(options)}`, log);
    internalLog(`Google Cloud Project ID: ${googleCloudProjectId}`, log);
    

    // gemini is a PowerShell script located at "C:\nvm4w\nodejs\gemini.ps1"
    const geminiPath = `C:\\nvm4w\\nodejs\\gemini.ps1`;

  internalLog(`Using gemini path: ${geminiPath}`, log);
    
    // Build gemini command arguments as array
    const geminiArgs: string[] = [];
    
    // Build the full prompt with conversation history and includes
    let fullPrompt = '';
    
    // Add conversation history at the beginning if provided
    if (options?.conversationHistory) {
      fullPrompt = `[Previous conversation context]\n${options.conversationHistory}\n\n[Current user message]\n`;
  internalLog(`Adding conversation history to prompt, length: ${options.conversationHistory.length}`, log);
    }
    
    // Add the main prompt
    fullPrompt += prompt;
    
    // Prepend @includes to the prompt
    if (options?.includes && options.includes.length > 0) {
      const includesStr = options.includes.map(inc => `@${inc}`).join(' ');
      fullPrompt = `${includesStr} ${fullPrompt}`;
    }
    
    // Add prompt as positional argument (not using -p flag)
    geminiArgs.push(fullPrompt);
    
    // Add output format
    geminiArgs.push('-o', 'json');
    
    // Add approval mode
    if (options?.approvalMode && options.approvalMode !== 'default') {
      if (options.approvalMode === 'yolo') {
        geminiArgs.push('--yolo');
      } else {
        geminiArgs.push('--approval-mode', options.approvalMode);
      }
    }
    
    // Add include directories
    if (options?.includeDirectories && options.includeDirectories.length > 0) {
      geminiArgs.push('--include-directories', options.includeDirectories.join(','));
    }
    
    // Add model selection
    if (options?.model && options.model !== 'default') {
      geminiArgs.push('--model', options.model);
    }
    
    // Build PowerShell command
    const commandArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-Command',
    ];
    
    // Add custom API key and Google Cloud Project ID as environment variables if provided
    let psCommand = '';
    if (options?.customApiKey) {
      psCommand += `$env:GEMINI_API_KEY='${options.customApiKey.replace(/'/g, "''")}'; `;
    }
    if (googleCloudProjectId) {
      psCommand += `$env:GOOGLE_CLOUD_PROJECT='${googleCloudProjectId.replace(/'/g, "''")}'; `;
  internalLog(`Setting GOOGLE_CLOUD_PROJECT environment variable: ${googleCloudProjectId}`, log);
    }
    
    psCommand += `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
      `Set-Location '${workspacePath || process.cwd()}'; ` +
      `& '${geminiPath}' ${geminiArgs.map(arg => {
        // Escape quotes in arguments
        const escaped = arg.replace(/'/g, "''");
        return `'${escaped}'`;
      }).join(' ')}`;
    
  internalLog('PowerShell command: ' + psCommand.substring(0, 200) + '...', log);
    
    commandArgs.push(psCommand);
    
    const command = Command.create('powershell.exe', commandArgs);
  internalLog('Executing command...', log);
  const output = await command.execute();

  internalLog(`Command exit code: ${output.code}`, log);
  internalLog(`Command stdout length: ${output.stdout.length}`, log);
  internalLog(`Command stderr: ${output.stderr}`, log);

    // Check if stdout or stderr contains FatalToolExecutionError even if exit code is not 0
    const stdoutString = output.stdout.trim();
    const stderrString = output.stderr.trim();
    
    // Try to find JSON in stderr first (error messages might be there)
    let jsonString = '';
    let jsonSource = '';
    
    // Check stderr for JSON
    if (stderrString) {
      const jsonMatch = stderrString.match(/\{[\s\S]*"error"[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
        jsonSource = 'stderr';
        internalLog('Found JSON in stderr', log);
      }
    }
    
    // If not found in stderr, check stdout
    if (!jsonString && stdoutString) {
  jsonString = stdoutString;
  jsonSource = 'stdout';
  internalLog('Using stdout as JSON', log);
    }
    
    if (jsonString) {
      try {
  internalLog(`JSON response preview from ${jsonSource}: ${jsonString.substring(0, 200)}...`, log);
        const parsedResponse = JSON.parse(jsonString);
        
        // Check if the response contains a FatalToolExecutionError
        if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.error) {
          const errorObj = parsedResponse.error;
          if (errorObj.type === 'FatalToolExecutionError') {
            internalLog('FatalToolExecutionError detected in response: ' + JSON.stringify(errorObj), log);
            // Return as a response with error information embedded
            const response: GeminiResponse = {
              response: JSON.stringify(parsedResponse),
              stats: {
                models: {},
                tools: {
                  totalCalls: 0,
                  totalSuccess: 0,
                  totalFail: 0,
                  totalDurationMs: 0,
                  totalDecisions: {
                    accept: 0,
                    reject: 0,
                    modify: 0,
                    auto_accept: 0,
                  },
                  byName: {},
                },
                files: {
                  totalLinesAdded: 0,
                  totalLinesRemoved: 0,
                },
              },
            };
            return response;
          }
        }
        
        // Normal response
        if (output.code === 0) {
          const response: GeminiResponse = parsedResponse;
          internalLog('Response parsed successfully, response length: ' + response.response.length, log);
          return response;
        } else {
          // Exit code is not 0 but JSON is valid and not FatalToolExecutionError
          throw new Error(`Command failed with code ${output.code}: ${stderrString}`);
        }
      } catch (parseError) {
        internalLog('Failed to parse JSON: ' + String(parseError), log);
        // If we can't parse JSON and exit code is not 0, throw error
        if (output.code !== 0) {
          throw new Error(`Command failed with code ${output.code}: ${stderrString}`);
        }
        throw new Error('Failed to parse gemini response');
      }
    }

    // No stdout or stderr JSON at all
    if (output.code !== 0) {
      throw new Error(`Command failed with code ${output.code}: ${stderrString}`);
    }

    throw new Error('No output from gemini command');
  } catch (error) {
    internalLog('Error calling Gemini: ' + String(error), log);
    throw error;
  }
}