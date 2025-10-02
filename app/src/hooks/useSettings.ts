import { useState, useEffect } from 'react';
import { Settings, Language } from '../types';
import { Config } from '../utils/configAPI';
import { loadLanguage } from '../utils/i18n';

const defaultSettings: Settings = {
  language: 'en_US',
  theme: 'light',
};

const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loadedSettings = await config.loadConfig();
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
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await config.saveConfig(updated);
    if (newSettings.language) {
      await loadLanguage(newSettings.language as Language);
    }
  };

  return { settings, updateSettings, isLoading };
}
