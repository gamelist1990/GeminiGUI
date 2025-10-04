import React from 'react';
import { Settings } from '../../types';
import { t } from '../../utils/i18n';
import './AppearanceSettings.css';

interface AppearanceSettingsProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ settings, onUpdateSettings }) => {
  return (
    <div className="settings-category">
      <h2>{t('settings.categories.appearance.title')}</h2>
      
      {/* Theme Setting (duplicated from General for convenience) */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.theme')}</h3>
        </div>
        <div className="card-content">
          <div className="radio-group">
            <label className="radio-label">
              <input 
                type="radio" 
                name="theme-appearance" 
                value="light" 
                checked={settings.theme === 'light'} 
                onChange={() => onUpdateSettings({ theme: 'light' })}
              />
              <span>{t('settings.light')}</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="theme-appearance" 
                value="dark" 
                checked={settings.theme === 'dark'} 
                onChange={() => onUpdateSettings({ theme: 'dark' })}
              />
              <span>{t('settings.dark')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Placeholder for future appearance settings */}
      <div className="setting-card">
        <div className="card-header">
          <h3>🎨 今後追加予定の外観設定</h3>
        </div>
        <div className="card-content">
          <p className="setting-description">
            フォントサイズ、カラーテーマのカスタマイズ、レイアウト設定などが将来追加される予定です。
          </p>
        </div>
      </div>
    </div>
  );
};
