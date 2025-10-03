import { Command } from '@tauri-apps/plugin-shell';
import { writeTextFile, exists, mkdir, remove } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

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
  conversationHistory?: string; // Serialized conversation history for inline fallback
  conversationHistoryJson?: Array<{ role: string; content: string }>;
  workspaceId?: string;
  sessionId?: string;
}

async function ensureDir(path: string) {
  const dirExists = await exists(path);
  if (!dirExists) {
    await mkdir(path, { recursive: true });
  }
}

async function cleanupDir(path: string, log?: LogFunction) {
  try {
    const existsFlag = await exists(path);
    if (!existsFlag) {
      return;
    }
    await remove(path, { recursive: true });
    // 再作成しないようここではログだけ残す
    internalLog(`Conversation temp directory removed: ${path}`, log);
  } catch (error) {
    internalLog('Failed to remove conversation temp directory: ' + String(error), log);
  }
}

interface ConversationHistoryFileOptions {
  historyJson?: Array<{ role: string; content: string }>;
  rawText?: string;
  attachments?: string[];
  workspaceId?: string;
  workspaceTempDir?: string;
  sessionId?: string;
  log?: LogFunction;
}

function formatAttachmentToken(token: string): string {
  if (!token) {
    return '';
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('@')) {
    return trimmed;
  }

  if (trimmed.startsWith('dir:')) {
    return `@${trimmed}`;
  }

  if (trimmed.startsWith('file:') || trimmed.startsWith('folder:')) {
    return `@${trimmed}`;
  }

  if (trimmed === 'codebase') {
    return '@codebase';
  }

  return `@${trimmed}`;
}

function formatRole(role: string): string {
  const lower = role?.toLowerCase?.() ?? '';
  if (lower === 'user') return 'User';
  if (lower === 'assistant') return 'Assistant';
  if (lower === 'system') return 'System';
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';
}

async function writeConversationHistoryFile({
  historyJson,
  rawText,
  attachments,
  workspaceId,
  workspaceTempDir,
  sessionId,
  log,
}: ConversationHistoryFileOptions): Promise<string | null> {
  try {
    if (!workspaceTempDir || !sessionId) {
      internalLog('Workspace temp directory or session not provided, skipping conversation file creation', log);
      return null;
    }

    await ensureDir(workspaceTempDir);

    const fileName = `conversation-${sessionId}.json`;
    const filePath = await join(workspaceTempDir, fileName);
    const uniqueTokens = Array.from(
      new Set((attachments ?? []).map(formatAttachmentToken).filter(Boolean))
    );
    const messages = historyJson && historyJson.length > 0
      ? historyJson.map((entry) => ({
          role: formatRole(entry.role),
          content: entry.content,
        }))
      : rawText
        ? [{ role: 'Context', content: rawText }]
        : [];

    const payload = {
      content: uniqueTokens,
      messages,
      metadata: {
        sessionId,
        workspaceId: workspaceId ?? null,
        createdAt: new Date().toISOString(),
      },
    };

    await writeTextFile(filePath, JSON.stringify(payload, null, 2));
    internalLog(`Conversation history saved to: ${filePath}`, log);
    return filePath;
  } catch (error) {
    internalLog('Failed to write conversation history file: ' + String(error), log);
    return null;
  }
}

export async function callGemini(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions,
  googleCloudProjectId?: string,
  log?: LogFunction
): Promise<GeminiResponse> {
  let conversationFilePath: string | null = null;
  let workspaceTempDir: string | undefined;
  try {
    internalLog(`callGemini called with prompt length: ${prompt.length}`, log);
    internalLog(`Workspace path: ${workspacePath}`, log);
    //internalLog(`Options: ${JSON.stringify(options)}`, log);
    internalLog(`Google Cloud Project ID: ${googleCloudProjectId}`, log);
    

    // gemini is a PowerShell script located at "C:\nvm4w\nodejs\gemini.ps1"
    const geminiPath = `C:\\nvm4w\\nodejs\\gemini.ps1`;

  internalLog(`Using gemini path: ${geminiPath}`, log);
    
    // Build gemini command arguments as array
    const geminiArgs: string[] = [];

    // Prepare includes array, optionally augmented with conversation history file
    const includesList = [...(options?.includes || [])];
    const includeDirectories = [...(options?.includeDirectories || [])];
    const attachmentsForHistory = [
      ...includesList,
      ...includeDirectories.map((dir) => `dir:${dir}`),
    ];

    let conversationToken: string | undefined;
    if (options?.conversationHistory) {
      workspaceTempDir = workspacePath ? await join(workspacePath, 'temp', 'GeminiTemp') : undefined;
      const conversationFile = await writeConversationHistoryFile({
        historyJson: options.conversationHistoryJson,
        rawText: options.conversationHistory,
        attachments: attachmentsForHistory,
        workspaceId: options.workspaceId,
        workspaceTempDir,
        sessionId: options.sessionId,
        log,
      });

      if (conversationFile) {
        conversationFilePath = conversationFile;
        const normalized = conversationFile.replace(/\\/g, '/');
        conversationToken = `@file:${normalized}`;
      } else {
        // Fallback to inline history if file creation failed
        internalLog('Falling back to inline conversation history', log);
      }
    }

    const contentTokensRaw = attachmentsForHistory;
    const contentTokens = contentTokensRaw.length > 0
      ? contentTokensRaw.map((inc) => (inc.startsWith('@') ? inc : `@${inc}`))
      : ['@なし'];

    const promptSections: string[] = [`Contents: ${contentTokens.join(', ')}`];

    if (conversationToken) {
      promptSections.push(`Conversation: ${conversationToken} (JSON with chronological "messages" array; use it to understand prior context.)`);
    } else if (options?.conversationHistory) {
      promptSections.push(`Conversation:\n${options.conversationHistory}`);
    }

    promptSections.push(`User: ${prompt}`);
    const fullPrompt = promptSections.join('\n\n');
    
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
    
  const previewLength = 600;
  const commandPreview = psCommand.length > previewLength
    ? psCommand.substring(0, previewLength) + '...'
    : psCommand;
  internalLog(`PowerShell command (${psCommand.length} chars): ${commandPreview}`, log);
    
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
  } finally {
    if (conversationFilePath) {
      try {
        await remove(conversationFilePath);
        internalLog(`Conversation history removed: ${conversationFilePath}`, log);
      } catch (cleanupError) {
        internalLog('Failed to remove conversation history file: ' + String(cleanupError), log);
      }
    }
    if (workspaceTempDir) {
      await cleanupDir(workspaceTempDir, log);
    }
  }
}