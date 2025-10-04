import { useState, useEffect } from 'react';
import { Settings, Language } from '../types';
import { Config } from '../utils/configAPI';
import { loadLanguage } from '../utils/i18n';
import { documentDir } from '@tauri-apps/api/path';

const defaultSettings: Settings = {
  language: 'en_US',
  theme: 'light',
  approvalMode: 'default',
  model: 'default',
  responseMode: 'async', // Default to async mode, stream mode is future implementation
  customApiKey: undefined,
  maxMessagesBeforeCompact: 25,
};


export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    (async () => {
      const baseDir = await documentDir();
      const configPath = `${baseDir}\\PEXData\\GeminiGUI`;
      const configInstance = new Config(configPath);
      setConfig(configInstance);

      const loadedSettings = await configInstance.loadConfig();
      if (loadedSettings) {
        setSettings(loadedSettings);
        await loadLanguage(loadedSettings.language as Language);
      } else {
        await loadLanguage(defaultSettings.language as Language);
      }
      setIsLoading(false);
    })();
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!config) return;
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await config.saveConfig(updated);
    if (newSettings.language) {
      await loadLanguage(newSettings.language as Language);
    }
  };

  return { settings, updateSettings, isLoading };
}
