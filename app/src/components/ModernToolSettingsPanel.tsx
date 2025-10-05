import { useState, useEffect } from 'react';
import { ToolConfig } from '../types';
import { 
  MODERN_TOOLS, 
  FILE_OPERATION_TOOLS, 
  DIRECTORY_OPERATION_TOOLS, 
  SEARCH_TOOLS,
  COMMAND_TOOLS,
  FILE_CHECK_TOOLS,
  DIFF_TOOLS,
  FETCH_TOOLS,
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
        // New tool - default to enabled
        return {
          name: toolName,
          enabled: true, // デフォルトで有効化
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
    // Find the tool or create it
    const existingTool = tools.find(t => t.name === toolName);
    const newEnabledState = existingTool ? !existingTool.enabled : true;
    
    // Update tools config
    let updatedTools: ToolConfig[];
    if (existingTool) {
      updatedTools = tools.map(tool => 
        tool.name === toolName 
          ? { ...tool, enabled: newEnabledState, lastChecked: new Date().toISOString() }
          : tool
      );
    } else {
      updatedTools = [
        ...tools,
        {
          name: toolName,
          enabled: newEnabledState,
          lastChecked: new Date().toISOString()
        }
      ];
    }
    
    // Calculate new enabledTools
    const newEnabledTools = updatedTools
      .filter(t => t.enabled)
      .map(t => t.name);
    
    // Update both configs at once
    onUpdateTools(updatedTools);
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
    if (tool) {
      return tool.enabled;
    }
    // Fallback to enabledTools array if tool not in config
    return enabledTools.includes(toolName);
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

      {/* Command Execution */}
      <div className="tool-category">
        <h3 className="category-title">⚡ Command Execution</h3>
        <div className="tools-list">
          {COMMAND_TOOLS.map(tool => (
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

      {/* File Validation */}
      <div className="tool-category">
        <h3 className="category-title">✅ File Validation</h3>
        <div className="tools-list">
          {FILE_CHECK_TOOLS.map(tool => (
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

      {/* Diff & Patches */}
      <div className="tool-category">
        <h3 className="category-title">🔧 Diff & Patches</h3>
        <div className="tools-list">
          {DIFF_TOOLS.map(tool => (
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

      {/* Network & Web */}
      <div className="tool-category">
        <h3 className="category-title">🌐 Network & Web</h3>
        <div className="tools-list">
          {FETCH_TOOLS.map(tool => (
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
