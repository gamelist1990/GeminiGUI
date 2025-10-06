import React from 'react';
import { Settings } from '../../types';
import { t } from '../../utils/i18n';
import './AISettings.css';

interface AISettingsProps {
  settings: Settings;
  onUpdateSettings: (updates: Partial<Settings>) => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ settings, onUpdateSettings }) => {
  return (
    <div className="settings-category">
      <h2>{t('settings.categories.ai.title')}</h2>

      {/* Model Selection */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.modelSelection')}</h3>
        </div>
        <div className="card-content">
          <div className="radio-group">
            <label className="radio-label">
              <input 
                type="radio" 
                name="model" 
                value="default" 
                checked={settings.model === 'default'} 
                onChange={() => onUpdateSettings({ model: 'default' })}
              />
              <span>{t('settings.defaultModel')}</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="model" 
                value="gemini-2.5-flash" 
                checked={settings.model === 'gemini-2.5-flash'} 
                onChange={() => onUpdateSettings({ model: 'gemini-2.5-flash' })}
              />
              <span>{t('settings.flashModel')}</span>
            </label>
          </div>
          <p className="setting-description">{t('settings.flashDescription')}</p>
        </div>
      </div>

      {/* Custom API Key */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.customApiKey')}</h3>
        </div>
        <div className="card-content">
          <input 
            type="password" 
            value={settings.customApiKey || ''} 
            onChange={(e) => onUpdateSettings({ customApiKey: e.target.value })}
            placeholder={t('settings.apiKeyPlaceholder')}
            className="setting-input"
          />
          <p className="setting-description">{t('settings.apiKeyDescription')}</p>
          <p className="setting-description">{t('settings.apiKeyDefaultNote')}</p>
        </div>
      </div>

      {/* Response Mode */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.responseMode')}</h3>
        </div>
        <div className="card-content">
          <div className="radio-group">
            <label className="radio-label">
              <input 
                type="radio" 
                name="responseMode" 
                value="async" 
                checked={settings.responseMode === 'async'} 
                onChange={() => onUpdateSettings({ responseMode: 'async' })}
              />
              <span>{t('settings.asyncMode')}</span>
            </label>
            <label className={`radio-label ${!settings.enableOpenAI ? 'disabled' : ''}`}>
              <input 
                type="radio" 
                name="responseMode" 
                value="stream" 
                checked={settings.responseMode === 'stream'}
                onChange={() => onUpdateSettings({ responseMode: 'stream' })}
                disabled={!settings.enableOpenAI}
              />
              <span>{t('settings.streamMode')}</span>
            </label>
          </div>
          <p className="setting-description">{t('settings.responseModeDescription')}</p>
          {!settings.enableOpenAI && (
            <p className="setting-description warning">{t('settings.streamNotAvailable')}</p>
          )}
          {settings.enableOpenAI && (
            <p className="setting-description highlight">{t('settings.streamAvailableWithOpenAI')}</p>
          )}
        </div>
      </div>

      {/* OpenAI API Support */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.enableOpenAI')}</h3>
        </div>
        <div className="card-content">
          <div className="toggle-group">
            <label className="toggle-label">
              <input 
                type="checkbox" 
                checked={settings.enableOpenAI || false}
                onChange={(e) => onUpdateSettings({ enableOpenAI: e.target.checked })}
              />
              <span>{settings.enableOpenAI ? t('settings.enabled') : t('settings.disabled')}</span>
            </label>
          </div>
          <p className="setting-description">{t('settings.openAIDescription')}</p>

          {settings.enableOpenAI && (
            <>
              {/* OpenAI API Key */}
              <div className="sub-setting">
                <label>{t('settings.openAIApiKey')}</label>
                <input 
                  type="password" 
                  value={settings.openAIApiKey || ''} 
                  onChange={(e) => onUpdateSettings({ openAIApiKey: e.target.value })}
                  placeholder={t('settings.openAIApiKeyPlaceholder')}
                  className="setting-input"
                />
                <p className="setting-description">{t('settings.openAIApiKeyDescription')}</p>
              </div>

              {/* OpenAI Base URL */}
              <div className="sub-setting">
                <label>{t('settings.openAIBaseURL')}</label>
                <input 
                  type="text" 
                  value={settings.openAIBaseURL || ''} 
                  onChange={(e) => onUpdateSettings({ openAIBaseURL: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="setting-input"
                />
                <p className="setting-description">{t('settings.openAIBaseURLDescription')}</p>
              </div>

              {/* OpenAI Model */}
              <div className="sub-setting">
                <label>{t('settings.openAIModel')}</label>
                <input 
                  type="text" 
                  value={settings.openAIModel || ''} 
                  onChange={(e) => onUpdateSettings({ openAIModel: e.target.value })}
                  placeholder="gpt-3.5-turbo"
                  className="setting-input"
                />
                <p className="setting-description">{t('settings.openAIModelDescription')}</p>
              </div>

              <p className="setting-description highlight">{t('settings.openAIStreamDescription')}</p>
            </>
          )}
        </div>
      </div>

      {/* Conversation Cleanup */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.conversationCleanup')}</h3>
        </div>
        <div className="card-content">
          <div className="input-with-suffix">
            <input 
              type="number" 
              value={settings.maxMessagesBeforeCompact || 50} 
              onChange={(e) => onUpdateSettings({ maxMessagesBeforeCompact: parseInt(e.target.value) || 50 })}
              min="10"
              max="200"
              className="setting-input-number"
            />
            <span className="input-suffix">{t('settings.messages')}</span>
          </div>
          <p className="setting-description">{t('settings.cleanupDescription')}</p>
          <p className="setting-description">{t('settings.cleanupReason')}</p>
        </div>
      </div>

      {/* Agent Max Continuations */}
      <div className="setting-card">
        <div className="card-header">
          <h3>{t('settings.maxContinuations')}</h3>
        </div>
        <div className="card-content">
          <div className="input-with-suffix">
            <input 
              type="number" 
              value={settings.maxContinuations || 15} 
              onChange={(e) => onUpdateSettings({ maxContinuations: parseInt(e.target.value) || 15 })}
              min="5"
              max="30"
              className="setting-input-number"
            />
            <span className="input-suffix">{t('settings.attempts')}</span>
          </div>
          <p className="setting-description">{t('settings.maxContinuationsDescription')}</p>
          <p className="setting-description highlight">{t('settings.maxContinuationsNote')}</p>
        </div>
      </div>
    </div>
  );
};
