import { Language } from '../types';

let currentLanguage: Language = 'en_US';
let translations: Record<string, any> = {};

export async function loadLanguage(lang: Language): Promise<void> {
  try {
    const response = await fetch(`/lang/${lang}.jsonc`);
    const text = await response.text();
    // Remove comments from JSONC and clean up whitespace
    let jsonText = text
      .split('\n')
      .filter(line => !line.trim().startsWith('//')) // Remove comment lines
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/,\s*\n\s*\n/g, ',\n') // Clean up extra newlines after commas
      .trim();
    translations = JSON.parse(jsonText);
    currentLanguage = lang;
  } catch (error) {
    console.error('Failed to load language:', error);
    // Fallback to English
    if (lang !== 'en_US') {
      await loadLanguage('en_US');
    }
  }
}

export function t(key: string): string {
  const keys = key.split('.');
  let value: any = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return key if translation not found
    }
  }
  
  return typeof value === 'string' ? value : key;
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
}
