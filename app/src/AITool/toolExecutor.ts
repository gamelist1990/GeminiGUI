/**
 * Modern AI Tool Execution Engine
 * 
 * Coordinates between frontend tool definitions and backend Rust implementations
 * Provides type-safe tool execution with result tracking
 */

import { invoke } from '@tauri-apps/api/core';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { getAllTools } from './modernTools';
import type { ModernToolDefinition } from './modernTools';

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  toolName?: string;
}

/**
 * Agent tool callbacks for UI updates
 */
export interface AgentToolCallbacks {
  onUpdateTaskProgress?: (markdownContent: string) => void;
  onSendUserMessage?: (message: string, messageType: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalExecutionTime: number;
  toolStats: Record<string, {
    calls: number;
    successes: number;
    failures: number;
    avgExecutionTime: number;
  }>;
}

/**
 * Tool execution tracker
 */
class ToolExecutionTracker {
  private stats: ToolExecutionStats = {
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    totalExecutionTime: 0,
    toolStats: {}
  };

  recordExecution(toolName: string, result: ToolExecutionResult): void {
    this.stats.totalCalls++;
    this.stats.totalExecutionTime += result.executionTime || 0;

    if (result.success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }

    if (!this.stats.toolStats[toolName]) {
      this.stats.toolStats[toolName] = {
        calls: 0,
        successes: 0,
        failures: 0,
        avgExecutionTime: 0
      };
    }

    const toolStat = this.stats.toolStats[toolName];
    toolStat.calls++;
    if (result.success) {
      toolStat.successes++;
    } else {
      toolStat.failures++;
    }
    
    // Update average execution time
    const totalTime = toolStat.avgExecutionTime * (toolStat.calls - 1) + (result.executionTime || 0);
    toolStat.avgExecutionTime = totalTime / toolStat.calls;
  }

  getStats(): ToolExecutionStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      totalExecutionTime: 0,
      toolStats: {}
    };
  }
}

// Global tracker instance
const tracker = new ToolExecutionTracker();

/**
 * Get enabled tools based on user settings
 */
export function getEnabledModernTools(enabledToolNames?: string[]): ModernToolDefinition[] {
  const normalizedEnabledNames = enabledToolNames?.map(name => name.replace(/^OriginTool_/, ''));
  const allTools = getAllTools();
  
  if (!normalizedEnabledNames || normalizedEnabledNames.length === 0) {
    return allTools;
  }

  return allTools.filter(tool => 
    normalizedEnabledNames.includes(tool.function.name)
  );
}

/**
 * Execute a tool call using Tauri backend
 * This provides a safe, sandboxed execution environment
 */
export async function executeModernTool(
  toolName: string,
  parameters: Record<string, any>,
  workspacePath: string,
  agentCallbacks?: AgentToolCallbacks
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  // Remove OriginTool_ prefix if present
  const actualToolName = toolName.replace(/^OriginTool_/, '');

  // Get agent callbacks from window if not provided directly
  if (!agentCallbacks && (window as any).__agentCallbacks) {
    agentCallbacks = (window as any).__agentCallbacks;
  }

  try {
    console.log(`[ModernTools] Executing ${actualToolName} with params:`, parameters);

    // Resolve relative paths to absolute paths
    const resolvePath = (path: string): string => {
      if (!path) return workspacePath;
      if (path === '.') return workspacePath;
      if (path.startsWith('/') || path.match(/^[A-Z]:\\/)) {
        return path; // Already absolute
      }
      const separator = workspacePath.includes('\\') ? '\\' : '/';
      return `${workspacePath}${separator}${path}`;
    };

    let result: any;

    switch (actualToolName) {
      case 'read_file': {
        const filePath = resolvePath(parameters.path);
        try {
          const content = await invoke<string>('tool_read_file', { path: filePath });
          result = { 
            content, 
            path: filePath, 
            size: content.length,
            success: true,
            message: `File successfully read from ${filePath} (${content.length} bytes)`
          };
        } catch (readError) {
          const errorMsg = String(readError);
          let helpfulMessage = `Failed to read file from ${filePath}. `;
          
          if (errorMsg.includes('not found') || errorMsg.includes('No such file')) {
            helpfulMessage += 'File does not exist - verify the path is correct or create it first using write_file tool.';
          } else if (errorMsg.includes('permission') || errorMsg.includes('Access is denied')) {
            helpfulMessage += 'Permission denied - check if the file is readable.';
          } else if (errorMsg.includes('workspace')) {
            helpfulMessage += `Path must be within workspace: ${workspacePath}`;
          } else {
            helpfulMessage += `Error: ${errorMsg}`;
          }
          
          throw new Error(helpfulMessage);
        }
        break;
      }

      case 'write_file': {
        const filePath = resolvePath(parameters.path);
        try {
          await invoke('tool_write_file', { 
            path: filePath, 
            content: parameters.content 
          });
          result = { 
            path: filePath, 
            bytes_written: parameters.content.length,
            success: true,
            message: `File successfully written to ${filePath} (${parameters.content.length} bytes)`
          };
        } catch (writeError) {
          // Provide detailed error feedback for write failures
          const errorMsg = String(writeError);
          let helpfulMessage = `Failed to write file to ${filePath}. `;
          
          if (errorMsg.includes('permission') || errorMsg.includes('Access is denied')) {
            helpfulMessage += 'Permission denied - check if the directory is writable or if the file is locked by another process.';
          } else if (errorMsg.includes('not found') || errorMsg.includes('No such file')) {
            helpfulMessage += 'Directory does not exist - try creating the parent directory first using create_directory tool.';
          } else if (errorMsg.includes('workspace')) {
            helpfulMessage += `Path must be within workspace: ${workspacePath}`;
          } else {
            helpfulMessage += `Error: ${errorMsg}`;
          }
          
          throw new Error(helpfulMessage);
        }
        break;
      }

      case 'list_directory': {
        const dirPath = resolvePath(parameters.path);
        const entries = await invoke<string[]>('tool_list_directory', { 
          path: dirPath, 
          recursive: parameters.recursive || false 
        });
        result = { entries, path: dirPath, count: entries.length };
        break;
      }

      case 'create_directory': {
        const dirPath = resolvePath(parameters.path);
        try {
          await invoke('tool_create_directory', { path: dirPath });
          result = { 
            path: dirPath, 
            created: true,
            success: true,
            message: `Directory successfully created at ${dirPath}`
          };
        } catch (createError) {
          const errorMsg = String(createError);
          let helpfulMessage = `Failed to create directory at ${dirPath}. `;
          
          if (errorMsg.includes('permission') || errorMsg.includes('Access is denied')) {
            helpfulMessage += 'Permission denied - check if parent directory is writable.';
          } else if (errorMsg.includes('exists')) {
            helpfulMessage += 'Directory already exists - you can proceed to write files there.';
            // Return success if directory already exists
            result = { 
              path: dirPath, 
              created: false, 
              already_exists: true,
              success: true,
              message: `Directory already exists at ${dirPath}`
            };
            break;
          } else if (errorMsg.includes('workspace')) {
            helpfulMessage += `Path must be within workspace: ${workspacePath}`;
          } else {
            helpfulMessage += `Error: ${errorMsg}`;
          }
          
          throw new Error(helpfulMessage);
        }
        break;
      }

      case 'delete_file': {
        const filePath = resolvePath(parameters.path);
        await invoke('tool_delete_file', { path: filePath });
        result = { path: filePath, deleted: true };
        break;
      }

      case 'move_file': {
        const sourcePath = resolvePath(parameters.source);
        const destPath = resolvePath(parameters.destination);
        await invoke('tool_move_file', { 
          source: sourcePath, 
          destination: destPath 
        });
        result = { source: sourcePath, destination: destPath, moved: true };
        break;
      }

      case 'search_files': {
        const searchPath = parameters.path ? resolvePath(parameters.path) : workspacePath;
        const matches = await invoke<string[]>('tool_search_files', { 
          path: searchPath, 
          pattern: parameters.pattern 
        });
        result = { matches, pattern: parameters.pattern, count: matches.length };
        break;
      }

      case 'run_command': {
        const workingDir = parameters.working_dir ? resolvePath(parameters.working_dir) : workspacePath;
        const commandResult = await invoke<{
          stdout: string;
          stderr: string;
          exitCode: number;
          success: boolean;
        }>('tool_run_command', {
          command: parameters.command || 'powershell',
          args: parameters.args || [],
          workingDir
        });
        result = commandResult;
        break;
      }

      case 'file_check': {
        const filePath = resolvePath(parameters.path);
        const checkResult = await invoke<{
          valid: boolean;
          errors: string[];
          warnings: string[];
          file_type: string;
          line_count: number;
          encoding: string;
        }>('tool_file_check', { path: filePath });
        result = checkResult;
        break;
      }

      case 'apply_diff': {
        const filePath = resolvePath(parameters.path);
        const diffResult = await invoke<{
          success: boolean;
          message: string;
          lines_changed: number;
          lines_added: number;
          lines_removed: number;
        }>('tool_apply_diff', {
          path: filePath,
          diffContent: parameters.diff_content
        });
        result = diffResult;
        break;
      }

      case 'fetch': {
        const fetchResult = await invoke<{
          success: boolean;
          status: number;
          headers: Record<string, string>;
          contentType: string;
          body: string;
          bodyLength: number;
          elapsedMs: number;
          url: string;
        }>('tool_fetch', {
          url: parameters.url,
          method: parameters.method || 'GET',
          headers: parameters.headers || {},
          timeout: parameters.timeout || 30
        });
        result = fetchResult;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${actualToolName}`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`[ModernTools] ${actualToolName} completed in ${executionTime}ms`);

    const executionResult: ToolExecutionResult = {
      success: true,
      result,
      executionTime,
      toolName: actualToolName
    };

    tracker.recordExecution(actualToolName, executionResult);
    return executionResult;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`[ModernTools] ${actualToolName} failed:`, error);

    const executionResult: ToolExecutionResult = {
      success: false,
      error: String(error),
      executionTime,
      toolName: actualToolName
    };

    tracker.recordExecution(actualToolName, executionResult);
    return executionResult;
  }
}

/**
 * Generate tool definitions for AI consumption
 * Compatible with OpenAI, Anthropic, and Gemini APIs
 */
export function generateModernToolDefinitions(enabledToolNames?: string[]): ModernToolDefinition[] {
  const tools = getEnabledModernTools(enabledToolNames);
  
  // Add OriginTool prefix
  return tools.map(tool => ({
    ...tool,
    function: {
      ...tool.function,
      name: `OriginTool_${tool.function.name}`,
      description: `[Origin] ${tool.function.description}`
    }
  }));
}

/**
 * Write modern tool definitions to a JSON file for AI reference
 */
export async function writeModernToolsJson(
  outputPath: string,
  enabledToolNames?: string[]
): Promise<void> {
  const tools = generateModernToolDefinitions(enabledToolNames);
  
  const toolsJson = {
    version: '2.0',
    format: 'openai_function_calling',
    tools: tools,
    usage: 'These tools are available for file and directory operations in the workspace.',
    notes: [
      'All paths are relative to the workspace root unless absolute',
      'Tools are executed in a sandboxed Tauri environment',
      'File operations respect workspace boundaries',
      'Tools support both synchronous and asynchronous operations'
    ]
  };

  await writeTextFile(outputPath, JSON.stringify(toolsJson, null, 2));
  console.log(`[ModernTools] Written tool definitions to ${outputPath}`);
}

/**
 * Get tool execution statistics
 */
export function getToolExecutionStats(): ToolExecutionStats {
  return tracker.getStats();
}

/**
 * Reset tool execution statistics
 */
export function resetToolExecutionStats(): void {
  tracker.reset();
}

/**
 * Generate Gemini-specific tool instructions for contents parameter
 * This creates a system prompt-like message explaining available tools to Gemini
 * 
 * @param enabledToolNames - Optional list of enabled tool names
 * @param includeAgentTools - Whether to include agent-specific tools
 * @returns Markdown-formatted tool instruction text for Gemini's contents
 */
export function generateGeminiToolInstructions(enabledToolNames?: string[]): string {
  const tools = getEnabledModernTools(enabledToolNames);
  
  if (tools.length === 0) {
    return '';
  }

  const instructions: string[] = [
    '# 利用可能なツール (Available Tools)',
    '',
    'あなたは以下のツールを使用してファイルやディレクトリを操作できます。',
    'You have access to the following tools for file and directory operations:',
    '',
    '## ツールの使い方 (How to Use Tools)',
    '',
    '**重要な指示 (CRITICAL INSTRUCTIONS):**',
    '1. ユーザーがファイル操作（作成、編集、読み取り、削除）を依頼した場合、これらのツールを使用してください',
    '2. 各ツールの説明とパラメータスキーマに従って正確に呼び出してください',
    '3. すべてのパスはワークスペースルートからの相対パスまたは絶対パスです',
    '4. ツールは Tauri の安全な環境で実行されます',
    '5. **複数のツールを同時に呼び出すことができます** - 効率を上げるため、関連する操作は一度に実行してください',
    '6. **ツールの実行結果を必ず確認してください** - success フィールドで成功/失敗を判断し、失敗時は別の方法を試してください',
    '7. **エラーが発生した場合は代替手段を検討してください** - 例: ディレクトリが存在しない場合はまず create_directory を実行',
    '',
    '1. When users ask you to perform file operations (create, edit, read, delete), USE THESE TOOLS',
    '2. Follow the exact parameter format specified in each tool\'s schema',
    '3. All paths are relative to workspace root or absolute paths',
    '4. Tools are executed in a secure Tauri environment',
    '5. **YOU CAN CALL MULTIPLE TOOLS AT ONCE** - For efficiency, execute related operations together',
    '6. **ALWAYS CHECK TOOL EXECUTION RESULTS** - Use the success field to determine if operations succeeded, and try alternatives on failure',
    '7. **HANDLE ERRORS GRACEFULLY** - Example: If directory doesn\'t exist, create it first with create_directory',
    '',
  ];
  
  instructions.push('---', '');

  // Group tools by category
  const fileTools = tools.filter(t => t.function.name.startsWith('read_file') || 
                                       t.function.name.startsWith('write_file') ||
                                       t.function.name.startsWith('delete_file') ||
                                       t.function.name.startsWith('move_file'));
  const dirTools = tools.filter(t => t.function.name.startsWith('list_directory') || 
                                      t.function.name.startsWith('create_directory'));
  const searchTools = tools.filter(t => t.function.name.startsWith('search_'));

  // Add file operation tools
  if (fileTools.length > 0) {
    instructions.push('## 📄 ファイル操作ツール (File Operation Tools)', '');
    fileTools.forEach(tool => {
      instructions.push(`### \`${tool.function.name}\``);
      instructions.push(`**説明:** ${tool.function.description}`);
      instructions.push('**パラメータ:**');
      instructions.push('```json');
      instructions.push(JSON.stringify(tool.function.parameters, null, 2));
      instructions.push('```');
      instructions.push('');
    });
  }

  // Add directory operation tools
  if (dirTools.length > 0) {
    instructions.push('## 📁 ディレクトリ操作ツール (Directory Operation Tools)', '');
    dirTools.forEach(tool => {
      instructions.push(`### \`${tool.function.name}\``);
      instructions.push(`**説明:** ${tool.function.description}`);
      instructions.push('**パラメータ:**');
      instructions.push('```json');
      instructions.push(JSON.stringify(tool.function.parameters, null, 2));
      instructions.push('```');
      instructions.push('');
    });
  }

  // Add search tools
  if (searchTools.length > 0) {
    instructions.push('## 🔍 検索ツール (Search Tools)', '');
    searchTools.forEach(tool => {
      instructions.push(`### \`${tool.function.name}\``);
      instructions.push(`**説明:** ${tool.function.description}`);
      instructions.push('**パラメータ:**');
      instructions.push('```json');
      instructions.push(JSON.stringify(tool.function.parameters, null, 2));
      instructions.push('```');
      instructions.push('');
    });
  }

  // Add usage examples
  instructions.push('---', '');
  instructions.push('## 使用例 (Usage Examples)', '');
  instructions.push('### ファイルを読む (Read a file):');
  instructions.push('```');
  instructions.push('Tool: read_file');
  instructions.push('Parameters: { "path": "src/App.tsx" }');
  instructions.push('```');
  instructions.push('');
  instructions.push('### ファイルに書き込む (Write to a file):');
  instructions.push('```');
  instructions.push('Tool: write_file');
  instructions.push('Parameters: { "path": "README.md", "content": "# My Project\\n\\nDescription here" }');
  instructions.push('```');
  instructions.push('');
  instructions.push('### ディレクトリの内容を一覧表示 (List directory contents):');
  instructions.push('```');
  instructions.push('Tool: list_directory');
  instructions.push('Parameters: { "path": "src", "recursive": false }');
  instructions.push('```');
  instructions.push('');

  return instructions.join('\n');
}
