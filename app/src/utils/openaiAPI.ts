import { GeminiResponse, StreamCallback } from './geminiCUI';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { streamingFetch } from './streamingFetch';
import { generateModernToolDefinitions } from './modernToolSystem';
import { executeModernTool } from '../AITool/toolExecutor';

type LogFunction = (message: string) => void;

function internalLog(msg: string, log?: LogFunction) {
  if (log) {
    try { log(msg); } catch (_) { console.log('[OpenAI]', msg); }
  } else {
    console.log('[OpenAI]', msg);
  }
}

export interface OpenAIOptions {
  apiKey: string; // Can be placeholder like "xxx"
  baseURL?: string; // Default: https://api.openai.com/v1
  model?: string; // e.g., gpt-4, gpt-4.1
  stream?: boolean; // Enable streaming
  conversationHistory?: Array<{ role: string; content: string }>;
  conversationHistoryJson?: string; // JSON string of conversation history
  includes?: string[]; // File/directory attachments
  includeDirectories?: string[]; // Directory attachments
  enabledTools?: string[]; // Enabled tool names (uses modern tool system)
  workspacePath?: string; // Current workspace path
  workspaceId?: string; // Workspace identifier
  sessionId?: string; // Session identifier
}

// OpenAI Function/Tool definitions (latest standard)
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string; // For tool role messages
  name?: string; // Tool name for tool role
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * Build comprehensive system prompt with workspace context, file attachments, and tool information
 */
async function buildSystemPrompt(options: OpenAIOptions): Promise<string> {
  const sections: string[] = [];

  // Add workspace context
  if (options.workspacePath) {
    sections.push(`# Current Workspace

You are working in the following workspace:
**Path:** ${options.workspacePath}

This is the current working directory. All file paths should be relative to this workspace unless specified otherwise.`);
  }

  // Add file/directory attachments
  const allIncludes = [
    ...(options.includes || []),
    ...(options.includeDirectories?.map(dir => `dir:${dir}`) || []),
  ];
  
  if (allIncludes.length > 0) {
    sections.push(`# Available Context Files and Directories

The following files and directories are available for reference:
${allIncludes.map(inc => `- ${inc}`).join('\n')}

You can reference these files in your responses.`);
  }

  // Modern tool system handles tool definitions via OpenAI function calling
  // No need for system prompt explanation - tools are provided in the tools parameter
  if (options.enabledTools && options.enabledTools.length > 0) {
    sections.push(`# Available Tools

You have access to the following tools: ${options.enabledTools.join(', ')}

**CRITICAL:** When the user asks you to perform file operations (create, edit, read, delete files/directories), you MUST use the provided function calling tools.`);
  }

  // Add conversation history instructions
  if (options.conversationHistory || options.conversationHistoryJson) {
    sections.push(`# Conversation Context

**IMPORTANT:** This is a continuation of an ongoing conversation.
- Read and understand the full conversation history provided in the messages
- Pay attention to the context and any ongoing tasks or discussions
- Maintain consistency with previous exchanges
- Continue any games, tasks, or focused discussions appropriately
- Do not ignore context or provide unrelated information`);
  }

  return sections.join('\n\n');
}

/**
 * Convert modern tool definitions to OpenAI Function Calling format
 * Now uses the modernToolSystem instead of loading from toolUsage.json
 */
async function loadOpenAITools(
  enabledTools: string[],
  log?: LogFunction
): Promise<OpenAITool[]> {
  try {
    internalLog('Loading tools from modernToolSystem', log);
    internalLog(`Enabled tools parameter: ${JSON.stringify(enabledTools)}`, log);
    
    // Use modern tool system
    const modernTools = generateModernToolDefinitions(enabledTools);
    
    internalLog(`generateModernToolDefinitions returned ${modernTools.length} tools`, log);
    
    // Convert ModernToolDefinition to OpenAITool format
    const tools: OpenAITool[] = modernTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
    
    internalLog(`Loaded ${tools.length} tools from modernToolSystem`, log);
    if (tools.length > 0) {
      internalLog(`Tool names: ${tools.map(t => t.function.name).join(', ')}`, log);
    }
    return tools;
  } catch (error) {
    internalLog(`Failed to load tools: ${error}`, log);
    return [];
  }
}

/**
 * Call OpenAI API (non-streaming)
 */
export async function callOpenAI(
  prompt: string,
  options: OpenAIOptions,
  log?: LogFunction
): Promise<GeminiResponse> {
  try {
    internalLog(`callOpenAI called with prompt length: ${prompt.length}`, log);
    
    const baseURL = options.baseURL || 'https://api.openai.com/v1';
    const model = options.model || 'gpt-4.1';
    const apiKey = options.apiKey || 'xxx';
    
    internalLog(`Using model: ${model}, baseURL: ${baseURL}`, log);
    if (options.workspacePath) {
      internalLog(`Workspace path: ${options.workspacePath}`, log);
    }
    
    // Build messages array
    const messages: OpenAIMessage[] = [];
    
    // Build and add system prompt with workspace context and tool info
    const systemPrompt = await buildSystemPrompt(options);
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
      internalLog(`Added system prompt (${systemPrompt.length} chars)`, log);
    }
    
    // Add conversation history if provided
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        const role = msg.role.toLowerCase();
        if (role === 'user' || role === 'assistant' || role === 'system') {
          messages.push({
            role: role as 'user' | 'assistant' | 'system',
            content: msg.content,
          });
        }
      }
      internalLog(`Added ${options.conversationHistory.length} history messages`, log);
    }
    
    // Add current prompt
    messages.push({
      role: 'user',
      content: prompt,
    });
    
    // Load tools if enabled
    let tools: OpenAITool[] | undefined;
    if (options.enabledTools && options.enabledTools.length > 0) {
      internalLog(`Attempting to load ${options.enabledTools.length} enabled tools: ${options.enabledTools.join(', ')}`, log);
      tools = await loadOpenAITools(options.enabledTools, log);
      if (tools.length > 0) {
        internalLog(`Loaded ${tools.length} tools for OpenAI Function Calling`, log);
      } else {
        internalLog(`WARNING: loadOpenAITools returned 0 tools despite ${options.enabledTools.length} enabled tools`, log);
      }
    } else {
      internalLog(`No tools enabled (enabledTools: ${options.enabledTools ? options.enabledTools.length : 'undefined'})`, log);
    }
    
    const requestBody: OpenAIRequest = {
      model,
      messages,
      stream: false,
      temperature: 0.7,
    };
    
    // Add tools if available
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    
    internalLog(`Sending request to OpenAI API (${messages.length} messages)...`, log);
    
    const response = await tauriFetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }
    
    const data: OpenAIResponse = await response.json();
    
    internalLog(`OpenAI API response received`, log);
    
    const choice = data.choices[0];
    const content = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls || [];
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    
    // Log tool calls if present
    const toolExecutionResults: Array<{name: string; success: boolean; result?: any; error?: string; executionTime: number; parameters?: any}> = [];
    if (toolCalls.length > 0) {
      internalLog(`AI requested ${toolCalls.length} tool calls`, log);
      
      // Execute each tool call
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name.replace(/^OriginTool_/, ''); // Remove prefix
        internalLog(`Executing tool: ${toolName}`, log);
        
        const startTime = Date.now();
        let args: any = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
          const workspacePath = options.workspacePath || process.cwd();
          const result = await executeModernTool(toolName, args, workspacePath);
          const executionTime = Date.now() - startTime;
          
          toolExecutionResults.push({
            name: toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            executionTime,
            parameters: args
          });
          
          if (result.success) {
            internalLog(`✓ Tool ${toolName} succeeded (${executionTime}ms)`, log);
            internalLog(`Result: ${JSON.stringify(result.result)}`, log);
          } else {
            internalLog(`✗ Tool ${toolName} failed: ${result.error}`, log);
          }
        } catch (error) {
          const executionTime = Date.now() - startTime;
          internalLog(`✗ Tool ${toolName} execution error: ${error}`, log);
          toolExecutionResults.push({
            name: toolName,
            success: false,
            error: String(error),
            executionTime,
            parameters: args
          });
        }
      }
    }
    
    // If tool calls were executed, make a follow-up request to get AI's explanation
    let finalContent = content;
    let finalUsage = usage;
    
    if (toolCalls.length > 0) {
      internalLog(`Making follow-up request with ${toolExecutionResults.length} tool results`, log);
      
      // Build follow-up messages array with tool results
      const followUpMessages: OpenAIMessage[] = [...messages];
      
      // Add assistant message with tool calls
      followUpMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,
      });
      
      // Add tool result messages
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        const execResult = toolExecutionResults[i];
        
        followUpMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: execResult.success 
            ? JSON.stringify(execResult.result) 
            : JSON.stringify({ error: execResult.error || 'Tool execution failed' }),
        });
      }
      
      // Make follow-up request
      const followUpRequestBody: OpenAIRequest = {
        model,
        messages: followUpMessages,
        stream: false,
        temperature: 0.7,
      };
      
      internalLog('Sending follow-up request to OpenAI API...', log);
      
      const followUpResponse = await tauriFetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(followUpRequestBody),
      });
      
      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text();
        internalLog(`Follow-up request failed (${followUpResponse.status}): ${errorText}`, log);
        // Continue with tool results only if follow-up fails
      } else {
        const followUpData: OpenAIResponse = await followUpResponse.json();
        const followUpChoice = followUpData.choices[0];
        finalContent = followUpChoice?.message?.content || '';
        finalUsage = followUpData.usage || usage;
        
        internalLog(`Follow-up request completed, received ${finalContent.length} chars`, log);
      }
    }
    
    // Calculate tool statistics from execution results
    const totalSuccess = toolExecutionResults.filter(r => r.success).length;
    const totalFail = toolExecutionResults.filter(r => !r.success).length;
    const totalDurationMs = toolExecutionResults.reduce((sum, r) => sum + r.executionTime, 0);
    
    // Build byName statistics
    const byName: Record<string, any> = {};
    for (const result of toolExecutionResults) {
      if (!byName[result.name]) {
        byName[result.name] = {
          count: 0,
          success: 0,
          fail: 0,
          durationMs: 0,
          decisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: 0,
          },
        };
      }
      byName[result.name].count += 1;
      byName[result.name].durationMs += result.executionTime;
      byName[result.name].auto_accept += 1; // OpenAI auto-accepts tool calls
      if (result.success) {
        byName[result.name].success += 1;
      } else {
        byName[result.name].fail += 1;
      }
    }
    
    // Convert to GeminiResponse format
    const geminiResponse: GeminiResponse = {
      response: finalContent,
      toolUsage: toolExecutionResults.map(result => ({
        toolName: result.name,
        executionTime: result.executionTime,
        success: result.success,
        timestamp: new Date(),
        parameters: result.parameters,
        result: result.result,
      })),
      stats: {
        models: {
          [model]: {
            api: {
              totalRequests: toolCalls.length > 0 ? 2 : 1, // 2 requests if tools were used
              totalErrors: 0,
              totalLatencyMs: 0,
            },
            tokens: {
              prompt: finalUsage.prompt_tokens,
              candidates: finalUsage.completion_tokens,
              total: finalUsage.total_tokens,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
        tools: {
          totalCalls: toolCalls.length,
          totalSuccess: totalSuccess,
          totalFail: totalFail,
          totalDurationMs: totalDurationMs,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: toolCalls.length,
          },
          byName: byName,
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      },
    };
    
    return geminiResponse;
  } catch (error) {
    internalLog(`OpenAI API error: ${error}`, log);
    throw error;
  }
}

/**
 * Call OpenAI API with streaming support (fully async)
 * Returns GeminiResponse with stats after streaming completes
 */
export async function callOpenAIStream(
  prompt: string,
  options: OpenAIOptions,
  onChunk: StreamCallback,
  log?: LogFunction
): Promise<GeminiResponse> {
  let fullResponse = '';
  let toolCallsReceived: Array<{ id: string; name: string; arguments: string }> = [];
  const startTime = Date.now();
  
  try {
    internalLog(`callOpenAIStream called with prompt length: ${prompt.length}`, log);
    
    const baseURL = options.baseURL || 'https://api.openai.com/v1';
    const model = options.model || 'gpt-4.1';
    const apiKey = options.apiKey || 'xxx';
    
    internalLog(`Using model: ${model}, baseURL: ${baseURL}`, log);
    if (options.workspacePath) {
      internalLog(`Workspace path: ${options.workspacePath}`, log);
    }
    
    // Build messages array
    const messages: OpenAIMessage[] = [];
    
    // Build and add system prompt with workspace context and tool info
    const systemPrompt = await buildSystemPrompt(options);
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
      internalLog(`Added system prompt (${systemPrompt.length} chars)`, log);
    }
    
    // Add conversation history if provided
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        const role = msg.role.toLowerCase();
        if (role === 'user' || role === 'assistant' || role === 'system') {
          messages.push({
            role: role as 'user' | 'assistant' | 'system',
            content: msg.content,
          });
        }
      }
      internalLog(`Added ${options.conversationHistory.length} history messages`, log);
    }
    
    // Add current prompt
    messages.push({
      role: 'user',
      content: prompt,
    });
    
    // Load tools if enabled
    let tools: OpenAITool[] | undefined;
    if (options.enabledTools && options.enabledTools.length > 0) {
      internalLog(`Attempting to load ${options.enabledTools.length} enabled tools: ${options.enabledTools.join(', ')}`, log);
      tools = await loadOpenAITools(options.enabledTools, log);
      if (tools.length > 0) {
        internalLog(`Loaded ${tools.length} tools for streaming`, log);
      } else {
        internalLog(`WARNING: loadOpenAITools returned 0 tools despite ${options.enabledTools.length} enabled tools`, log);
      }
    } else {
      internalLog(`No tools enabled (enabledTools: ${options.enabledTools ? options.enabledTools.length : 'undefined'})`, log);
    }
    
    const requestBody: OpenAIRequest = {
      model,
      messages,
      stream: true,
      temperature: 0.7,
    };
    
    // Add tools if available
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    
    internalLog(`Sending streaming request to OpenAI API (${messages.length} messages)...`, log);
    
    // Helper: process SSE lines into events
    const processSSELine = async (
      trimmed: string,
      builders: Map<number, { id?: string; type?: 'function'; name?: string; arguments: string }>,
      outToolCalls: Array<{ id: string; name: string; arguments: string }>,
      onText: (text: string) => void
    ): Promise<'continue' | 'stop' | 'tool_calls'> => {
      if (!trimmed || trimmed === 'data: [DONE]') return 'stop';
      if (!trimmed.startsWith('data: ')) return 'continue';
      try {
        const jsonStr = trimmed.slice(6);
        const chunk: OpenAIStreamChunk = JSON.parse(jsonStr);
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          onText(delta.content);
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            if (!builders.has(index)) builders.set(index, { arguments: '' });
            const builder = builders.get(index)!;
            if (toolCallDelta.id) builder.id = toolCallDelta.id;
            if (toolCallDelta.type) builder.type = toolCallDelta.type;
            if (toolCallDelta.function?.name) builder.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) builder.arguments += toolCallDelta.function.arguments;
          }
        }

        const finish = chunk.choices[0]?.finish_reason;
        if (finish === 'stop') return 'stop';
        if (finish === 'tool_calls') {
          const completed = Array.from(builders.values())
            .filter(tc => tc.id && tc.name)
            .map(tc => ({ id: tc.id!, name: tc.name!, arguments: tc.arguments }));
          if (completed.length > 0) {
            outToolCalls.splice(0, outToolCalls.length, ...completed);
            return 'tool_calls';
          }
        }
      } catch (e) {
        console.warn('Failed to parse SSE chunk:', trimmed, e);
      }
      return 'continue';
    };

    // Issue the initial request
    const response = await tauriFetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    // Track tool calls across chunks
    const toolCallsBuilder: Map<number, { id?: string; type?: 'function'; name?: string; arguments: string }> = new Map();
    let streamToolResults: Array<{ name: string; executionTime: number; success: boolean; result?: any; parameters?: any }> = [];

    const readStreamWithReader = async (resp: Response) => {
      const reader = (resp as any).body?.getReader?.();
      if (!reader) return false;
      internalLog('Using response.body.getReader() for streaming', log);
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        buffer += chunkText;
        
        // Process immediately for better real-time response
        // Split by newlines but process incrementally
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex).trim();
          buffer = buffer.substring(newlineIndex + 1);
          
          // Process line immediately without blocking
          const result = await processSSELine(line, toolCallsBuilder, toolCallsReceived, (t) => {
            onChunk({ type: 'text', content: t });
            fullResponse += t;
          });
          if (result === 'tool_calls') {
            return 'tool_calls' as const;
          }
        }
      }
      // Flush remaining buffer
      if (buffer.trim()) {
        const result = await processSSELine(buffer.trim(), toolCallsBuilder, toolCallsReceived, (t) => {
          onChunk({ type: 'text', content: t });
          fullResponse += t;
        });
        if (result === 'tool_calls') {
          return 'tool_calls' as const;
        }
      }
      return 'done' as const;
    };

    // Try native streaming first, then fallback to curl-based streaming if unavailable
    let initialResult: 'done' | 'tool_calls' | false = await readStreamWithReader(response as any);
    if (initialResult === false) {
      internalLog('Falling back to curl-based streaming via Tauri shell', log);
      await streamingFetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        onChunk: async (line: string) => {
          const trimmed = line.trim();
          await processSSELine(trimmed, toolCallsBuilder, toolCallsReceived, (t) => {
            onChunk({ type: 'text', content: t });
            fullResponse += t;
          });
        },
        onError: (e) => {
          console.error('[OpenAI] streamingFetch error:', e);
        },
        onComplete: () => {},
      });
      // If tool calls were detected during curl stream, mark accordingly
      initialResult = toolCallsReceived.length > 0 ? 'tool_calls' : 'done';
    }

    if (initialResult === 'done' && toolCallsReceived.length === 0) {
      onChunk({ type: 'done' });
    }

    // If tool calls were requested, execute them and issue a follow-up streaming request
    if (toolCallsReceived.length > 0) {
      internalLog(`Streaming completed with ${toolCallsReceived.length} tool calls`, log);

      const followUpMessages: OpenAIMessage[] = [...messages];
      followUpMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCallsReceived.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // Execute tools with progress notifications
      const executedToolResults: Array<{ name: string; executionTime: number; success: boolean; result?: any; parameters?: any }> = [];
      for (let i = 0; i < toolCallsReceived.length; i++) {
        const toolCall = toolCallsReceived[i];
        const toolName = toolCall.name.replace(/^OriginTool_/, '');
        internalLog(`Executing tool (streaming): ${toolName} (${i + 1}/${toolCallsReceived.length})`, log);
        
        // Send progress notification to UI
        onChunk({ type: 'text', content: `\n\n🔧 **Executing tool**: ${toolName}...` });
        
        const t0 = Date.now();
        let args: any = {};
        try {
          args = JSON.parse(toolCall.arguments);
          const workspacePath = options.workspacePath || process.cwd();
          const result = await executeModernTool(toolName, args, workspacePath);
          const dt = Date.now() - t0;
          executedToolResults.push({ name: toolName, executionTime: dt, success: result.success, result: result.result, parameters: args });
          
          // Send completion notification
          onChunk({ type: 'text', content: ` ✓ (${dt}ms)\n` });
        } catch (err) {
          const dt = Date.now() - t0;
          executedToolResults.push({ name: toolName, executionTime: dt, success: false, parameters: args });
          
          // Send error notification
          onChunk({ type: 'text', content: ` ✗ Failed (${dt}ms)\n` });
        }
        // Add tool result message
        const last = executedToolResults[executedToolResults.length - 1];
        followUpMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: last.success ? JSON.stringify(last.result) : JSON.stringify({ error: true }),
        });
      }
      streamToolResults = executedToolResults;
      
      // Notify that AI is generating response
      onChunk({ type: 'text', content: '\n\n💭 **Generating response**...\n\n' });

      // Follow-up streaming request for final text
      const followUpRequestBody: OpenAIRequest = {
        model: model,
        messages: followUpMessages,
        stream: true,
        temperature: 0.7,
      };

      const followUpResponse = await tauriFetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(followUpRequestBody),
      });

      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text();
        throw new Error(`OpenAI follow-up API error (${followUpResponse.status}): ${errorText}`);
      }

      const followUpResult = await readStreamWithReader(followUpResponse as any);
      if (followUpResult === false) {
        // fallback to curl
        await streamingFetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(followUpRequestBody),
          onChunk: async (line: string) => {
            const trimmed = line.trim();
            // Only process text deltas for follow-up; tool calls aren't expected here
            if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) return;
            try {
              const jsonStr = trimmed.slice(6);
              const chunk: OpenAIStreamChunk = JSON.parse(jsonStr);
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                onChunk({ type: 'text', content: delta.content });
                fullResponse += delta.content;
              }
            } catch {}
          },
          onError: (e) => console.error('[OpenAI] streamingFetch follow-up error:', e),
          onComplete: () => {},
        });
      }
      onChunk({ type: 'done' });
    }
    
  const elapsedMs = Date.now() - startTime;
    internalLog(`OpenAI streaming completed in ${elapsedMs}ms`, log);
    
    // Estimate token usage from response length
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    const estimatedCompletionTokens = Math.ceil(fullResponse.length / 4);
    const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens;
    
    // Calculate tool statistics from execution results
    const totalSuccess = streamToolResults.filter(r => r.success).length;
    const totalFail = streamToolResults.filter(r => !r.success).length;
    const totalDurationMs = streamToolResults.reduce((sum, r) => sum + r.executionTime, 0);
    
    // Build byName statistics
    const byName: Record<string, any> = {};
    for (const result of streamToolResults) {
      if (!byName[result.name]) {
        byName[result.name] = {
          count: 0,
          success: 0,
          fail: 0,
          durationMs: 0,
          decisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: 0,
          },
        };
      }
      byName[result.name].count += 1;
      byName[result.name].durationMs += result.executionTime;
      byName[result.name].auto_accept += 1; // OpenAI auto-accepts tool calls
      if (result.success) {
        byName[result.name].success += 1;
      } else {
        byName[result.name].fail += 1;
      }
    }
    
    // Return GeminiResponse with estimated stats
    return {
      response: fullResponse,
      toolUsage: (streamToolResults || []).map((result: {name: string; executionTime: number; success: boolean; result?: any; parameters?: any}) => ({
        toolName: result.name,
        executionTime: result.executionTime,
        success: result.success,
        timestamp: new Date(),
        parameters: result.parameters,
        result: result.result,
      })),
      stats: {
        models: {
          [model]: {
            api: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: elapsedMs,
            },
            tokens: {
              prompt: estimatedPromptTokens,
              candidates: estimatedCompletionTokens,
              total: estimatedTotalTokens,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
        tools: {
          totalCalls: toolCallsReceived.length,
          totalSuccess: totalSuccess,
          totalFail: totalFail,
          totalDurationMs: totalDurationMs,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: toolCallsReceived.length,
          },
          byName: byName,
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      },
    };
  } catch (error) {
    internalLog(`OpenAI stream error: ${error}`, log);
    onChunk({
      type: 'error',
      error: String(error),
    });
    throw error;
  }
}
