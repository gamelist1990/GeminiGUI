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
 * All available modern tools
 */
export const MODERN_TOOLS: ModernToolDefinition[] = [
  ...FILE_OPERATION_TOOLS,
  ...DIRECTORY_OPERATION_TOOLS,
  ...SEARCH_TOOLS
];

/**
 * Tool categories for UI organization
 */
export const TOOL_CATEGORIES = {
  FILE_OPERATIONS: 'File Operations',
  DIRECTORY_OPERATIONS: 'Directory Operations',
  SEARCH: 'Search & Discovery'
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
    default:
      return [];
  }
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return MODERN_TOOLS.map(tool => tool.function.name);
}
