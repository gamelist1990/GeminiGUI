/**
 * Modern Tool Definitions
 * 
 * JSON Schema-based tool definitions following OpenAI/Anthropic/Gemini standards
 * Separated from execution logic for better maintainability
 */

export interface ModernToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        items?: any;
      }>;
      required: string[];
    };
  };
}

/**
 * Agent-Specific Tools
 * Tools that are only available in Agent mode for autonomous operation
 */
export const AGENT_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'update_task_progress',
      description: 'Update the task plan message with current progress. Use this to show users what you are working on and what has been completed. The updated message will replace the original task plan in the UI.',
      parameters: {
        type: 'object',
        properties: {
          markdown_content: {
            type: 'string',
            description: 'Updated task plan in markdown format with checkboxes. Use - [ ] for pending tasks, - [x] for completed tasks. Include progress summary at the top.'
          }
        },
        required: ['markdown_content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_user_message',
      description: 'Send a message to the user to provide updates, ask questions, or report completion. This creates a visible message in the chat that the user can see.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to send to the user. Use clear, concise language. Can include markdown formatting.'
          },
          message_type: {
            type: 'string',
            description: 'Type of message: "info" for general updates, "success" for completion, "warning" for issues, "error" for failures',
            enum: ['info', 'success', 'warning', 'error']
          }
        },
        required: ['message', 'message_type']
      }
    }
  }
];

/**
 * File Operations Tools
 */
export const FILE_OPERATION_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the workspace. Returns the full file content as a string.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative or absolute path to the file to read. For workspace files, use relative paths like "src/main.ts".'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the workspace. Creates the file and parent directories if they do not exist. Overwrites existing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative or absolute path to the file to write. Parent directories will be created automatically.'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file. Use proper line endings for the target platform.'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory from the workspace. For directories, removes all contents recursively.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative or absolute path to the file or directory to delete. Use with caution.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Move or rename a file in the workspace. Can be used to organize files or change file names.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Source path of the file to move'
          },
          destination: {
            type: 'string',
            description: 'Destination path for the file. Parent directories will be created if needed.'
          }
        },
        required: ['source', 'destination']
      }
    }
  }
];

/**
 * Directory Operations Tools
 */
export const DIRECTORY_OPERATION_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List contents of a directory in the workspace. Returns file and directory names with type information.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative or absolute path to the directory to list. Use "." for workspace root.'
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to list recursively including all subdirectories (default: false)'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory in the workspace. Creates parent directories automatically if they do not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative or absolute path to the directory to create. Parent directories will be created automatically.'
          }
        },
        required: ['path']
      }
    }
  }
];

/**
 * Search Tools
 */
export const SEARCH_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files in the workspace by glob pattern. Useful for finding files by extension or name pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to search for (e.g., "*.ts", "src/**/*.py", "**/*.json")'
          },
          path: {
            type: 'string',
            description: 'Directory to search in (default: workspace root). Searches recursively within this directory.'
          }
        },
        required: ['pattern']
      }
    }
  }
];

/**
 * Command Execution Tools
 */
export const COMMAND_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a PowerShell command in the workspace. Output is always UTF-8 encoded. Use for running scripts, checking system info, or executing CLI tools.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'PowerShell command to execute. Must be "powershell" or "powershell.exe".'
          },
          args: {
            type: 'array',
            description: 'Command arguments as an array. First element is typically the PowerShell script or command.',
            items: { type: 'string' }
          },
          working_dir: {
            type: 'string',
            description: 'Working directory for command execution (default: workspace root)'
          }
        },
        required: ['command', 'args']
      }
    }
  }
];

/**
 * File Checking Tools
 */
export const FILE_CHECK_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'file_check',
      description: 'Check a file for syntax errors, linting issues, and code quality problems. Supports TypeScript, JavaScript, JSON, TOML, Rust, and more. Returns validation results with errors and warnings.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to check. Can be relative or absolute.'
          }
        },
        required: ['path']
      }
    }
  }
];

/**
 * Diff Application Tools
 */
export const DIFF_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'apply_diff',
      description: 'Apply a unified diff patch to a file. Useful for making precise changes to code. The diff should be in standard unified diff format with @@ headers.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to apply the diff to'
          },
          diff_content: {
            type: 'string',
            description: 'Unified diff content with proper formatting (lines starting with +, -, or space, and @@ headers)'
          }
        },
        required: ['path', 'diff_content']
      }
    }
  }
];

/**
 * Network Operations Tools
 */
export const FETCH_TOOLS: ModernToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'fetch',
      description: 'Fetch content from a URL. Supports HTTP/HTTPS with customizable headers and timeout. Returns response body, status, and headers.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch (must be HTTP or HTTPS protocol)'
          },
          method: {
            type: 'string',
            description: 'HTTP method to use (GET, POST, PUT, DELETE, HEAD). Defaults to GET',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']
          },
          headers: {
            type: 'object',
            description: 'Optional HTTP headers as key-value pairs (e.g., {"Authorization": "Bearer token"})'
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in seconds (default: 30)'
          }
        },
        required: ['url']
      }
    }
  }
];

/**
 * All available modern tools (excluding agent-specific tools)
 */
export const MODERN_TOOLS: ModernToolDefinition[] = [
  ...FILE_OPERATION_TOOLS,
  ...DIRECTORY_OPERATION_TOOLS,
  ...SEARCH_TOOLS,
  ...COMMAND_TOOLS,
  ...FILE_CHECK_TOOLS,
  ...DIFF_TOOLS,
  ...FETCH_TOOLS
];

/**
 * Get all tools including agent-specific tools
 */
export function getAllTools(includeAgentTools: boolean = false): ModernToolDefinition[] {
  if (includeAgentTools) {
    return [...MODERN_TOOLS, ...AGENT_TOOLS];
  }
  return MODERN_TOOLS;
}

/**
 * Tool categories for UI organization
 */
export const TOOL_CATEGORIES = {
  FILE_OPERATIONS: 'File Operations',
  DIRECTORY_OPERATIONS: 'Directory Operations',
  SEARCH: 'Search & Discovery',
  COMMAND: 'Command Execution',
  FILE_CHECK: 'File Validation',
  DIFF: 'Diff & Patches',
  FETCH: 'Network & Web',
  AGENT: 'Agent Communication'
} as const;

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof TOOL_CATEGORIES): ModernToolDefinition[] {
  switch (category) {
    case 'FILE_OPERATIONS':
      return FILE_OPERATION_TOOLS;
    case 'DIRECTORY_OPERATIONS':
      return DIRECTORY_OPERATION_TOOLS;
    case 'SEARCH':
      return SEARCH_TOOLS;
    case 'COMMAND':
      return COMMAND_TOOLS;
    case 'FILE_CHECK':
      return FILE_CHECK_TOOLS;
    case 'DIFF':
      return DIFF_TOOLS;
    case 'FETCH':
      return FETCH_TOOLS;
    case 'AGENT':
      return AGENT_TOOLS;
    default:
      return [];
  }
}

/**
 * Get all tool names
 */
export function getAllToolNames(includeAgentTools: boolean = false): string[] {
  const tools = getAllTools(includeAgentTools);
  return tools.map(tool => tool.function.name);
}
