# GitHub Copilot Instructions for GeminiGUI

## 🎯 プロジェクト概要
このリポジトリは **Tauri v2 + React 19 + TypeScript + Vite** で構築されたデスクトップGUIアプリケーション（Gemini AI & OpenAI クライアント）です。ワークスペースベースのチャットインターフェースを提供し、ツール実行、セッション管理、マルチAPIサポートなどの高度な機能を備えています。

## 🛠️ 技術スタック
- **フロントエンド**: React 19.1.0, TypeScript 5.8.3, Vite 7.0.4
- **バックエンド**: Tauri v2 (Rust)
- **ビルドツール**: Vite with Tauri CLI
- **パッケージマネージャー**: Bun (推奨), npm/yarn (互換)
- **AI API**: Gemini AI (PowerShell CLI経由), OpenAI (Function Calling API)

## 📁 重要なファイルとアーキテクチャ

### 主要ディレクトリ構成
```
app/src/
├── AITool/              # Modern Tool System (ツール定義と実行エンジン)
│   ├── modernTools.ts   # JSON Schemaベースのツール定義
│   └── toolExecutor.ts  # Rust/Tauriコマンド経由のツール実行
├── hooks/               # React hooks (ビジネスロジック)
│   ├── useChatSessions.ts  # チャットセッション管理
│   ├── useSettings.ts      # グローバル設定管理
│   └── useWorkspaces.ts    # ワークスペース管理
├── pages/               # アプリケーションビュー
│   ├── Chat/           # チャットインターフェース
│   ├── Settings/       # 設定パネル（カテゴリ別）
│   ├── SettingsPage.tsx    # モダン設定ページ
│   ├── WorkspaceSelection.tsx  # ワークスペース選択
│   └── Setup.tsx       # 初期セットアップウィザード
├── utils/              # ユーティリティ関数とAPI
│   ├── configAPI.ts    # 設定の永続化（ファイルシステム）
│   ├── geminiCUI.ts    # Gemini AI統合
│   ├── openaiAPI.ts    # OpenAI API統合
│   ├── cleanupManager.ts   # 一時ファイルの自動クリーンアップ
│   ├── i18n.ts         # 国際化（JSONC形式）
│   └── modernToolSystem.ts # ツールシステム互換レイヤー
└── types/
    └── index.ts        # 型定義（Workspace, Settings, など）
```

### データストレージ構造
```
~/Documents/PEXData/GeminiGUI/
├── config.json         # グローバル設定
├── workspaces.json     # ワークスペース一覧
└── Chatrequest/
    └── {workspaceId}/
        ├── sessions/
        │   └── {sessionId}.json  # チャットメッセージ
        └── temp/
            └── GeminiTemp/       # 自動クリーンアップされる一時ディレクトリ
```

## 🔑 核となるコンセプト

### 1. Modern Tool System
**場所**: `app/src/AITool/`

**特徴**:
- JSON Schemaベースのツール定義（OpenAI/Anthropic/Gemini互換）
- Tauriコマンド経由での安全なツール実行（Rustバックエンド）
- ワークスペース境界の検証とセキュリティ
- 7つの基本ツール: `read_file`, `write_file`, `delete_file`, `move_file`, `list_directory`, `create_directory`, `search_files`

**OpenAI Function Calling フロー**:
1. 初回リクエスト: AIがツール使用を決定 → `tool_calls` を返す
2. ツール実行: フロントエンドがツールを実行、結果を収集
3. フォローアップリクエスト: 結果を `tool` ロールメッセージとしてAIに送信
4. 最終応答: AIが人間にわかりやすい説明を生成

### 2. 設定システム
**場所**: `app/src/utils/configAPI.ts`

**Config クラスAPI**:
- `load()`: ディスクから設定を読み込み
- `save()`: ディスクに設定を書き込み
- `get(key)`: 設定値を取得
- `set(key, value)`: 設定値を設定
- 自動的なディレクトリ作成とエラーハンドリング

### 3. CleanupManager
**場所**: `app/src/utils/cleanupManager.ts`

**目的**: AI操作中に作成された一時ファイルの自動クリーンアップ

**機能**:
- **レジストリ**: すべての一時ファイル/ディレクトリをメタデータと共に追跡
- **自動クリーンアップ**: 60秒ごとに実行、10分以上経過したファイルを削除
- **セッションベース**: 一時ファイルをワークスペース+セッションに関連付け
- **手動クリーンアップ**: `cleanupSession()` で即座にクリーンアップ可能

### 4. 国際化 (i18n)
**場所**: `app/src/utils/i18n.ts`, `app/public/lang/`

**実装**:
- **フォーマット**: JSONC（コメント付きJSON）
- **構造**: ネストされたキー（例: `settings.categories.general.title`）
- **API**: `t('key')` で翻訳、`setLanguage()` で言語切替
- **フォールバック**: 翻訳が見つからない場合はキー文字列を返す

## 🚀 開発コマンド

### セットアップ
```powershell
cd app
bun install          # or: npm install
```

### 開発
```powershell
bun run dev          # フロントエンドのみ（Vite devサーバー）
bun run tauri dev    # Tauriバックエンド込みの完全版
```

### ビルド
```powershell
bun run build        # フロントエンドアセットのビルド
bun run tauri build  # 配布用アプリケーションバンドルのビルド
```

## 🔧 よくある開発パターン

### 新しいTauriコマンドの追加
1. `app/src-tauri/src/lib.rs` にコマンドを追加:
```rust
#[tauri::command]
fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Hello {}", arg))
}
```

2. `invoke_handler!` に登録:
```rust
tauri::generate_handler![greet, my_command]
```

3. フロントエンドから呼び出し:
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<string>('my_command', { arg: 'World' });
```

### 翻訳の追加
1. `app/public/lang/en_US.jsonc` と `ja_JP.jsonc` を編集:
```jsonc
{
  "myFeature": {
    "title": "My Feature",      // English
    "title": "私の機能"         // Japanese
  }
}
```

2. コンポーネントで使用:
```typescript
import { t } from '../utils/i18n';
<h1>{t('myFeature.title')}</h1>
```

### 新しいツールの追加
1. `app/src/AITool/modernTools.ts` で定義:
```typescript
export const MY_TOOL: ModernToolDefinition = {
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'ツールの説明',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '第1パラメータ' }
      },
      required: ['param1']
    }
  }
};
```

2. `app/src/AITool/toolExecutor.ts` で実装:
```typescript
case 'my_tool':
  // ツール実行ロジック
  return { success: true, result: data };
```

3. ツール配列とエクスポートに追加

### 設定の管理
```typescript
// コンポーネント内
const { settings, updateSettings } = useSettings();

// 設定を更新
updateSettings({ theme: 'dark' });

// 設定は自動的にディスクに永続化される
```

### チャットセッションの操作
```typescript
const { sessions, currentSessionId, createSession, addMessage } = useChatSessions(workspaceId);

// 新しいセッションを作成
const sessionId = await createSession('セッション名');

// メッセージを送信
addMessage(sessionId, {
  role: 'user',
  content: 'こんにちはAI',
  timestamp: new Date()
});
```

## 🐛 デバッグのヒント

### フロントエンドデバッグ
- `bun run dev` で高速HMR（Hot Module Replacement）
- Tauriウィンドウでブラウザ DevTools (F12) を使用
- `[Component]` プレフィックス付きログをコンソールで確認

### バックエンドデバッグ
- RustログはTauri dev コンソールに表示される
- VS Code + Rust Analyzer 拡張機能を使用
- `src-tauri/src/` ファイルにブレークポイントを設定

### よくある問題
1. **TypeScriptエラー**: `bun run build` ですべての型をチェック
2. **Tauriプラグインエラー**: `tauri.conf.json` のパーミッションを確認
3. **ファイルシステムエラー**: Tauri FSプラグインのパーミッションを確認
4. **翻訳の欠落**: キー文字列にフォールバックされる、コンソールを確認

## 🎯 プロジェクト固有の慣習

### 命名規則
- **コンポーネント**: PascalCase (例: `ChatMessageBubble.tsx`)
- **Hooks**: camelCase + `use` プレフィックス (例: `useChatSessions.ts`)
- **ユーティリティ**: camelCase (例: `configAPI.ts`)
- **定数**: UPPER_SNAKE_CASE (例: `MODERN_TOOLS`)
- **型/インターフェース**: PascalCase (例: `ChatSession`, `Workspace`)

### インポートの順序
1. 外部ライブラリ（React、Tauri、など）
2. 内部ユーティリティとフック
3. コンポーネント
4. 型
5. CSS

### エラーハンドリングパターン
```typescript
try {
  const result = await someOperation();
  console.log('[Component] Success:', result);
} catch (error) {
  console.error('[Component] Error:', error);
  // ユーザーフレンドリーなエラーメッセージを表示
}
```

### ログパターン
- プレフィックスを使用: `[Chat]`, `[Settings]`, `[OpenAI]`, `[Gemini]`
- 重要な状態変更をログ
- タイミング情報付きでAPI呼び出しをログ
- ログ出力前に機密データをサニタイズ

## 📝 AIアシスタントへの注意事項

このコードベースで作業する際:
1. **必ず確認**: Tauriプラグインが `tauri.conf.json` で正しく設定されているか
2. **検証**: ファイルパスがワークスペース境界内にあるか
3. **維持**: 既存のフックベースのアーキテクチャ
4. **保持**: UIテキストを変更する際は翻訳キーを保持
5. **テスト**: AIロジックを変更する際はGeminiとOpenAIの両統合をテスト
6. **更新**: 一時ファイルを作成する際はCleanupManagerへの登録を更新
7. **従う**: 一貫性のために既存のコードパターンに従う
8. **文書化**: 新機能をコメントとREADMEに文書化

## 🔄 最近の主要な変更

### ツールシステムのモダナイゼーション（最新）
- レガシーツールマネージャーからModern Tool Systemへ移行
- ツール定義と実行ロジックを分離
- フォローアップリクエストを持つOpenAI Function Calling サポートを追加
- AIへの適切なツール結果フィードバックを実装

### 設定システムの刷新
- カテゴリベースのナビゲーションを持つ統一設定インターフェース
- 即座の永続化を伴うリアルタイムツール設定
- ツールの有効/無効の同期問題を修正

### OpenAI統合
- 適切なツール実行を伴うストリーミングサポートを追加
- 2フェーズリクエストパターンを実装（ツール呼び出し → 結果 → 最終応答）
- ワークスペースコンテキストと会話履歴のサポートを追加

## 🔍 重要なファイルリファレンス

### コアアプリケーションファイル
- `app/src/App.tsx` - メインルーティング、グローバル状態の初期化
- `app/src/pages/Chat/index.tsx` - チャットインターフェース、AI操作ロジック
- `app/src/pages/SettingsPage.tsx` - 統一設定インターフェース
- `app/src/pages/WorkspaceSelection.tsx` - お気に入り付きワークスペースピッカー

### ビジネスロジックフック
- `app/src/hooks/useChatSessions.ts` - セッションCRUD、メッセージ送信、トークン追跡
- `app/src/hooks/useSettings.ts` - 設定管理、永続化
- `app/src/hooks/useWorkspaces.ts` - ワークスペースCRUD、お気に入り、最近のリスト

### AI統合
- `app/src/utils/geminiCUI.ts` - Gemini AI統合（PowerShell CLI）
- `app/src/utils/openaiAPI.ts` - OpenAI API統合（Function Calling）
- `app/src/AITool/modernTools.ts` - ツール定義（JSON Schema）
- `app/src/AITool/toolExecutor.ts` - ツール実行エンジン

### ユーティリティ
- `app/src/utils/configAPI.ts` - 設定の永続化
- `app/src/utils/cleanupManager.ts` - 一時ファイルのクリーンアップ
- `app/src/utils/i18n.ts` - 国際化
- `app/src/utils/workspace.ts` - ワークスペースファイルのスキャン

### バックエンド
- `app/src-tauri/src/lib.rs` - Tauriコマンド（ファイル操作、ツール実行）
- `app/src-tauri/tauri.conf.json` - Tauri設定（パーミッション、ウィンドウ設定）

---

**最終更新**: 2025-10-05  
**プロジェクトバージョン**: 0.1.0  
**メンテナー**: gamelist1990

**重要**: このドキュメントは、Copilot や Claude などのAIアシスタントがこのプロジェクトで効率的に作業できるように最適化されています。人間の開発者には、より詳細な `CLAUDE.md` を参照することをお勧めします。
