import { exists } from '@tauri-apps/plugin-fs';
import { getUserProfilePath } from './powershellExecutor';

type LogFunction = (message: string) => void;

function internalLog(message: string, log?: LogFunction) {
  if (log) {
    try {
      log(message);
    } catch (_) {
      console.log('[CloudSetup]', message);
    }
  } else {
    console.log('[CloudSetup]', message);
  }
}

export async function hasCloudProject(log?: LogFunction): Promise<boolean> {
  internalLog('hasCloudProject: Checking for Cloud Project setup', log);
  try {
    const userProfile = await getUserProfilePath();
    const oauthPath = `${userProfile}\\.gemini\\oauth_creds.json`;
    const fileExists = await exists(oauthPath);
    internalLog(`OAuth file exists: ${fileExists}`, log);
    if (fileExists) {
      if (log) log('OAuth file found');
    } else {
      if (log) log('OAuth file not found. Run gemini auth');
    }
    return fileExists;
  } catch (error) {
    internalLog(`Failed to check Cloud Project: ${error}`, log);
    return false;
  }
}

export async function setupExistingProject(log?: LogFunction): Promise<{ success: boolean; projectId?: string; error?: string }> {
  internalLog('setupExistingProject: This function is deprecated.', log);
  return {
    success: false,
    error: 'Automatic setup removed. Use gemini auth command.'
  };
}

export async function autoSetupCloudProject(log?: LogFunction): Promise<{ success: boolean; projectId?: string; error?: string }> {
  internalLog('autoSetupCloudProject: This function is deprecated.', log);
  return {
    success: false,
    error: 'Automatic project creation removed. Create manually at console.cloud.google.com'
  };
}
