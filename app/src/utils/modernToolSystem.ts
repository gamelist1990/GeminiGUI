/**
 * Modern AI Tool System (Legacy Compatibility Layer)
 * 
 * This file re-exports the new modular tool system for backward compatibility.
 * New code should import directly from src/AITool/*
 * 
 * @deprecated Use imports from ../AITool/modernTools and ../AITool/toolExecutor instead
 */

// Type exports from modernTools
export type { 
  ModernToolDefinition
} from '../AITool/modernTools';

// Type exports from toolExecutor
export type {
  ToolExecutionResult,
  ToolExecutionStats
} from '../AITool/toolExecutor';

// Constant exports
export { 
  MODERN_TOOLS,
  FILE_OPERATION_TOOLS,
  DIRECTORY_OPERATION_TOOLS,
  SEARCH_TOOLS,
  TOOL_CATEGORIES,
  getToolsByCategory,
  getAllToolNames
} from '../AITool/modernTools';

// Function exports
export {
  getEnabledModernTools,
  executeModernTool,
  generateModernToolDefinitions,
  writeModernToolsJson,
  getToolExecutionStats,
  resetToolExecutionStats
} from '../AITool/toolExecutor';
