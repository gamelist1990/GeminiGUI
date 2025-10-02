# Google Cloud Project 自動セットアップ機能

## 概要
このアプリケーションは、Google Cloud ProjectとGemini APIを**完全自動**でセットアップする機能を提供します。

## 機能

### 🤖 自動セットアップ (推奨)
OAuth認証情報を使用して、以下を全自動で実行します:

1. **Google Cloud Projectの作成**
   - ランダムなプロジェクトIDを自動生成
   - プロジェクト名は日付付きで作成
   - 組織なしで自動作成

2. **Gemini APIの有効化**
   - `generativelanguage.googleapis.com` を自動有効化
   - API有効化の完了を待機

3. **環境変数の設定**
   - `GOOGLE_CLOUD_PROJECT` をWindowsユーザー環境変数に自動設定
   - グローバルに利用可能

### 📝 手動セットアップ
従来通り、ブラウザで手動設定も可能です。

## 使用方法

### 前提条件
- Gemini CLIでGoogleアカウント認証が完了していること
- OAuth認証情報ファイルが存在すること: `C:\Users\[USER]\.gemini\oauth_creds.json`

### セットアップ手順

1. **アプリケーションを起動**
2. **認証を確認ボタンをクリック**
3. Google Cloud Projectエラーが検出されると自動的に `cloud-setup` ステップへ移行
4. **🤖 自動セットアップ (推奨)** ボタンをクリック
5. 自動的に以下が実行されます:
   - プロジェクト作成 (約5秒)
   - API有効化 (約3秒)
   - 環境変数設定
6. 完了!

### 認証情報について

OAuth認証ファイル (`oauth_creds.json`) の構造:
```json
{
  "access_token": "ya29.xxx...",
  "refresh_token": "1//xxx...",
  "scope": "https://www.googleapis.com/auth/cloud-platform",
  "token_type": "Bearer",
  "id_token": "eyJh...",
  "expiry_date": 1234567890000
}
```

- `access_token`: 現在のアクセストークン (有効期限あり)
- `refresh_token`: トークン更新用 (長期有効)
- `expiry_date`: アクセストークンの有効期限 (Unix timestamp)

自動セットアップは以下の処理を行います:
1. トークンの有効期限をチェック
2. 期限切れの場合、`refresh_token` で新しい `access_token` を取得
3. 有効なトークンでGoogle Cloud APIを呼び出し

## 技術詳細

### 使用するGoogle Cloud API
- **Cloud Resource Manager API v1**
  - プロジェクト作成: `POST /v1/projects`
  - プロジェクト一覧: `GET /v1/projects`

- **Service Usage API v1**
  - API有効化: `POST /v1/projects/{projectId}/services/{serviceName}:enable`

### 認証フロー
```
1. oauth_creds.json を読み込み
2. トークン有効期限チェック
   ├─ 有効 → そのまま使用
   └─ 期限切れ → refresh_token でトークン更新
3. Google Cloud APIを呼び出し
4. 環境変数を設定
```

### セキュリティ
- OAuth認証情報はローカルファイルから読み込み
- Gemini CLI公式のクライアントIDとシークレットを使用
- アクセストークンは自動更新
- 環境変数はユーザースコープに設定

## トラブルシューティング

### エラー: OAuth認証情報が見つかりません
**原因**: `~/.gemini/oauth_creds.json` が存在しない  
**解決方法**: 先にGemini CLIで認証を完了してください

### エラー: プロジェクト作成に失敗
**原因**: Cloud Resource Manager APIが有効化されていない、または権限不足  
**解決方法**: 手動セットアップに切り替えてください

### エラー: API有効化に失敗
**原因**: Service Usage APIが有効化されていない  
**解決方法**: ブラウザで手動でAPIを有効化してください

### エラー: 環境変数の設定に失敗
**原因**: PowerShellの権限不足  
**解決方法**: 管理者権限で実行するか、手動で環境変数を設定してください

## ファイル構造

```
src/
├── utils/
│   ├── cloudSetup.ts      # 自動セットアップロジック
│   └── setupAPI.ts        # セットアップAPI
└── pages/
    └── Setup.tsx          # セットアップUI
```

## 開発者向け情報

### 新しい関数
- `autoSetupCloudProject()`: メイン自動セットアップ関数
- `loadOAuthCredentials()`: OAuth認証情報読み込み
- `refreshAccessToken()`: トークン更新
- `createCloudProject()`: プロジェクト作成
- `enableGeminiAPI()`: API有効化
- `setEnvironmentVariable()`: 環境変数設定
- `listCloudProjects()`: 既存プロジェクト一覧取得

### 依存関係
- `@tauri-apps/plugin-fs`: ファイルシステムアクセス
- `@tauri-apps/plugin-shell`: PowerShellコマンド実行
- Fetch API: Google Cloud API呼び出し

## ライセンス
このプロジェクトは元のライセンスに従います。
