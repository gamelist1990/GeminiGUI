export interface Workspace {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  isFavorite: boolean;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  tokenUsage: number;
  createdAt: Date;
}

export interface GeminiStats {
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
    byName: Record<string, {
      count: number;
      success: number;
      fail: number;
      durationMs: number;
      decisions: {
        accept: number;
        reject: number;
        modify: number;
        auto_accept: number;
      };
    }>;
  };
  files: {
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
}

export interface ToolUsageStats {
  toolName: string;
  executionTime: number; // milliseconds
  success: boolean;
  timestamp: Date;
  parameters?: Record<string, any>;
  result?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokenUsage?: number; // Token count for this message
  stats?: GeminiStats;
  toolUsage?: ToolUsageStats[]; // OpenAI tool usage statistics
  hidden?: boolean;
}

export interface Settings {
  language: string;
  theme: 'light' | 'dark';
  approvalMode: 'default' | 'auto_edit' | 'yolo';
  model: 'default' | 'gemini-2.5-flash';
  responseMode: 'async' | 'stream'; // Response processing mode
  customApiKey?: string;
  maxMessagesBeforeCompact: number;
  geminiAuth?: boolean; // Gemini認証とCloud設定が完了しているか
  googleCloudProjectId?: string; // Google Cloud Project ID
  geminiPath?: string; // Path to gemini.ps1 script detected from npm -g
  // OpenAI API Support
  enableOpenAI?: boolean; // Enable OpenAI API support
  openAIApiKey?: string; // OpenAI API Key (can be placeholder like "xxx")
  openAIBaseURL?: string; // OpenAI Base URL (default: https://api.openai.com/v1)
  openAIModel?: string; // OpenAI Model (e.g., gpt-4, gpt-3.5-turbo)
  // Tool System
  enabledTools?: string[]; // List of enabled tool names (e.g., ['calculator', 'file_operations'])
  tools?: ToolConfig[]; // Tool configuration with enabled/disabled state
}

/** Tool configuration for persistence */
export interface ToolConfig {
  name: string; // Tool name (e.g., 'file_operations')
  enabled: boolean; // Whether the tool is enabled
  lastChecked?: string; // Last time this tool was verified to exist
}

export type Theme = 'light' | 'dark';
export type Language = 'ja_JP' | 'en_US';
export type ApprovalMode = 'default' | 'auto_edit' | 'yolo';
export type ResponseMode = 'async' | 'stream';

/**
 * Tool System Types
 * 
 * Tools are Python scripts that extend AI capabilities.
 * They are defined in public/tools/ and registered at runtime.
 */

/** Tool parameter definition */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  default?: any;
}

/** Tool response schema */
export interface ToolResponseSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  properties?: Record<string, ToolResponseSchema>;
}

/** Tool definition metadata */
export interface ToolDefinition {
  /** Unique tool identifier (e.g., 'calculator', 'weather') */
  name: string;
  /** Human-readable description of what the tool does */
  docs: string;
  /** Detailed usage instructions for AI */
  usage: string;
  /** Example usage */
  examples?: string[];
  /** Input parameters */
  parameters: ToolParameter[];
  /** Response schema */
  responseSchema: ToolResponseSchema;
  /** Python file path (relative to public/tools/) */
  pythonFile: string;
  /** Tool version */
  version?: string;
  /** Execution instructions for AI (added at runtime) */
  executionInstructions?: string;
  /** Temp path where tool is copied (added at runtime) */
  tempPath?: string;
}

/** toolUsage.json schema - passed to AI for tool understanding */
export interface ToolUsage {
  /** Available tools */
  tools: ToolDefinition[];
  /** Timestamp when this was generated */
  generatedAt: string;
  /** Workspace/session ID */
  workspaceId?: string;
  sessionId?: string;
  /** General instructions for using tools (added at generation time) */
  instructions?: string;
}

/** Tool execution result */
export interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
}

/** Tool registration interface (for Python tools) */
export interface ToolRegister {
  (definition: Omit<ToolDefinition, 'pythonFile'>): {
    /** Execute the tool with given parameters */
    execute: (params: Record<string, any>) => Promise<ToolExecutionResult>;
  };
}
