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
  model?: string; // Model to use (e.g., 'gemini-2.5-flash')
  customApiKey?: string; // Custom API key
  conversationHistory?: string; // Conversation history as system message
}

export async function callGemini(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions
): Promise<GeminiResponse> {
  try {
    console.log('callGemini called with prompt length:', prompt.length);
    console.log('Workspace path:', workspacePath);
    console.log('Options:', options);
    

    // gemini is a PowerShell script located at "C:\nvm4w\nodejs\gemini.ps1"
    const geminiPath = `C:\\nvm4w\\nodejs\\gemini.ps1`;

    console.log('Using gemini path:', geminiPath);
    
    // Build gemini command arguments as array
    const geminiArgs: string[] = [];
    
    // Build the full prompt with conversation history and includes
    let fullPrompt = '';
    
    // Add conversation history at the beginning if provided
    if (options?.conversationHistory) {
      fullPrompt = `[Previous conversation context]\n${options.conversationHistory}\n\n[Current user message]\n`;
      console.log('Adding conversation history to prompt, length:', options.conversationHistory.length);
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
    
    // Add checkpointing flag
    if (options?.checkpointing) {
      geminiArgs.push('--checkpointing');
    }
    
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
    
    // Add custom API key as environment variable if provided
    let psCommand = '';
    if (options?.customApiKey) {
      psCommand += `$env:GEMINI_API_KEY='${options.customApiKey.replace(/'/g, "''")}'; `;
    }
    
    psCommand += `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
      `Set-Location '${workspacePath || process.cwd()}'; ` +
      `& '${geminiPath}' ${geminiArgs.map(arg => {
        // Escape quotes in arguments
        const escaped = arg.replace(/'/g, "''");
        return `'${escaped}'`;
      }).join(' ')}`;
    
    console.log('PowerShell command:', psCommand.substring(0, 200) + '...');
    
    commandArgs.push(psCommand);
    
    const command = Command.create('powershell.exe', commandArgs);
    console.log('Executing command...');
    const output = await command.execute();
    
    console.log('Command exit code:', output.code);
    console.log('Command stdout length:', output.stdout.length);
    console.log('Command stderr:', output.stderr);

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
        console.log('Found JSON in stderr');
      }
    }
    
    // If not found in stderr, check stdout
    if (!jsonString && stdoutString) {
      jsonString = stdoutString;
      jsonSource = 'stdout';
      console.log('Using stdout as JSON');
    }
    
    if (jsonString) {
      try {
        console.log(`JSON response preview from ${jsonSource}:`, jsonString.substring(0, 200) + '...');
        const parsedResponse = JSON.parse(jsonString);
        
        // Check if the response contains a FatalToolExecutionError
        if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.error) {
          const errorObj = parsedResponse.error;
          if (errorObj.type === 'FatalToolExecutionError') {
            console.log('FatalToolExecutionError detected in response:', errorObj);
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
          console.log('Response parsed successfully, response length:', response.response.length);
          return response;
        } else {
          // Exit code is not 0 but JSON is valid and not FatalToolExecutionError
          throw new Error(`Command failed with code ${output.code}: ${stderrString}`);
        }
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
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
    console.error('Error calling Gemini:', error);
    throw error;
  }
}