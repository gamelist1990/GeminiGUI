import { useState, useEffect } from 'react';
import { ToolConfig } from '../types';
import { 
  MODERN_TOOLS, 
  FILE_OPERATION_TOOLS, 
  DIRECTORY_OPERATION_TOOLS, 
  SEARCH_TOOLS,
  getAllToolNames 
} from '../AITool/modernTools';
import '../pages/Settings.css';

interface ModernToolSettingsPanelProps {
  enabledTools: string[];
  tools: ToolConfig[];
  onUpdateEnabledTools: (enabledTools: string[]) => void;
  onUpdateTools: (tools: ToolConfig[]) => void;
}

export default function ModernToolSettingsPanel({ 
  enabledTools, 
  tools,
  onUpdateEnabledTools,
  onUpdateTools 
}: ModernToolSettingsPanelProps) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Initialize tools config on first load
    if (!initialized) {
      syncToolsConfig();
      setInitialized(true);
    }
  }, [initialized]);

  /**
   * Sync tools config with modern tools
   * - Add new tools with enabled=true by default
   * - Preserve existing tool states
   */
  const syncToolsConfig = () => {
    const existingToolsMap = new Map(tools.map(t => [t.name, t]));
    const allToolNames = getAllToolNames();
    
    const syncedTools: ToolConfig[] = allToolNames.map(toolName => {
      const existing = existingToolsMap.get(toolName);
      if (existing) {
        // Preserve existing state
        return {
          ...existing,
          lastChecked: new Date().toISOString()
        };
      } else {
        // New tool - check if it was previously enabled
        const wasEnabled = enabledTools.includes(toolName);
        return {
          name: toolName,
          enabled: wasEnabled !== undefined ? wasEnabled : true, // Default to enabled
          lastChecked: new Date().toISOString()
        };
      }
    });
    
    // Update tools config
    onUpdateTools(syncedTools);
    
    // Update enabledTools
    const newEnabledTools = syncedTools
      .filter(t => t.enabled)
      .map(t => t.name);
    onUpdateEnabledTools(newEnabledTools);
  };

  const handleToggleTool = (toolName: string) => {
    // Update tools config
    const updatedTools = tools.map(tool => 
      tool.name === toolName 
        ? { ...tool, enabled: !tool.enabled, lastChecked: new Date().toISOString() }
        : tool
    );
    
    // If tool doesn't exist in config yet, add it
    if (!tools.find(t => t.name === toolName)) {
      updatedTools.push({
        name: toolName,
        enabled: true,
        lastChecked: new Date().toISOString()
      });
    }
    
    onUpdateTools(updatedTools);
    
    // Update enabledTools
    const newEnabledTools = updatedTools
      .filter(t => t.enabled)
      .map(t => t.name);
    onUpdateEnabledTools(newEnabledTools);
  };

  const handleToggleAll = (enabled: boolean) => {
    const updatedTools = getAllToolNames().map(toolName => ({
      name: toolName,
      enabled,
      lastChecked: new Date().toISOString()
    }));
    
    onUpdateTools(updatedTools);
    onUpdateEnabledTools(enabled ? getAllToolNames() : []);
  };

  const isToolEnabled = (toolName: string): boolean => {
    const tool = tools.find(t => t.name === toolName);
    return tool ? tool.enabled : true; // Default to enabled if not in config
  };

  const getToolDescription = (toolName: string): string => {
    const tool = MODERN_TOOLS.find(t => t.function.name === toolName);
    return tool ? tool.function.description : '';
  };

  const enabledCount = getAllToolNames().filter(isToolEnabled).length;
  const totalCount = MODERN_TOOLS.length;

  return (
    <div className="tools-panel">
      <div className="tools-header">
        <div className="tools-summary">
          <span className="tools-count">
            {enabledCount} / {totalCount} tools enabled
          </span>
        </div>
        <div className="tools-actions">
          <button 
            className="tool-action-btn secondary"
            onClick={() => handleToggleAll(true)}
            disabled={enabledCount === totalCount}
          >
            Enable All
          </button>
          <button 
            className="tool-action-btn secondary"
            onClick={() => handleToggleAll(false)}
            disabled={enabledCount === 0}
          >
            Disable All
          </button>
        </div>
      </div>

      {/* File Operations */}
      <div className="tool-category">
        <h3 className="category-title">📄 File Operations</h3>
        <div className="tools-list">
          {FILE_OPERATION_TOOLS.map(tool => (
            <div key={tool.function.name} className="tool-item">
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool.function.name)}
                  onChange={() => handleToggleTool(tool.function.name)}
                />
                <div className="tool-info">
                  <span className="tool-name">{tool.function.name}</span>
                  <span className="tool-description">{tool.function.description}</span>
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Directory Operations */}
      <div className="tool-category">
        <h3 className="category-title">📁 Directory Operations</h3>
        <div className="tools-list">
          {DIRECTORY_OPERATION_TOOLS.map(tool => (
            <div key={tool.function.name} className="tool-item">
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool.function.name)}
                  onChange={() => handleToggleTool(tool.function.name)}
                />
                <div className="tool-info">
                  <span className="tool-name">{tool.function.name}</span>
                  <span className="tool-description">{tool.function.description}</span>
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Search Tools */}
      <div className="tool-category">
        <h3 className="category-title">🔍 Search & Discovery</h3>
        <div className="tools-list">
          {SEARCH_TOOLS.map(tool => (
            <div key={tool.function.name} className="tool-item">
              <label className="tool-checkbox">
                <input
                  type="checkbox"
                  checked={isToolEnabled(tool.function.name)}
                  onChange={() => handleToggleTool(tool.function.name)}
                />
                <div className="tool-info">
                  <span className="tool-name">{tool.function.name}</span>
                  <span className="tool-description">{tool.function.description}</span>
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="tools-info">
        <p className="info-text">
          💡 Modern tools are executed securely via Rust/Tauri commands. No Python dependencies required.
        </p>
        <p className="info-text">
          🔧 Tools are automatically available when enabled. Changes take effect immediately.
        </p>
      </div>
    </div>
  );
}
