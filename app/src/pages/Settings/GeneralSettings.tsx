import React from 'react';
import { Settings } from '../../types';
import { t } from '../../utils/i18n';
import './GeneralSettings.css';

interface GeneralSettingsProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, onUpdateSettings }) => {
  return (
    <div className="settings-category">
      <h2>{t('settings.categories.general.title')}</h2>
      
      {/* Language Setting */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.language')}</h3>
        </div>
        <div className="card-content">
          <select 
            value={settings.language} 
            onChange={(e) => onUpdateSettings({ language: e.target.value })}
            className="setting-select"
          >
            <option value="en_US">English</option>
            <option value="ja_JP">日本語</option>
          </select>
        </div>
      </div>

      {/* Theme Setting */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.theme')}</h3>
        </div>
        <div className="card-content">
          <div className="radio-group">
            <label className="radio-label">
              <input 
                type="radio" 
                name="theme" 
                value="light" 
                checked={settings.theme === 'light'} 
                onChange={() => onUpdateSettings({ theme: 'light' })}
              />
              <span>{t('settings.light')}</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="theme" 
                value="dark" 
                checked={settings.theme === 'dark'} 
                onChange={() => onUpdateSettings({ theme: 'dark' })}
              />
              <span>{t('settings.dark')}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
