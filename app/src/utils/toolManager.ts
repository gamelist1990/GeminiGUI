/**
 * Tool Manager
 * 
 * Manages Python tools from public/tools directory:
 * - Loads tool definitions from Python files
 * - Copies tools to temporary workspace directories
 * - Generates toolUsage.json for AI consumption
 * - Executes tools via shell
 */

import { mkdir, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import type { ToolDefinition, ToolUsage, ToolExecutionResult } from '../types';

/**
 * Parse Python tool file to extract register() definition
 * 
 * Looks for patterns like:
 * ```python
 * def register():
 *     return {
 *         'name': 'calculator',
 *         'docs': '...',
 *         ...
 *     }
 * ```
 */
async function parseToolDefinition(pythonFile: string, content: string): Promise<ToolDefinition | null> {
  try {
    // Improved regex to handle multi-line Python dictionaries
    // Matches: def register(): return { ... }
    const registerMatch = content.match(/def\s+register\s*\(\s*\)\s*:[\s\S]*?return\s*\{([\s\S]*?)\n\s*\}/m);
    if (!registerMatch) {
      console.warn(`No register() function found in ${pythonFile}`);
      return null;
    }

    // Extract the dictionary content
    const dictContent = registerMatch[1];
    
    // Parse individual fields with support for multi-line strings
    const nameMatch = dictContent.match(/['"]name['"]\s*:\s*['"]([^'"]+)['"]/);
    const docsMatch = dictContent.match(/['"]docs['"]\s*:\s*['"]+([\s\S]*?)['"](?=\s*,|\s*})/m);
    const usageMatch = dictContent.match(/['"]usage['"]\s*:\s*['"]+([\s\S]*?)['"](?=\s*,|\s*})/m);
    
    if (!nameMatch) {
      console.warn(`No 'name' field found in ${pythonFile}`);
      return null;
    }

    // For MVP, use simplified schema
    return {
      name: nameMatch[1],
      docs: docsMatch ? docsMatch[1].replace(/\\n/g, '\n') : 'No documentation available',
      usage: usageMatch ? usageMatch[1].replace(/\\n/g, '\n') : 'No usage information',
      parameters: [], // TODO: parse from Python docstring or explicit dict
      responseSchema: {
        type: 'object',
        description: 'Tool execution result'
      },
      pythonFile,
      version: '1.0.0'
    };
  } catch (error) {
    console.error(`Error parsing tool definition from ${pythonFile}:`, error);
    return null;
  }
}


/**
 * Load all tool definitions from public/tools/
 * 
 * Uses fetch() to access bundled resources, similar to i18n.ts
 * 
 * @returns Array of tool definitions
 */
export async function loadToolsFromPublic(): Promise<ToolDefinition[]> {
  try {
    // List of known tool files (can be dynamically generated in build process)
    const toolFiles = [
      'file_operations.py',
      'directory_operations.py'
    ];

    console.info('[Tools] Loading tools from public/tools using fetch()');

    // Parse each tool definition
    const tools: ToolDefinition[] = [];
    for (const fileName of toolFiles) {
      try {
        const response = await fetch(`/tools/${fileName}`);
        if (!response.ok) {
          console.warn(`[Tools] Could not fetch ${fileName}: ${response.status}`);
          continue;
        }

        const content = await response.text();
        const toolDef = await parseToolDefinition(fileName, content);
        
        if (toolDef) {
          tools.push(toolDef);
          console.info(`[Tools] Loaded tool: ${toolDef.name} from ${fileName}`);
        }
      } catch (error) {
        console.warn(`[Tools] Error loading ${fileName}:`, error);
      }
    }

    if (tools.length === 0) {
      console.info('[Tools] No tools loaded from public/tools/');
    }

    return tools;
  } catch (error) {
    console.error('[Tools] Error loading tools from public/tools:', error);
    return [];
  }
}

/**
 * Copy tools to temporary workspace directory using fetch()
 * 
 * @param workspaceId - Current workspace ID
 * @param sessionId - Current chat session ID
 * @param tools - Tool definitions to copy
 * @param workspacePath - Path to workspace (for creating temp inside workspace)
 * @returns Path to the temporary tools directory
 */
export async function copyToolsToTemp(
  workspaceId: string,
  sessionId: string,
  tools: ToolDefinition[],
  workspacePath: string
): Promise<string> {
  try {
    // Create temp directory inside workspace
    const tempDir = `${workspacePath}\\temp\\GeminiTemp_${workspaceId}_${sessionId}`;
    const toolsDir = `${tempDir}\\tools`;
    
    // Ensure directory exists
    const tempExists = await exists(tempDir);
    if (!tempExists) {
      await mkdir(tempDir, { recursive: true });
    }

    const toolsDirExists = await exists(toolsDir);
    if (!toolsDirExists) {
      await mkdir(toolsDir, { recursive: true });
    }

    // Fetch and write each tool file
    for (const tool of tools) {
      try {
        const response = await fetch(`/tools/${tool.pythonFile}`);
        if (!response.ok) {
          console.warn(`[Tools] Could not fetch ${tool.pythonFile}: ${response.status}`);
          continue;
        }
        
        const content = await response.text();
        const destPath = `${toolsDir}\\${tool.pythonFile}`;
        
        await writeTextFile(destPath, content);
        console.info(`[Tools] Copied tool ${tool.name} to ${destPath}`);
      } catch (error) {
        console.warn(`[Tools] Error copying ${tool.pythonFile}:`, error);
      }
    }

    return tempDir;
  } catch (error) {
    console.error('[Tools] Error copying tools to temp:', error);
    throw error;
  }
}

/**
 * Generate toolUsage.json for AI consumption
 * 
 * @param tools - Tool definitions
 * @param workspaceId - Current workspace ID
 * @param sessionId - Current session ID
 * @param destPath - Where to write the JSON file
 */
export async function generateToolUsageJson(
  tools: ToolDefinition[],
  workspaceId: string,
  sessionId: string,
  destPath: string,
  workspacePath: string
): Promise<void> {
  const toolUsage: ToolUsage = {
    tools: tools.map(tool => ({
      ...tool,
      // Add execution instructions for AI
      executionInstructions: `To use this tool:
1. Read the 'usage' field for detailed parameter information
2. Prepare parameters as a JSON object matching the expected schema
3. Execute: python temp/GeminiTemp_${workspaceId}_${sessionId}/tools/${tool.pythonFile} '<json_params>'
4. Parse the JSON output for results

Example:
python temp/GeminiTemp_${workspaceId}_${sessionId}/tools/${tool.pythonFile} '{"operation":"read","path":"README.md"}'`,
      tempPath: `temp/GeminiTemp_${workspaceId}_${sessionId}/tools/${tool.pythonFile}`
    })),
    generatedAt: new Date().toISOString(),
    workspaceId,
    sessionId,
    instructions: `# Tool Usage Instructions

This file contains ${tools.length} available tool(s) for file and directory operations.

## How to Use Tools:

1. **Read Tool Documentation**: Each tool has 'docs' and 'usage' fields explaining its capabilities
2. **Prepare Parameters**: Create a JSON object with the required parameters
3. **Execute Tool**: Run the Python script with parameters as a JSON string argument
4. **Parse Results**: Tool output is JSON with 'success', 'data', and optionally 'error' fields

## Available Tools:
${tools.map(tool => `- ${tool.name}: ${tool.docs}`).join('\n')}

## Important Notes:
- All file paths should be relative to the workspace root
- Tools validate parameters and return structured JSON responses
- Check 'success' field in response before using 'data'
- Error details are in 'error' field when 'success' is false

## Tool Locations:
Tools are copied to: temp/GeminiTemp_${workspaceId}_${sessionId}/tools/
Each tool is a standalone Python script that can be executed directly.`
  };

  const jsonContent = JSON.stringify(toolUsage, null, 2);
  const fullPath = `${workspacePath}\\${destPath.replace(/\//g, '\\')}`;
  await writeTextFile(fullPath, jsonContent);
  console.info(`[Tools] Generated toolUsage.json at ${fullPath} with ${tools.length} tool(s)`);
}

/**
 * Execute a tool with given parameters
 * 
 * @param pythonFile - Python file name to execute
 * @param params - Tool parameters
 * @param toolsDir - Directory containing the tool files
 * @returns Execution result
 */
export async function executeTool(
  pythonFile: string,
  params: Record<string, any>,
  toolsDir: string
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  try {
    const toolPath = `${toolsDir}/${pythonFile}`;

    // Execute Python script with parameters as JSON
    const paramsJson = JSON.stringify(params);
    const command = Command.create('python', [toolPath, paramsJson]);
    
    const output = await command.execute();

    const executionTime = Date.now() - startTime;

    if (output.code === 0) {
      // Parse JSON output from stdout
      try {
        const result = JSON.parse(output.stdout);
        return {
          success: true,
          output: result,
          executionTime
        };
      } catch (parseError) {
        // If not JSON, return raw stdout
        return {
          success: true,
          output: output.stdout,
          executionTime
        };
      }
    } else {
      return {
        success: false,
        error: output.stderr || `Process exited with code ${output.code}`,
        executionTime
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Setup tools for a chat session
 * 
 * Complete workflow:
 * 1. Load tools from public/tools/
 * 2. Filter by enabled tools from settings
 * 3. Copy to temp workspace directory
 * 4. Generate toolUsage.json
 * 
 * @param workspaceId - Current workspace ID
 * @param sessionId - Current session ID
 * @param enabledTools - Optional array of enabled tool names from settings
 * @returns Object with tools array and temp directory path
 */
export async function setupToolsForSession(
  workspaceId: string,
  sessionId: string,
  enabledTools?: string[],
  workspacePath?: string
): Promise<{ tools: ToolDefinition[]; tempDir: string; toolUsageJsonPath: string }> {
  try {
    // Require workspace path
    if (!workspacePath) {
      throw new Error('workspacePath is required for setupToolsForSession');
    }

    // 1. Load tools
    let tools = await loadToolsFromPublic();
    
    if (tools.length === 0) {
      console.info('No tools to setup for session');
      return { tools: [], tempDir: '', toolUsageJsonPath: '' };
    }

    // 2. Add "Origin" prefix to tool names for clarity
    tools = tools.map(tool => ({
      ...tool,
      name: `OriginTool_${tool.name}`,
      docs: `[Origin] ${tool.docs}`
    }));

    // 3. Filter by enabled tools (if specified)
    if (enabledTools && enabledTools.length > 0) {
      const beforeCount = tools.length;
      // Match with or without OriginTool_ prefix
      tools = tools.filter(tool => 
        enabledTools.includes(tool.name) || 
        enabledTools.includes(tool.name.replace('OriginTool_', ''))
      );
      console.info(`[Tools] Filtered tools: ${beforeCount} → ${tools.length} (enabled: ${enabledTools.join(', ')})`);
      
      if (tools.length === 0) {
        console.info('[Tools] No enabled tools for session');
        return { tools: [], tempDir: '', toolUsageJsonPath: '' };
      }
    } else {
      console.info('[Tools] No tool filter specified, using all available tools');
    }

    // 4. Copy to temp (inside workspace)
    const tempDir = await copyToolsToTemp(workspaceId, sessionId, tools, workspacePath);

    // 5. Generate toolUsage.json (relative path inside workspace)
    const toolUsageJsonPath = `temp/GeminiTemp_${workspaceId}_${sessionId}/toolUsage.json`;
    await generateToolUsageJson(tools, workspaceId, sessionId, toolUsageJsonPath, workspacePath);

    console.info(`Setup ${tools.length} tools for session ${sessionId}`);
    return { tools, tempDir, toolUsageJsonPath };
  } catch (error) {
    console.error('Error setting up tools for session:', error);
    throw error;
  }
}
