import { useState, useEffect } from 'react';
import { Settings, Language } from '../types';
import { loadSettings, saveSettings } from '../utils/storage';
import { loadLanguage } from '../utils/i18n';

const defaultSettings: Settings = {
  language: 'en_US',
  theme: 'light',
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loadedSettings = loadSettings();
      if (loadedSettings) {
        setSettings(loadedSettings);
        await loadLanguage(loadedSettings.language as Language);
      } else {
        await loadLanguage(defaultSettings.language as Language);
      }
      setIsLoading(false);
    })();
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveSettings(updated);
    if (newSettings.language) {
      loadLanguage(newSettings.language as Language);
    }
  };

  return { settings, updateSettings, isLoading };
}
