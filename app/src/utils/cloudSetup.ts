import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { getUserProfilePath, setEnvironmentVariable as setPowerShellEnvVar } from './powershellExecutor';

type LogFunction = (message: string) => void;

interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  id_token: string;
  expiry_date: number;
}

interface CloudProjectSetupResult {
  success: boolean;
  projectId?: string;
  error?: string;
}

// internal logger helper: prefer provided log function, otherwise fallback to console with prefix
function internalLog(message: string, log?: LogFunction) {
  if (log) {
    try { log(message); } catch (_) { console.log('[CloudSetup]', message); }
  } else {
    console.log('[CloudSetup]', message);
  }
}

/**
 * OAuth認証情報を読み込む
 */
async function loadOAuthCredentials(log?: LogFunction): Promise<OAuthCredentials | null> {
  internalLog('loadOAuthCredentials: Starting to load OAuth credentials', log);
  try {
    const userProfile = await getUserProfilePath();
    const oauthPath = `${userProfile}\\.gemini\\oauth_creds.json`;
    internalLog(`OAuth credentials path: ${oauthPath}`, log);
    
    const fileExists = await exists(oauthPath);
    internalLog(`OAuth file exists: ${fileExists}`, log);
    if (!fileExists) {
      internalLog('OAuth credentials file not found', log);
      return null;
    }

    const content = await readTextFile(oauthPath);
    internalLog('OAuth credentials loaded successfully', log);
    return JSON.parse(content) as OAuthCredentials;
  } catch (error) {
    internalLog(`Failed to load OAuth credentials: ${error}`, log);
    return null;
  }
}

/**
 * アクセストークンが有効かチェック
 */
function isTokenValid(creds: OAuthCredentials): boolean {
  return creds.expiry_date > Date.now();
}

/**
 * リフレッシュトークンで新しいアクセストークンを取得
 * 注: Gemini CLIのクライアント認証情報を使用
 */
async function refreshAccessToken(refreshToken: string, log?: LogFunction): Promise<string | null> {
  try {
    // Gemini CLI公式のOAuth認証情報
    // これらは公開されているクライアント認証情報です
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: '77185425430.apps.googleusercontent.com',
        client_secret: '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',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      internalLog(`Failed to refresh token, status: ${response.status}`, log);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    internalLog(`Failed to refresh token: ${error}`, log);
    return null;
  }
}

/**
 * アクセストークンを取得（必要なら更新）
 */
async function getValidAccessToken(log?: LogFunction): Promise<string | null> {
  const creds = await loadOAuthCredentials(log);
  if (!creds) {
    return null;
  }

  // トークンが有効ならそのまま返す
  if (isTokenValid(creds)) {
    return creds.access_token;
  }

  // 期限切れなら更新
  return await refreshAccessToken(creds.refresh_token, log);
}

/**
 * ランダムなプロジェクトIDを生成
 */
function generateProjectId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `gemini-project-${timestamp}-${random}`;
}

/**
 * Google Cloud Projectを自動作成
 */
async function createCloudProject(
  accessToken: string,
  log: LogFunction
): Promise<string | null> {
  internalLog('createCloudProject: Starting project creation', log);
  try {
    const projectId = generateProjectId();
    internalLog(`Generated project ID: ${projectId}`, log);
    if (log) log(`プロジェクトID: ${projectId} を作成しています...`);

    // プロジェクト名は英数字とスペース、ハイフンのみ許可
    const projectName = `Gemini Project ${Date.now()}`;
  internalLog(`Project name: ${projectName}`, log);
  internalLog('Sending POST request to Cloud Resource Manager API', log);
    const response = await fetch(
      'https://cloudresourcemanager.googleapis.com/v1/projects',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: projectId,
          name: projectName,
        }),
      }
    );

    internalLog(`API response status: ${response.status}`, log);
    if (!response.ok) {
      const error = await response.text();
      internalLog(`Project creation failed: ${error}`, log);
      if (log) log(`⚠️ プロジェクト作成エラー: ${error}`);
      return null;
    }

    await response.json(); // レスポンスを消費
  internalLog('Project created successfully', log);
  if (log) log(`✓ プロジェクトが作成されました: ${projectId}`);
    
    // プロジェクト作成は非同期なので、少し待つ
  if (log) log('プロジェクトの準備を待っています...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return projectId;
  } catch (error) {
    if (log) log(`エラー: プロジェクト作成に失敗しました: ${error}`);
    internalLog(`createCloudProject error: ${error}`, log);
    return null;
  }
}

/**
 * Gemini APIを有効化
 */
async function enableGeminiAPI(
  accessToken: string,
  projectId: string,
  log: LogFunction
): Promise<boolean> {
  try {
    internalLog(`enableGeminiAPI: Starting API enablement for project: ${projectId}`, log);
    if (log) log(`プロジェクト "${projectId}" でGemini APIを有効化しています...`);

    const serviceName = 'generativelanguage.googleapis.com';
    internalLog(`Service name: ${serviceName}`, log);
    internalLog('Sending POST request to Service Usage API', log);
    const response = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}:enable`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    internalLog(`API enablement response status: ${response.status}`, log);
    if (!response.ok) {
      const error = await response.text();
      internalLog(`API enablement failed: ${error}`, log);
      if (log) log(`⚠️ API有効化エラー: ${error}`);
      return false;
    }

    if (log) log('✓ Gemini APIが有効化されました');
    
    // API有効化も非同期なので、少し待つ
  if (log) log('API有効化の完了を待っています...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return true;
  } catch (error) {
    if (log) log(`エラー: API有効化に失敗しました: ${error}`);
    internalLog(`enableGeminiAPI error: ${error}`, log);
    return false;
  }
}

/**
 * 環境変数を設定
 */
async function setEnvironmentVariable(
  projectId: string,
  log: LogFunction
): Promise<boolean> {
  try {
    log(`環境変数 GOOGLE_CLOUD_PROJECT を設定しています...`);

    await setPowerShellEnvVar('GOOGLE_CLOUD_PROJECT', projectId);

    log(`✓ 環境変数を設定しました: GOOGLE_CLOUD_PROJECT=${projectId}`);
    return true;
  } catch (error) {
    log(`エラー: 環境変数の設定に失敗しました: ${error}`);
    return false;
  }
}
export async function autoSetupCloudProject(
  log: LogFunction
): Promise<CloudProjectSetupResult> {
  internalLog('autoSetupCloudProject started', log);
  try {
    if (log) log('🚀 Google Cloud Project の自動セットアップを開始します...');
    if (log) log('');

    // 1. OAuth認証情報を取得
    internalLog('Step 1: Loading OAuth credentials', log);
    if (log) log('1️⃣ OAuth認証情報を読み込んでいます...');
    const accessToken = await getValidAccessToken(log);
    internalLog(`Access token obtained: ${accessToken ? 'YES' : 'NO'}`, log);
    
    if (!accessToken) {
      internalLog('No access token available', log);
      if (log) {
        log('❌ OAuth認証情報が見つかりません');
        log('先にGoogle アカウントでログインしてください');
      }
      return { success: false, error: 'OAuth credentials not found' };
    }
    internalLog('Access token validated successfully', log);
    if (log) log('✓ 認証情報を取得しました');
    if (log) log('');

    // 2. プロジェクトを作成
    internalLog('Step 2: Creating Cloud Project', log);
    if (log) log('2️⃣ Google Cloud Projectを作成しています...');
    const projectId = await createCloudProject(accessToken, log);
    internalLog(`Project creation result: ${projectId}`, log);
    
    if (!projectId) {
      internalLog('Project creation failed', log);
      if (log) log('❌ プロジェクトの作成に失敗しました');
      return { success: false, error: 'Failed to create project' };
    }
    if (log) log('');

    // 3. Gemini APIを有効化
    internalLog('Step 3: Enabling Gemini API', log);
    if (log) log('3️⃣ Gemini APIを有効化しています...');
    const apiEnabled = await enableGeminiAPI(accessToken, projectId, log);
    internalLog(`API enablement result: ${apiEnabled}`, log);
    
    if (!apiEnabled) {
      internalLog('API enablement failed, but project exists', log);
      if (log) {
        log('⚠️ API有効化に失敗しましたが、プロジェクトは作成されています');
        log('手動でAPIを有効化してください');
      }
      return { 
        success: false, 
        projectId, 
        error: 'Failed to enable API' 
      };
    }
    if (log) log('');

    // 4. 環境変数を設定
    internalLog('Step 4: Setting environment variable', log);
    if (log) log('4️⃣ 環境変数を設定しています...');
    const envSet = await setEnvironmentVariable(projectId, log);
    internalLog(`Environment variable set result: ${envSet}`, log);
    
    if (!envSet) {
      internalLog('Environment variable setting failed', log);
      if (log) {
        log('⚠️ 環境変数の設定に失敗しましたが、プロジェクトとAPIは準備できています');
        log('手動で環境変数を設定してください');
      }
    }
    if (log) log('');

    internalLog(`Auto setup completed successfully, projectId: ${projectId}`, log);
    if (log) log('🎉 自動セットアップが完了しました!');
    if (log) log(`プロジェクトID: ${projectId}`);
    if (log) log('');
    if (log) log('💡 このアプリケーションを再起動すると、設定が反映されます');

    return { success: true, projectId };
  } catch (error) {
    internalLog(`Auto setup error: ${error}`, log);
    internalLog(`Error stack: ${error instanceof Error ? error.stack : 'N/A'}`, log);
    if (log) log(`❌ 自動セットアップ中にエラーが発生しました: ${error}`);
    return { success: false, error: String(error) };
  }
}

/**
 * Google Cloud Projectが最低1つ存在するかチェック
 */
export async function hasCloudProject(log?: LogFunction): Promise<boolean> {
  try {
    internalLog('hasCloudProject: Starting project existence check', log);
    
    const accessToken = await getValidAccessToken(log);
    if (!accessToken) {
      if (log) {
        log('⚠️ OAuth認証情報が見つかりません');
        log('oauth_creds.json ファイルが存在しないか、読み取りに失敗しました');
      }
      return false;
    }

    if (log) log('[hasCloudProject] Access token acquired, calling Cloud Resource Manager API');
    const response = await fetch(
      'https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=1',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

  if (log) log(`API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (log) {
        log('[hasCloudProject] ⚠️ プロジェクト一覧の取得に失敗しました');
        const errorText = await response.text();
        log(`[hasCloudProject] Error response: ${errorText.substring(0, 200)}`);
      }
      return false;
    }

    const data = await response.json();
    const projects = data.projects || [];
    
    if (log) log(`Found ${projects.length} project(s)`);
    
    if (projects.length > 0) {
      if (log) log(`✓ Google Cloud Projectが見つかりました (プロジェクト数: ${projects.length}+)`);
      return true;
    } else {
      if (log) log('✗ Google Cloud Projectが見つかりません');
      return false;
    }
  } catch (error) {
    if (log) {
      log(`エラーが発生しました: ${error}`);
      log(`Error details: ${error instanceof Error ? error.stack : 'Unknown'}`);
    }
    return false;
  }
}

/**
 * 既存のプロジェクト一覧を取得
 */
export async function listCloudProjects(log: LogFunction): Promise<string[]> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      log('❌ OAuth認証情報が見つかりません');
      return [];
    }

    log('既存のプロジェクトを取得しています...');
    const response = await fetch(
      'https://cloudresourcemanager.googleapis.com/v1/projects',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      log('⚠️ プロジェクト一覧の取得に失敗しました');
      return [];
    }

    const data = await response.json();
    const projects = data.projects || [];
    
    return projects.map((p: any) => p.projectId);
  } catch (error) {
    log(`エラー: ${error}`);
    return [];
  }
}

/**
 * 既存プロジェクトの最初のIDを取得して環境変数を設定
 */
export async function setupExistingProject(log: LogFunction): Promise<{success: boolean, projectId?: string}> {
  internalLog('setupExistingProject: Starting', log);
  try {
    const projectIds = await listCloudProjects(log);

    if (projectIds.length === 0) {
      internalLog('No projects found', log);
      if (log) log('❌ プロジェクトが見つかりませんでした');
      return {success: false};
    }

    const projectId = projectIds[0];
    internalLog(`Using first project: ${projectId}`, log);
    if (log) log(`✓ プロジェクトを使用します: ${projectId}`);

    // 環境変数を設定
    const success = await setEnvironmentVariable(projectId, log);

    if (success) {
      internalLog('Environment variable set successfully', log);
      if (log) {
        log('✓ 環境変数を設定しました');
        log('💡 アプリケーションを再起動すると設定が反映されます');
      }
      return {success: true, projectId};
    }

    return {success: false};
  } catch (error) {
    internalLog(`setupExistingProject error: ${error}`, log);
    if (log) log(`エラー: ${error}`);
    return {success: false};
  }
}
