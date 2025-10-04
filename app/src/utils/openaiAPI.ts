import { GeminiResponse, StreamCallback } from './geminiCUI';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
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
    
    // Convert to GeminiResponse format
    const geminiResponse: GeminiResponse = {
      response: content,
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
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 0,
            },
            tokens: {
              prompt: usage.prompt_tokens,
              candidates: usage.completion_tokens,
              total: usage.total_tokens,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
        tools: {
          totalCalls: toolCalls.length,
          totalSuccess: 0, // Will be updated after tool execution
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: toolCalls.length, // Auto-accept for now
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      },
    };
    
    // If there are tool calls, append them to the response in a structured format
    if (toolCalls.length > 0) {
      const toolCallsInfo = toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
      
      // Build comprehensive response with tool results
      let toolResultsText = '';
      for (const execResult of toolExecutionResults) {
        if (execResult.success) {
          toolResultsText += `\n\n[${execResult.name}] Success:\n${JSON.stringify(execResult.result, null, 2)}`;
        } else {
          toolResultsText += `\n\n[${execResult.name}] Error: ${execResult.error}`;
        }
      }
      
      // Append tool call information to response
      geminiResponse.response = content + toolResultsText + '\n\n[TOOL_CALLS]\n' + JSON.stringify(toolCallsInfo, null, 2);
    }
    
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
    
    // Send request
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

    // Get response text (SSE format)
    const text = await response.text();
    internalLog(`Received streaming response, processing...`, log);
    
    // Split by lines and process SSE format
    const lines = text.split('\n');
    
    // Track tool calls across chunks
    let streamToolResults: Array<{name: string; executionTime: number; success: boolean; result?: any}> = [];
    const toolCallsBuilder: Map<number, {
      id?: string;
      type?: 'function';
      name?: string;
      arguments: string;
    }> = new Map();
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and done marker
      if (!trimmed || trimmed === 'data: [DONE]') {
        continue;
      }
      
      // Parse SSE data
      if (trimmed.startsWith('data: ')) {
        try {
          const jsonStr = trimmed.slice(6);
          const chunk: OpenAIStreamChunk = JSON.parse(jsonStr);
          
          const delta = chunk.choices[0]?.delta;
          
          // Handle text content
          if (delta?.content) {
            onChunk({
              type: 'text',
              content: delta.content,
            });
            fullResponse += delta.content;
          }
          
          // Handle tool calls (streamed incrementally)
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;
              
              if (!toolCallsBuilder.has(index)) {
                toolCallsBuilder.set(index, {
                  arguments: '',
                });
              }
              
              const builder = toolCallsBuilder.get(index)!;
              
              if (toolCallDelta.id) {
                builder.id = toolCallDelta.id;
              }
              if (toolCallDelta.type) {
                builder.type = toolCallDelta.type;
              }
              if (toolCallDelta.function?.name) {
                builder.name = toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                builder.arguments += toolCallDelta.function.arguments;
              }
            }
          }
          
          // Check for completion
          if (chunk.choices[0]?.finish_reason === 'stop') {
            onChunk({
              type: 'done',
            });
          } else if (chunk.choices[0]?.finish_reason === 'tool_calls') {
            // Send tool calls information
            const completedToolCalls = Array.from(toolCallsBuilder.values())
              .filter(tc => tc.id && tc.name)
              .map(tc => ({
                id: tc.id!,
                name: tc.name!,
                arguments: tc.arguments,
              }));
            
            if (completedToolCalls.length > 0) {
              internalLog(`Streaming completed with ${completedToolCalls.length} tool calls`, log);
              toolCallsReceived = completedToolCalls;
              
              // Build messages array for second request
              const followUpMessages: OpenAIMessage[] = [...messages];
              
              // Add assistant's tool calls
              followUpMessages.push({
                role: 'assistant',
                content: null,
                tool_calls: completedToolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                })),
              });
              
              // Track tool execution results
              const streamToolResults: Array<{name: string; executionTime: number; success: boolean; result?: any; parameters?: any}> = [];
              
              // Execute each tool call and add results as tool messages
              for (const toolCall of completedToolCalls) {
                const toolName = toolCall.name.replace(/^OriginTool_/, ''); // Remove prefix
                internalLog(`Executing tool (streaming): ${toolName}`, log);
                
                const startTime = Date.now();
                let toolResult: string;
                let args: any = {};
                try {
                  args = JSON.parse(toolCall.arguments);
                  const workspacePath = options.workspacePath || process.cwd();
                  const result = await executeModernTool(toolName, args, workspacePath);
                  const executionTime = Date.now() - startTime;
                  
                  streamToolResults.push({
                    name: toolName,
                    executionTime,
                    success: result.success,
                    result: result.result,
                    parameters: args,
                  });
                  
                  if (result.success) {
                    internalLog(`✓ Tool ${toolName} succeeded (${executionTime}ms)`, log);
                    toolResult = JSON.stringify(result.result);
                  } else {
                    internalLog(`✗ Tool ${toolName} failed: ${result.error}`, log);
                    toolResult = JSON.stringify({ error: result.error });
                  }
                } catch (error) {
                  const executionTime = Date.now() - startTime;
                  internalLog(`✗ Tool ${toolName} execution error: ${error}`, log);
                  streamToolResults.push({
                    name: toolName,
                    executionTime,
                    success: false,
                    parameters: args,
                  });
                  toolResult = JSON.stringify({ error: String(error) });
                }
                
                // Add tool result as a tool message
                followUpMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: toolResult,
                });
              }
              
              // Make a second request to get AI's final response
              internalLog('Making follow-up request for AI final response...', log);
              const followUpRequestBody: OpenAIRequest = {
                model: model,
                messages: followUpMessages,
                stream: true,
                temperature: 0.7,
              };
              
              // Don't include tools in follow-up request to force a text response
              // followUpRequestBody.tools = tools; // Commented out
              
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
              
              // Process follow-up streaming response (using text() like the initial request)
              const followUpText = await followUpResponse.text();
              const followUpLines = followUpText.split('\n');
              
              for (const line of followUpLines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;
                
                try {
                  const jsonStr = trimmed.slice(6);
                  const chunk: OpenAIStreamChunk = JSON.parse(jsonStr);
                  const delta = chunk.choices[0]?.delta;
                  
                  if (delta?.content) {
                    fullResponse += delta.content;
                    onChunk({
                      type: 'text',
                      content: delta.content,
                    });
                  }
                } catch (parseError) {
                  console.warn('Failed to parse follow-up SSE chunk:', trimmed, parseError);
                }
              }
              
              internalLog('Follow-up request completed', log);
            }
            
            onChunk({
              type: 'done',
            });
          }
          
          // Small delay to simulate natural streaming
          await new Promise(resolve => setTimeout(resolve, 10));
          
        } catch (parseError) {
          console.warn('Failed to parse SSE chunk:', trimmed, parseError);
        }
      }
    }
    
    const elapsedMs = Date.now() - startTime;
    internalLog(`OpenAI streaming completed in ${elapsedMs}ms`, log);
    
    // Estimate token usage from response length
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    const estimatedCompletionTokens = Math.ceil(fullResponse.length / 4);
    const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens;
    
    // Return GeminiResponse with estimated stats
    return {
      response: fullResponse,
      toolUsage: streamToolResults.map((result: {name: string; executionTime: number; success: boolean; result?: any; parameters?: any}) => ({
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
          totalSuccess: 0, // Unknown in streaming
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            auto_accept: toolCallsReceived.length,
          },
          byName: {},
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
