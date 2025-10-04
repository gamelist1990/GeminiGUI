import React, { useState } from 'react';
import { Settings, ToolConfig } from '../../types';
import { t } from '../../utils/i18n';
import ToolSettingsPanel from '../../components/ToolSettingsPanel';
import './ToolsSettings.css';

interface ToolsSettingsProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
}

export const ToolsSettings: React.FC<ToolsSettingsProps> = ({ settings, onUpdateSettings }) => {
  const [showToolPanel, setShowToolPanel] = useState(false);

  return (
    <div className="settings-category">
      <h2>{t('settings.categories.tools.title')}</h2>

      {/* Approval Mode */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.approvalMode')}</h3>
        </div>
        <div className="card-content">
          <div className="radio-group">
            <label className="radio-label">
              <input 
                type="radio" 
                name="approvalMode" 
                value="default" 
                checked={settings.approvalMode === 'default'} 
                onChange={() => onUpdateSettings({ approvalMode: 'default' })}
              />
              <span>{t('settings.defaultApproval')}</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="approvalMode" 
                value="auto_edit" 
                checked={settings.approvalMode === 'auto_edit'} 
                onChange={() => onUpdateSettings({ approvalMode: 'auto_edit' })}
              />
              <span>{t('settings.autoEditApproval')}</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="approvalMode" 
                value="yolo" 
                checked={settings.approvalMode === 'yolo'} 
                onChange={() => onUpdateSettings({ approvalMode: 'yolo' })}
              />
              <span>{t('settings.yoloApproval')}</span>
            </label>
          </div>
          <p className="setting-description">{t('settings.approvalDescription')}</p>
        </div>
      </div>

      {/* Tool Management */}
      <div className="setting-card">
        <div className="card-header">
          <h3>🔧 ツール管理</h3>
        </div>
        <div className="card-content">
          <button 
            onClick={() => setShowToolPanel(!showToolPanel)}
            className="setting-button"
          >
            {showToolPanel ? 'ツール設定を閉じる' : 'ツール設定を開く'}
          </button>
          {showToolPanel && (
            <div className="tool-panel-container">
              <ToolSettingsPanel 
                enabledTools={settings.enabledTools || []}
                tools={settings.tools || []}
                onUpdateEnabledTools={(tools: string[]) => onUpdateSettings({ enabledTools: tools })}
                onUpdateTools={(tools: ToolConfig[]) => onUpdateSettings({ tools })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
