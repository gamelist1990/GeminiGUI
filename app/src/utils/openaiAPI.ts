import { GeminiResponse, StreamCallback } from './geminiCUI';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { readTextFile } from '@tauri-apps/plugin-fs';

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
  toolUsageJsonPath?: string; // Path to toolUsage.json
  enabledTools?: string[]; // Enabled tool names
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
async function buildSystemPrompt(options: OpenAIOptions, log?: LogFunction): Promise<string> {
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

  // Add tool information if provided
  if (options.toolUsageJsonPath && options.enabledTools && options.enabledTools.length > 0) {
    try {
      // Read toolUsage.json to get tool details
      const toolUsageContent = await readTextFile(options.toolUsageJsonPath);
      const toolUsageData = JSON.parse(toolUsageContent);
      
      sections.push(`# Available Tools

You have access to the following Python-based tools for file operations and other tasks:

**Enabled Tools:** ${options.enabledTools.join(', ')}

**Tool Usage File:** ${options.toolUsageJsonPath}

**CRITICAL INSTRUCTIONS:**
1. When the user asks you to perform file operations (create, edit, read files/directories), USE THE TOOLS
2. Each tool has specific parameters and usage patterns defined in the tool definitions
3. Tools are executed via Python and return JSON output
4. Always follow the exact parameter format specified for each tool
5. Tools support operations like:
   - File operations (read, write, create, delete)
   - Directory operations (list, create, traverse)
   - Code analysis and manipulation
   - And more based on enabled tools

**Tool Definitions:**
${JSON.stringify(toolUsageData, null, 2)}

Please use these tools when appropriate to fulfill user requests.`);
    } catch (error) {
      internalLog(`Failed to read toolUsage.json: ${error}`, log);
      sections.push(`# Available Tools

You have access to tools: ${options.enabledTools.join(', ')}
Tool definitions are available at: ${options.toolUsageJsonPath}`);
    }
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
 * Convert toolUsage.json format to OpenAI Function Calling format
 */
async function loadOpenAITools(
  toolUsageJsonPath: string,
  enabledTools: string[],
  log?: LogFunction
): Promise<OpenAITool[]> {
  try {
    const toolUsageContent = await readTextFile(toolUsageJsonPath);
    const toolUsageData = JSON.parse(toolUsageContent);
    
    const tools: OpenAITool[] = [];
    
    // Convert each enabled tool to OpenAI format
    for (const toolName of enabledTools) {
      const toolDef = toolUsageData.tools?.find((t: any) => 
        t.name === toolName || t.name === `OriginTool_${toolName}`
      );
      
      if (toolDef) {
        tools.push({
          type: 'function',
          function: {
            name: toolDef.name,
            description: toolDef.docs || toolDef.description || `Tool: ${toolDef.name}`,
            parameters: {
              type: 'object',
              properties: toolDef.parameters || {},
              required: toolDef.required || [],
            },
          },
        });
      }
    }
    
    internalLog(`Loaded ${tools.length} OpenAI tools from ${enabledTools.length} enabled tools`, log);
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
    const systemPrompt = await buildSystemPrompt(options, log);
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
    if (options.toolUsageJsonPath && options.enabledTools && options.enabledTools.length > 0) {
      tools = await loadOpenAITools(options.toolUsageJsonPath, options.enabledTools, log);
      if (tools.length > 0) {
        internalLog(`Loaded ${tools.length} tools for OpenAI Function Calling`, log);
      }
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
    if (toolCalls.length > 0) {
      internalLog(`AI requested ${toolCalls.length} tool calls`, log);
      for (const toolCall of toolCalls) {
        internalLog(`  - ${toolCall.function.name}(${toolCall.function.arguments})`, log);
      }
    }
    
    // Convert to GeminiResponse format
    const geminiResponse: GeminiResponse = {
      response: content,
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
      
      // Append tool call information to response
      geminiResponse.response = content + '\n\n[TOOL_CALLS]\n' + JSON.stringify(toolCallsInfo, null, 2);
    }
    
    return geminiResponse;
  } catch (error) {
    internalLog(`OpenAI API error: ${error}`, log);
    throw error;
  }
}

/**
 * Call OpenAI API with streaming support (fully async)
 */
export async function callOpenAIStream(
  prompt: string,
  options: OpenAIOptions,
  onChunk: StreamCallback,
  log?: LogFunction
): Promise<void> {
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
    const systemPrompt = await buildSystemPrompt(options, log);
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
    if (options.toolUsageJsonPath && options.enabledTools && options.enabledTools.length > 0) {
      tools = await loadOpenAITools(options.toolUsageJsonPath, options.enabledTools, log);
      if (tools.length > 0) {
        internalLog(`Loaded ${tools.length} tools for streaming`, log);
      }
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
              onChunk({
                type: 'text',
                content: '\n\n[TOOL_CALLS]\n' + JSON.stringify(completedToolCalls, null, 2),
              });
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
    
    internalLog(`OpenAI streaming completed`, log);
  } catch (error) {
    internalLog(`OpenAI stream error: ${error}`, log);
    onChunk({
      type: 'error',
      error: String(error),
    });
    throw error;
  }
}
