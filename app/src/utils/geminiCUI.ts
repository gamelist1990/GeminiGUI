import { Command } from '@tauri-apps/plugin-shell';
import { writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { cleanupManager } from './cleanupManager';
import { callOpenAI, callOpenAIStream, OpenAIOptions } from './openaiAPI';
import { generateGeminiToolInstructions } from '../AITool/toolExecutor';

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
  toolUsage?: Array<{
    toolName: string;
    executionTime: number;
    success: boolean;
    timestamp: Date;
    parameters?: Record<string, any>;
    result?: any;
  }>;
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

// Stream response interface for future implementation
export interface GeminiStreamChunk {
  type: 'text' | 'stats' | 'done' | 'error';
  content?: string;
  stats?: GeminiResponse['stats'];
  error?: string;
}

// Callback type for stream processing
export type StreamCallback = (chunk: GeminiStreamChunk) => void;

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
  enabledTools?: string[]; // List of enabled tool names (uses modern tool system)
}

async function ensureDir(path: string) {
  const dirExists = await exists(path);
  if (!dirExists) {
    await mkdir(path, { recursive: true });
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
    
    // Register file for automatic cleanup
    if (workspaceId && sessionId) {
      cleanupManager.register(filePath, workspaceId, sessionId, 'file');
    }
    
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
  geminiPath?: string,
  log?: LogFunction
): Promise<GeminiResponse> {
  let conversationFilePath: string | null = null;
  let workspaceTempDir: string | undefined;
  try {
    internalLog(`callGemini called with prompt length: ${prompt.length}`, log);
    internalLog(`Workspace path: ${workspacePath}`, log);
    //internalLog(`Options: ${JSON.stringify(options)}`, log);
    internalLog(`Google Cloud Project ID: ${googleCloudProjectId}`, log);


    // gemini is a PowerShell script located at the configured path
    let geminiPathFinal = geminiPath;
    if (!geminiPathFinal) {
      // Require geminiPath to be configured - no unsafe fallback to hardcoded paths
      throw new Error('geminiPath is required but not configured. Please run setup to configure the gemini.ps1 path.');
    }

  internalLog(`Using gemini path: ${geminiPathFinal}`, log);
    
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
        
        // Register temp directory for automatic cleanup
        if (workspaceTempDir && options.workspaceId && options.sessionId) {
          cleanupManager.register(workspaceTempDir, options.workspaceId, options.sessionId, 'directory');
        }
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

    // Add modern tool instructions if tools are enabled
    if (options?.enabledTools && options.enabledTools.length > 0) {
      // Check if agent tools are enabled (indicates agent mode)
      const isAgentMode = options.enabledTools.includes('update_task_progress') || 
                          options.enabledTools.includes('send_user_message');
      
      const toolInstructions = generateGeminiToolInstructions(options.enabledTools, isAgentMode);
      if (toolInstructions) {
        promptSections.push(toolInstructions);
        internalLog(`Added modern tool instructions for ${options.enabledTools.length} enabled tools (agent mode: ${isAgentMode})`, log);
      }
    }

    if (conversationToken) {
      promptSections.push(`# CRITICAL: Read Conversation History First

Before responding to the user's message, you MUST:
1. Read and analyze the ENTIRE conversation history file provided below
2. Understand the current context and what the user is trying to do
3. Pay special attention to the LAST few exchanges to understand the ongoing activity
4. If the user is playing a game (like shiritori/word chain), doing a specific task, or having a focused discussion, CONTINUE that activity appropriately
5. DO NOT ignore the context and start a new topic or provide unrelated information

Conversation History File: ${conversationToken}
This JSON file contains a chronological "messages" array showing the full conversation.
**You must read this file first before responding.**`);
    } else if (options?.conversationHistory) {
      promptSections.push(`# CRITICAL: Read Conversation History First

Before responding to the user's message, you MUST:
1. Read and analyze the ENTIRE conversation history below
2. Understand the current context and what the user is trying to do
3. Pay special attention to the LAST few exchanges to understand the ongoing activity
4. If the user is playing a game (like shiritori/word chain), doing a specific task, or having a focused discussion, CONTINUE that activity appropriately
5. DO NOT ignore the context and start a new topic or provide unrelated information

Conversation History:
${options.conversationHistory}`);
    }

    promptSections.push(`# Current User Message

User: ${prompt}

# Your Response Guidelines
- If there's an ongoing activity in the conversation history (game, task, discussion topic), continue it appropriately
- Stay consistent with the conversation flow and context
- Do not provide unrelated information or change topics unless the user explicitly asks
- Keep responses focused and relevant to the current context`);
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
    
    // Use a PowerShell here-string to pass the potentially large and complex
    // prompt as a single literal argument. This avoids issues with nested
    // quotes, newlines, backticks, parentheses, etc. The rest of the
    // gemini arguments are quoted safely.
    const safeWorkspace = (workspacePath || process.cwd()).replace(/'/g, "''");

    // Build the remaining args (excluding the prompt) safely quoted
    const remainingArgs = geminiArgs.slice(1).map(arg => {
      const escaped = String(arg).replace(/'/g, "''");
      return `'${escaped}'`;
    }).join(' ');

    // fullPrompt will be embedded in a PowerShell here-string (single-quoted)
    const hereStringStart = "@'";
    const hereStringEnd = "'@";
    // Ensure the fullPrompt does not contain the here-string terminator sequence '@\n'
    // which is extremely unlikely; if present, fall back to replacing that sequence.
    let safeFullPrompt = fullPrompt;
    if (safeFullPrompt.includes("'@")) {
      safeFullPrompt = safeFullPrompt.replace(/'@/g, "'@' + " + "'@");
    }

    psCommand += `$env:GEMINI_API_KEY='${options?.customApiKey ? options.customApiKey.replace(/'/g, "''") : ''}'; `;
    if (googleCloudProjectId) {
      psCommand += `$env:GOOGLE_CLOUD_PROJECT='${googleCloudProjectId.replace(/'/g, "''")}'; `;
    }
    // Build psCommand with explicit newlines so PowerShell here-string header
    // (@') and terminator ('@) appear on their own lines as required.
    psCommand += `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
      `Set-Location '${safeWorkspace}'; ` +
      `\n$__g_prompt = ${hereStringStart}\n${safeFullPrompt}\n${hereStringEnd};\n` +
      `& '${geminiPathFinal}' $__g_prompt ${remainingArgs}`;
    
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
    
    // Check stderr for error patterns (including quota errors)
    if (stderrString) {
      // First, check for quota exceeded error (429)
      if (stderrString.includes('Quota exceeded') || stderrString.includes('429') || stderrString.includes('RATE_LIMIT_EXCEEDED')) {
        internalLog('Quota exceeded error detected in stderr', log);
        
        // Try to extract more detailed error information
        const quotaMatch = stderrString.match(/Quota exceeded for quota metric '([^']+)'/i);
        const metricName = quotaMatch ? quotaMatch[1] : 'API requests';
        
        // Create a structured error response
        throw new Error(JSON.stringify({
          type: 'QuotaExceededError',
          code: 429,
          metric: metricName,
          message: `API クォータ制限に達しました: ${metricName}`,
          details: 'リクエストの上限に達しました。しばらく時間をおいてから再試行するか、別のAPIキーを使用してください。',
          rawError: stderrString.substring(0, 500) // Include first 500 chars for debugging
        }));
      }
      
      // Try to extract JSON from stderr (may be incomplete due to stream truncation)
      const jsonMatch = stderrString.match(/\[?\{[\s\S]*"error"[\s\S]*\}\]?/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
        // Remove leading '[' if present (from error array)
        if (jsonString.startsWith('[')) {
          jsonString = jsonString.substring(1);
        }
        // Try to close incomplete JSON
        if (!jsonString.endsWith('}')) {
          const lastBrace = jsonString.lastIndexOf('}');
          if (lastBrace > 0) {
            jsonString = jsonString.substring(0, lastBrace + 1);
          }
        }
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
        
        // Check if the unparsed JSON contains quota error information
        if (jsonString.includes('Quota exceeded') || jsonString.includes('429') || jsonString.includes('RATE_LIMIT_EXCEEDED')) {
          internalLog('Quota exceeded error detected in unparsed JSON', log);
          
          // Try to extract metric name from the partial JSON
          const quotaMatch = jsonString.match(/Quota exceeded for quota metric '([^']+)'/i) ||
                            jsonString.match(/quota_metric["']?:\s*["']([^"']+)["']/i);
          const metricName = quotaMatch ? quotaMatch[1] : 'API requests';
          
          throw new Error(JSON.stringify({
            type: 'QuotaExceededError',
            code: 429,
            metric: metricName,
            message: `API クォータ制限に達しました: ${metricName}`,
            details: 'リクエストの上限に達しました。しばらく時間をおいてから再試行するか、別のAPIキーを使用してください。',
            rawError: jsonString.substring(0, 500)
          }));
        }
        
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
    // Cleanup is now managed by CleanupManager
    // Files will be automatically cleaned up after MAX_AGE_MS
    // Or can be manually cleaned up when session/workspace changes
    if (conversationFilePath && options?.workspaceId && options?.sessionId) {
      internalLog(`Conversation file will be auto-cleaned: ${conversationFilePath}`, log);
    }
    if (workspaceTempDir && options?.workspaceId && options?.sessionId) {
      internalLog(`Temp directory will be auto-cleaned: ${workspaceTempDir}`, log);
    }
  }
}

/**
 * Stream-based Gemini API call (Future Implementation)
 * 
 * This function is a placeholder for future streaming response support.
 * When implemented, it will provide real-time response streaming from the Gemini API.
 * 
 * @param prompt - User prompt
 * @param workspacePath - Workspace path
 * @param options - Gemini options
 * @param googleCloudProjectId - Google Cloud Project ID
 * @param geminiPath - Path to gemini.ps1
 * @param onChunk - Callback for each stream chunk
 * @param log - Log function
 * @returns Promise<GeminiResponse> - Final response after stream completes
 * 
 * TODO: Implementation plan
 * 1. Add streaming support to gemini.ps1 CLI (e.g., --stream flag)
 * 2. Parse streaming JSON responses line by line
 * 3. Call onChunk callback for each chunk
 * 4. Accumulate final response and return
 * 5. Handle errors and interruptions
 */
export async function callGeminiStream(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions,
  googleCloudProjectId?: string,
  geminiPath?: string,
  onChunk?: StreamCallback,
  log?: LogFunction
): Promise<GeminiResponse> {
  // For now, fallback to regular async call
  // In the future, this will use streaming architecture
  internalLog('Stream mode is not yet implemented, falling back to async mode', log);
  
  // Simulate streaming by calling async and sending as single chunk
  const response = await callGemini(prompt, workspacePath, options, googleCloudProjectId, geminiPath, log);
  
  if (onChunk) {
    // Send the complete response as a single chunk
    onChunk({ type: 'text', content: response.response });
    onChunk({ type: 'stats', stats: response.stats });
    onChunk({ type: 'done' });
  }
  
  return response;
}
/**
 * Unified AI API call function
 * Automatically selects OpenAI or Gemini based on settings
 */
export async function callAI(
  prompt: string,
  workspacePath?: string,
  options?: GeminiOptions,
  settings?: {
    enableOpenAI?: boolean;
    openAIApiKey?: string;
    openAIBaseURL?: string;
    openAIModel?: string;
    responseMode?: 'async' | 'stream';
    googleCloudProjectId?: string;
    geminiPath?: string;
  },
  onChunk?: StreamCallback,
  log?: LogFunction
): Promise<GeminiResponse> {
  // If OpenAI is enabled, use OpenAI API
  if (settings?.enableOpenAI) {
    internalLog('Using OpenAI API', log);
    
    const openAIOptions: OpenAIOptions = {
      apiKey: settings.openAIApiKey || 'xxx',
      baseURL: settings.openAIBaseURL || 'https://api.openai.com/v1',
      model: settings.openAIModel || 'gpt-3.5-turbo',
      conversationHistory: options?.conversationHistoryJson,
      conversationHistoryJson: options?.conversationHistory, // Add raw JSON history
      includes: options?.includes, // Add file attachments
      includeDirectories: options?.includeDirectories, // Add directory attachments
      enabledTools: options?.enabledTools, // Add enabled tools (uses modern tool system)
      workspacePath, // Add workspace path so AI knows where it is
      workspaceId: options?.workspaceId, // Add workspace ID
      sessionId: options?.sessionId, // Add session ID
    };
    
    // Use streaming if enabled
    if (settings.responseMode === 'stream' && onChunk) {
      internalLog('Using OpenAI streaming mode', log);
      
      // Call OpenAI stream which now returns GeminiResponse with stats
      const geminiResponse = await callOpenAIStream(
        prompt,
        openAIOptions,
        onChunk,
        log
      );
      
      return geminiResponse;
    } else {
      // Use non-streaming mode
      internalLog('Using OpenAI async mode', log);
      return await callOpenAI(prompt, openAIOptions, log);
    }
  } else {
    // Use Gemini API (original behavior)
    internalLog('Using Gemini API', log);
    
    if (settings?.responseMode === 'stream' && onChunk) {
      return await callGeminiStream(
        prompt,
        workspacePath,
        options,
        settings.googleCloudProjectId,
        settings.geminiPath,
        onChunk,
        log
      );
    } else {
      return await callGemini(
        prompt,
        workspacePath,
        options,
        settings?.googleCloudProjectId,
        settings?.geminiPath,
        log
      );
    }
  }
}
