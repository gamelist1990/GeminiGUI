import { readDir } from '@tauri-apps/plugin-fs';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * Scan workspace directory and return list of files and folders
 * @param workspacePath - The root path of the workspace
 * @param maxDepth - Maximum depth to scan (default: 2)
 * @returns Array of FileItem objects
 */
export async function scanWorkspace(
  workspacePath: string,
  maxDepth: number = 2
): Promise<FileItem[]> {
  const items: FileItem[] = [];
  const ignoreDirs = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'target',
    '.vscode',
    '.idea',
    '__pycache__',
    '.cache',
  ];

  async function scan(path: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await readDir(path);

      for (const entry of entries) {
        const fullPath = `${path}/${entry.name}`;
        
        // Skip ignored directories
        if (entry.isDirectory && ignoreDirs.includes(entry.name)) {
          continue;
        }

        items.push({
          name: entry.name,
          path: fullPath.replace(workspacePath, '').replace(/^\//, ''),
          isDirectory: entry.isDirectory,
        });

        // Recursively scan subdirectories
        if (entry.isDirectory) {
          await scan(fullPath, currentDepth + 1);
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory: ${path}`, error);
    }
  }

  await scan(workspacePath, 0);
  return items;
}

/**
 * Get suggestions for # autocomplete
 * @param items - Array of FileItem from scanWorkspace
 * @returns Array of suggestion strings for autocomplete
 */
export function getSuggestions(items: FileItem[]): string[] {
  const suggestions: string[] = ['#codebase']; // Always include 'codebase'

  // Add files with #file: prefix - include full path
  items.forEach((item) => {
    if (!item.isDirectory) {
      suggestions.push(`#file:${item.path}`);
    }
  });

  // Add directories with #folder: prefix - include full path
  items.forEach((item) => {
    if (item.isDirectory) {
      suggestions.push(`#folder:${item.path}`);
    }
  });

  return suggestions;
}

/**
 * Parse user input to extract includes for Gemini CLI
 * @param input - User input string
 * @param workspaceItems - Array of FileItem from scanWorkspace (to verify if item is directory)
 * @returns Object with includes array and directories array
 */
export function parseIncludes(
  input: string,
  workspaceItems: FileItem[] = []
): {
  includes: string[];
  directories: string[];
} {
  const includes: string[] = [];
  const directories: string[] = [];
  
  // Create a map for quick lookup
  const itemMap = new Map<string, FileItem>();
  workspaceItems.forEach((item) => {
    itemMap.set(item.name, item);
    itemMap.set(item.path, item);
  });
  
  // Extract all #something patterns
  const matches = input.match(/#(\S+)/g);
  
  if (matches) {
    matches.forEach((match) => {
      const item = match.substring(1); // Remove #
      
      if (item === 'codebase') {
        includes.push('codebase');
      } else if (item.startsWith('file:')) {
        // #file:path/to/file.txt -> file:path/to/file.txt
        // Extract the path after 'file:'
        const filePath = item.substring(5); // Remove 'file:'
        includes.push(`file:${filePath}`);
      } else if (item.startsWith('folder:')) {
        // #folder:path/to/dirname -> path/to/dirname (goes to --include-directories)
        const folderPath = item.substring(7); // Remove 'folder:'
        directories.push(folderPath);
      } else {
        // Legacy support: Check if it's a directory in workspace
        const workspaceItem = itemMap.get(item);
        if (workspaceItem && workspaceItem.isDirectory) {
          directories.push(workspaceItem.path);
        } else if (workspaceItem && !workspaceItem.isDirectory) {
          // If it's a file, add as file:path
          includes.push(`file:${workspaceItem.path}`);
        } else {
          // If not found in workspace, treat as generic include
          includes.push(item);
        }
      }
    });
  }
  
  return { includes, directories };
}
