import { useState, useEffect } from 'react';
import { ToolDefinition, ToolConfig } from '../types';
import { loadToolsFromPublic } from '../utils/toolManager';
import '../pages/Settings.css';

interface ToolSettingsPanelProps {
  enabledTools: string[];
  tools: ToolConfig[];
  onUpdateEnabledTools: (enabledTools: string[]) => void;
  onUpdateTools: (tools: ToolConfig[]) => void;
}

export default function ToolSettingsPanel({ 
  enabledTools, 
  tools,
  onUpdateEnabledTools,
  onUpdateTools 
}: ToolSettingsPanelProps) {
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableTools();
  }, []);

  const loadAvailableTools = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedTools = await loadToolsFromPublic();
      setAvailableTools(loadedTools);
      
      // Sync tools config with available tools
      syncToolsConfig(loadedTools);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
      console.error('Error loading tools:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sync tools config with available tools
   * - Add new tools with enabled=false
   * - Remove tools that no longer exist
   * - Preserve existing tool states
   */
  const syncToolsConfig = (loadedTools: ToolDefinition[]) => {
    const existingToolsMap = new Map(tools.map(t => [t.name, t]));
    
    const syncedTools: ToolConfig[] = loadedTools.map(tool => {
      const existing = existingToolsMap.get(tool.name);
      if (existing) {
        // Preserve existing state
        return {
          ...existing,
          lastChecked: new Date().toISOString()
        };
      } else {
        // New tool - check if it was previously enabled (for backward compatibility with enabledTools)
        const wasEnabled = enabledTools.includes(tool.name);
        return {
          name: tool.name,
          enabled: wasEnabled,
          lastChecked: new Date().toISOString()
        };
      }
    });
    
    // Update tools config
    onUpdateTools(syncedTools);
    
    // Update enabledTools for backward compatibility
    const newEnabledTools = syncedTools
      .filter(t => t.enabled)
      .map(t => t.name);
    onUpdateEnabledTools(newEnabledTools);
  };

  const handleToggleTool = (toolName: string) => {
    // Update tools config
    const updatedTools = tools.map(tool => 
      tool.name === toolName 
        ? { ...tool, enabled: !tool.enabled }
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
    
    // Update enabledTools for backward compatibility
    const newEnabledTools = enabledTools.includes(toolName)
      ? enabledTools.filter(name => name !== toolName)
      : [...enabledTools, toolName];
    onUpdateEnabledTools(newEnabledTools);
  };

  const handleEnableAll = () => {
    const allToolNames = availableTools.map(tool => tool.name);
    const updatedTools = availableTools.map(tool => ({
      name: tool.name,
      enabled: true,
      lastChecked: new Date().toISOString()
    }));
    
    onUpdateTools(updatedTools);
    onUpdateEnabledTools(allToolNames);
  };

  const handleDisableAll = () => {
    const updatedTools = tools.map(tool => ({
      ...tool,
      enabled: false
    }));
    
    onUpdateTools(updatedTools);
    onUpdateEnabledTools([]);
  };

  if (loading) {
    return (
      <div className="tools-panel">
        <div className="tools-loading">
          <div className="spinner"></div>
          <p>Loading available tools...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tools-panel">
        <div className="tools-error">
          <p>⚠️ Error loading tools: {error}</p>
          <button onClick={loadAvailableTools} className="btn-retry">Retry</button>
        </div>
      </div>
    );
  }

  if (availableTools.length === 0) {
    return (
      <div className="tools-panel">
        <div className="tools-empty">
          <p>📦 No tools found in <code>public/tools/</code></p>
          <p className="hint">Add Python tool files to enable AI capabilities</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tools-panel">
      <div className="tools-header">
        <h3>🛠️ Available Tools ({availableTools.length})</h3>
        <div className="tools-actions">
          <button onClick={handleEnableAll} className="btn-secondary">Enable All</button>
          <button onClick={handleDisableAll} className="btn-secondary">Disable All</button>
        </div>
      </div>
      
      <p className="tools-description">
        Tools extend AI capabilities with custom functionality. Enabled tools will be available during chat sessions.
      </p>

      <div className="tools-grid">
        {availableTools.map((tool) => {
          const isEnabled = enabledTools.includes(tool.name);
          
          return (
            <div 
              key={tool.name} 
              className={`tool-card ${isEnabled ? 'tool-enabled' : 'tool-disabled'}`}
              onClick={() => handleToggleTool(tool.name)}
            >
              <div className="tool-card-header">
                <div className="tool-icon">
                  {isEnabled ? '✅' : '⚪'}
                </div>
                <div className="tool-info">
                  <h4 className="tool-name">{tool.name}</h4>
                  {tool.version && (
                    <span className="tool-version">v{tool.version}</span>
                  )}
                </div>
                <label className="tool-toggle">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleTool(tool.name);
                    }}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <p className="tool-docs">{tool.docs}</p>

              {tool.parameters && tool.parameters.length > 0 && (
                <div className="tool-params">
                  <span className="params-label">Parameters:</span>
                  {tool.parameters.slice(0, 3).map(param => (
                    <span key={param.name} className="param-badge">
                      {param.name}
                    </span>
                  ))}
                  {tool.parameters.length > 3 && (
                    <span className="param-badge">+{tool.parameters.length - 3} more</span>
                  )}
                </div>
              )}

              <div className="tool-card-footer">
                <span className="tool-file">📄 {tool.pythonFile}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tools-summary">
        <p>
          <strong>{enabledTools.length}</strong> of <strong>{availableTools.length}</strong> tools enabled
        </p>
      </div>
    </div>
  );
}
