import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';

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

/**
 * OAuth認証情報を読み込む
 */
async function loadOAuthCredentials(): Promise<OAuthCredentials | null> {
  console.log('[CloudSetup] loadOAuthCredentials: Starting to load OAuth credentials');
  try {
    const homeDir = await Command.create('powershell.exe', [
      '-Command',
      'echo $env:USERPROFILE'
    ]).execute();

    const userProfile = homeDir.stdout.trim();
    const oauthPath = `${userProfile}\\.gemini\\oauth_creds.json`;
    console.log('[CloudSetup] OAuth credentials path:', oauthPath);
    
    const fileExists = await exists(oauthPath);
    console.log('[CloudSetup] OAuth file exists:', fileExists);
    if (!fileExists) {
      console.warn('[CloudSetup] OAuth credentials file not found');
      return null;
    }

    const content = await readTextFile(oauthPath);
    console.log('[CloudSetup] OAuth credentials loaded successfully');
    return JSON.parse(content) as OAuthCredentials;
  } catch (error) {
    console.error('[CloudSetup] Failed to load OAuth credentials:', error);
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
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

/**
 * アクセストークンを取得（必要なら更新）
 */
async function getValidAccessToken(): Promise<string | null> {
  const creds = await loadOAuthCredentials();
  if (!creds) {
    return null;
  }

  // トークンが有効ならそのまま返す
  if (isTokenValid(creds)) {
    return creds.access_token;
  }

  // 期限切れなら更新
  return await refreshAccessToken(creds.refresh_token);
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
  console.log('[CloudSetup] createCloudProject: Starting project creation');
  try {
    const projectId = generateProjectId();
    console.log('[CloudSetup] Generated project ID:', projectId);
    log(`プロジェクトID: ${projectId} を作成しています...`);

    // プロジェクト名は英数字とスペース、ハイフンのみ許可
    const projectName = `Gemini Project ${Date.now()}`;
    console.log('[CloudSetup] Project name:', projectName);

    console.log('[CloudSetup] Sending POST request to Cloud Resource Manager API');
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

    console.log('[CloudSetup] API response status:', response.status);
    if (!response.ok) {
      const error = await response.text();
      console.error('[CloudSetup] Project creation failed:', error);
      log(`⚠️ プロジェクト作成エラー: ${error}`);
      return null;
    }

    await response.json(); // レスポンスを消費
    console.log('[CloudSetup] Project created successfully');
    log(`✓ プロジェクトが作成されました: ${projectId}`);
    
    // プロジェクト作成は非同期なので、少し待つ
    log('プロジェクトの準備を待っています...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return projectId;
  } catch (error) {
    log(`エラー: プロジェクト作成に失敗しました: ${error}`);
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
  console.log('[CloudSetup] enableGeminiAPI: Starting API enablement for project:', projectId);
  try {
    log(`プロジェクト "${projectId}" でGemini APIを有効化しています...`);

    const serviceName = 'generativelanguage.googleapis.com';
    console.log('[CloudSetup] Service name:', serviceName);
    console.log('[CloudSetup] Sending POST request to Service Usage API');
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

    console.log('[CloudSetup] API enablement response status:', response.status);
    if (!response.ok) {
      const error = await response.text();
      console.error('[CloudSetup] API enablement failed:', error);
      log(`⚠️ API有効化エラー: ${error}`);
      return false;
    }

    log('✓ Gemini APIが有効化されました');
    
    // API有効化も非同期なので、少し待つ
    log('API有効化の完了を待っています...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return true;
  } catch (error) {
    log(`エラー: API有効化に失敗しました: ${error}`);
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

    const setEnvCommand = await Command.create('powershell.exe', [
      '-Command',
      `[System.Environment]::SetEnvironmentVariable('GOOGLE_CLOUD_PROJECT', '${projectId}', [System.EnvironmentVariableTarget]::User)`,
    ]).execute();

    if (setEnvCommand.code === 0) {
      log(`✓ 環境変数を設定しました: GOOGLE_CLOUD_PROJECT=${projectId}`);
      return true;
    } else {
      log(`⚠️ 環境変数の設定に失敗しました`);
      return false;
    }
  } catch (error) {
    log(`エラー: 環境変数の設定に失敗しました: ${error}`);
    return false;
  }
}

/**
 * Google Cloud Projectの自動セットアップ（メイン関数）
 */
export async function autoSetupCloudProject(
  log: LogFunction
): Promise<CloudProjectSetupResult> {
  console.log('[CloudSetup] autoSetupCloudProject started');
  try {
    log('🚀 Google Cloud Project の自動セットアップを開始します...');
    log('');

    // 1. OAuth認証情報を取得
    console.log('[CloudSetup] Step 1: Loading OAuth credentials');
    log('1️⃣ OAuth認証情報を読み込んでいます...');
    const accessToken = await getValidAccessToken();
    console.log('[CloudSetup] Access token obtained:', accessToken ? 'YES' : 'NO');
    
    if (!accessToken) {
      console.error('[CloudSetup] No access token available');
      log('❌ OAuth認証情報が見つかりません');
      log('先にGoogle アカウントでログインしてください');
      return { success: false, error: 'OAuth credentials not found' };
    }
    console.log('[CloudSetup] Access token validated successfully');
    log('✓ 認証情報を取得しました');
    log('');

    // 2. プロジェクトを作成
    console.log('[CloudSetup] Step 2: Creating Cloud Project');
    log('2️⃣ Google Cloud Projectを作成しています...');
    const projectId = await createCloudProject(accessToken, log);
    console.log('[CloudSetup] Project creation result:', projectId);
    
    if (!projectId) {
      console.error('[CloudSetup] Project creation failed');
      log('❌ プロジェクトの作成に失敗しました');
      return { success: false, error: 'Failed to create project' };
    }
    log('');

    // 3. Gemini APIを有効化
    console.log('[CloudSetup] Step 3: Enabling Gemini API');
    log('3️⃣ Gemini APIを有効化しています...');
    const apiEnabled = await enableGeminiAPI(accessToken, projectId, log);
    console.log('[CloudSetup] API enablement result:', apiEnabled);
    
    if (!apiEnabled) {
      console.warn('[CloudSetup] API enablement failed, but project exists');
      log('⚠️ API有効化に失敗しましたが、プロジェクトは作成されています');
      log('手動でAPIを有効化してください');
      return { 
        success: false, 
        projectId, 
        error: 'Failed to enable API' 
      };
    }
    log('');

    // 4. 環境変数を設定
    console.log('[CloudSetup] Step 4: Setting environment variable');
    log('4️⃣ 環境変数を設定しています...');
    const envSet = await setEnvironmentVariable(projectId, log);
    console.log('[CloudSetup] Environment variable set result:', envSet);
    
    if (!envSet) {
      console.warn('[CloudSetup] Environment variable setting failed');
      log('⚠️ 環境変数の設定に失敗しましたが、プロジェクトとAPIは準備できています');
      log('手動で環境変数を設定してください');
    }
    log('');

    console.log('[CloudSetup] Auto setup completed successfully, projectId:', projectId);
    log('🎉 自動セットアップが完了しました!');
    log(`プロジェクトID: ${projectId}`);
    log('');
    log('💡 このアプリケーションを再起動すると、設定が反映されます');

    return { success: true, projectId };
  } catch (error) {
    console.error('[CloudSetup] Auto setup error:', error);
    console.error('[CloudSetup] Error stack:', error instanceof Error ? error.stack : 'N/A');
    log(`❌ 自動セットアップ中にエラーが発生しました: ${error}`);
    return { success: false, error: String(error) };
  }
}

/**
 * Google Cloud Projectが最低1つ存在するかチェック
 */
export async function hasCloudProject(log?: LogFunction): Promise<boolean> {
  try {
    if (log) log('[hasCloudProject] Starting project existence check');
    
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      if (log) {
        log('[hasCloudProject] ⚠️ OAuth認証情報が見つかりません');
        log('[hasCloudProject] oauth_creds.json ファイルが存在しないか、読み取りに失敗しました');
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

    if (log) log(`[hasCloudProject] API response status: ${response.status} ${response.statusText}`);

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
    
    if (log) log(`[hasCloudProject] Found ${projects.length} project(s)`);
    
    if (projects.length > 0) {
      if (log) log(`[hasCloudProject] ✓ Google Cloud Projectが見つかりました (プロジェクト数: ${projects.length}+)`);
      return true;
    } else {
      if (log) log('[hasCloudProject] ✗ Google Cloud Projectが見つかりません');
      return false;
    }
  } catch (error) {
    if (log) {
      log(`[hasCloudProject] エラーが発生しました: ${error}`);
      log(`[hasCloudProject] Error details: ${error instanceof Error ? error.stack : 'Unknown'}`);
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
  console.log('[CloudSetup] setupExistingProject: Starting');
  try {
    const projectIds = await listCloudProjects(log);
    
    if (projectIds.length === 0) {
      console.error('[CloudSetup] No projects found');
      log('❌ プロジェクトが見つかりませんでした');
      return {success: false};
    }

    const projectId = projectIds[0];
    console.log('[CloudSetup] Using first project:', projectId);
    log(`✓ プロジェクトを使用します: ${projectId}`);
    
    // 環境変数を設定
    const success = await setEnvironmentVariable(projectId, log);
    
    if (success) {
      console.log('[CloudSetup] Environment variable set successfully');
      log('✓ 環境変数を設定しました');
      log('💡 アプリケーションを再起動すると設定が反映されます');
      return {success: true, projectId};
    }
    
    return {success: false};
  } catch (error) {
    console.error('[CloudSetup] setupExistingProject error:', error);
    log(`エラー: ${error}`);
    return {success: false};
  }
}
