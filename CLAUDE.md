# Copilot Instructions for GeminiGUI

## Project Overview
This is a desktop application built with Tauri v2, React 19, TypeScript, and Vite. It provides a GUI interface for interacting with Gemini AI.

## Tech Stack
- **Frontend**: React 19.1.0, TypeScript 5.8.3, Vite 7.0.4
- **Backend**: Tauri v2 (Rust)
- **Build Tool**: Vite with Tauri CLI
- **Package Manager**: Bun (as indicated by bun.lock)

## Project Structure
```
/app
  ├── src/                 # React TypeScript source code
  │   ├── App.tsx         # Main React component
  │   ├── App.css         # Main styles
  │   └── main.tsx        # React entry point
  ├── src-tauri/          # Rust/Tauri backend
  │   ├── src/
  │   │   ├── lib.rs      # Library with Tauri commands
  │   │   └── main.rs     # Entry point
  │   ├── build.rs        # Build script
  │   └── Cargo.toml      # Rust dependencies
  ├── public/             # Static assets
  ├── index.html          # HTML entry point
  ├── package.json        # Node.js dependencies
  └── vite.config.ts      # Vite configuration
```

## Common Commands

### Development
- `cd app && bun install` - Install dependencies (recommended approach with Bun)
- `cd app && npm install` - Alternative dependency installation with npm
- `cd app && bun run dev` - Run frontend only in development mode (Vite dev server)
- `cd app && bun run tauri dev` - Run full application with Tauri (includes Rust backend)

### Building
- `cd app && bun run build` - Build frontend assets (TypeScript compilation + Vite build)
- `cd app && bun run tauri build` - Build complete application bundle for distribution

### Other
- `cd app && bun run preview` - Preview built frontend assets locally

## Code Architecture

### High-Level Structure
The application follows a workspace-based chat interface architecture:

1. **App.tsx** - Central routing component managing three main views:
   - Workspace selection (default view)
   - Chat interface (when workspace is selected)
   - Settings (configuration panel)

2. **View-Based Navigation** - Uses a simple state-based routing system with lazy-loaded components and Suspense fallbacks

3. **Data Flow**:
   - **Settings**: Global configuration stored in filesystem (Google Cloud credentials, UI preferences, API keys)
   - **Workspaces**: Project-based organization with recent/favorite tracking
   - **Chat Sessions**: Conversation threads per workspace with message history and token usage tracking

### Key Components

#### Frontend (app/src/)
- **pages/**: Main view components (`Chat.tsx`, `Settings.tsx`, `WorkspaceSelection.tsx`)
- **hooks/**: React hooks encapsulating business logic:
  - `useSettings()`: Configuration management
  - `useWorkspaces()`: Workspace CRUD operations and favorite/recent lists
  - `useChatSessions()`: Session management, message sending, token calculations
- **utils/**: Utility functions:
  - `configAPI.ts`: Filesystem-based configuration persistence using Tauri FS plugin
  - `i18n.ts`: Internationalization with JSONC support
  - `geminiCUI.ts`: AI interaction logic
- **types/**: Core data structures (Workspace, ChatSession, Settings, etc.)

#### Backend (app/src-tauri/)
- **lib.rs**: Tauri command handlers and invoke bindings
- **main.rs**: Application entry point and plugin initialization
- Rust commands exposed to frontend via `invoke()` calls

#### Data Storage
- Global config: `~/PEXData/GeminiGUI/` (OS document directory)
- Workspace data: Persisted per-workspace within config directory
- Settings: Single JSON file with user preferences and cloud credentials

### Key Patterns
- **Hook-based Logic**: Business logic abstracted into reusable React hooks
- **Taury Command Pattern**: Native operations via Rust commands called from JavaScript
- **Filesystem Persistence**: All persistent data stored using Tauri's FS plugin
- **Lazy Loading**: Route components loaded on-demand for better startup performance
- **Internationalization**: JSONC-based translation files with fallback to key strings

## Supported Tauri Plugins
The project uses the following official Tauri plugins:
- `tauri-plugin-os` - OS information
- `tauri-plugin-notification` - System notifications
- `tauri-plugin-fs` - File system access
- `tauri-plugin-shell` - Shell command execution
- `tauri-plugin-dialog` - Native dialogs
- `tauri-plugin-opener` - Open files/URLs with default apps
- `tauri-controls` - Custom window controls (third-party)

## Development Guidelines

### Code Style
- Use TypeScript for all React components
- Follow React 19 best practices with functional components and hooks
## Copilot / AI エージェント向け素早く使える要点

このリポジトリは Tauri(v2) + React(19) + TypeScript + Vite で作られたデスクトップ GUI（GeminiAPI クライアント）です。ここでは、AI エージェントがこのコードベースで即戦力になるための最小限の知識を示します。

## 重要なファイルとアーキテクチャ（要点）
- UI (React): `app/src/` — 主要ページは `pages/`（`Chat.tsx`, `Settings.tsx`, `WorkspaceSelection.tsx`, `Setup.tsx`）。
- アプリ入口: `app/src/App.tsx`（グローバル設定、ワークスペース選択、hook の組合せで画面遷移を制御）。
- ビジネスロジック / 再利用: `app/src/hooks/`（例: `useChatSessions.ts`, `useSettings.ts`, `useWorkspaces.ts`）に副作用や永続化のパターンが集約。
- ユーティリティ: `app/src/utils/`（`configAPI.ts`, `geminiCUI.ts`, `i18n.ts`, `powershellExecutor.ts`, `localFileSystem.ts`）— 外部連携や設定周りを担当。
- 翻訳: `app/public/lang/{en_US.jsonc,ja_JP.jsonc}` と `app/src/utils/i18n.ts`（JSONC をパースして `t(key)` を提供）。
- ネイティブ側 (Tauri/Rust): `app/src-tauri/src/lib.rs`（`#[tauri::command]` と `invoke_handler!` でコマンド登録）。
- パッケージ設定: `app/package.json`（スクリプト: `dev`, `build`, `tauri`）。Bundler は Bun を想定（`bun.lock` が存在）だが npm/Yarn でも動く。

## 開発・ビルドの短い手順（確実に動かすためのコマンド）
- 依存インストール（推奨）: `cd app` → `bun install`（あるいは `npm install`）
- 開発（Tauri + Vite）: `bun run tauri dev`（`package.json` の `tauri` スクリプトに引数 `dev` を渡す）
- フロントだけ: `bun run dev`（Vite）
- ビルド: `bun run tauri build`
- ポート: Vite デフォルトの dev ポートは 1420、HMR は 1421（プロジェクト内で明記あり）。

## 主要パターンと注意点（コード例を参照）
- Tauri コマンド追加: `src-tauri/src/lib.rs` に `#[tauri::command] fn foo(...) {}` を書き、`tauri::generate_handler![foo, ...]` に登録する。
  例: `lib.rs` に `greet` が登録されている。
- フロント→ネイティブ呼び出し: `invoke('command_name', { ... })`（`@tauri-apps/api` を使用）。
- i18n: `t('category.key')` を使う。欠落時はキー文字列が返るため、キーで挙動を推測可能（参照: `app/src/utils/i18n.ts`）。
- 設定/ワークスペース管理: `Config` クラス（`utils/configAPI.ts`）を通じてドキュメントディレクトリ下に永続化。`App.tsx` の `globalConfig` 初期化を参照。
- Chat セッション: `useChatSessions` がセッション作成・送信・再送・圧縮等の操作を提供。ページロジックは `app/src/pages/Chat.tsx`。

## プロジェクト固有の慣習（重要）
- Bun を主に想定するが `package.json` のスクリプトは標準的（`vite`, `tauri`）。CI/開発環境で Bun がない場合は npm で代替可能。
- `src-tauri` はネイティブコマンドのソースなので破壊的変更は慎重に。Tauri プラグインは Rust 側と JS 側で両方を更新する必要あり（`Cargo.toml` と `package.json`）。
- 翻訳は JSONC（コメント付き JSON）。`i18n.ts` はコメント削除ロジックを含むため、翻訳追加時は JSONC 構文を守る。

## デバッグのヒント
- フロントの高速確認は `bun run dev`（Vite）で行い、ネイティブ連携を確認するには `bun run tauri dev`。
- Rust 側のログは Tauri 実行コンソールに出力される。Visual Studio Code では `src-tauri` 配下を Rust 拡張で開いてデバッグ可能。

## 参考ファイル（すぐ参照すべき）
- `app/src/App.tsx` — アプリ全体の起動・ビュー遷移
- `app/src/hooks/useChatSessions.ts` — 会話ロジックの中心
- `app/src/utils/i18n.ts` と `app/public/lang/*.jsonc` — 国際化フロー
- `app/src-tauri/src/lib.rs` — Tauri コマンド登録例（`greet`）
- `app/package.json` — 開発 / ビルド用スクリプト

## 追加の注意と確認依頼
- このファイルはコードベースから検出可能な実装パターンに限定しています。もしローカルの開発フロー（環境変数、gcloud の前提、CI 設定など）で追記が必要な点があれば教えてください。

---
更新案の内容はここまでです。修正や補足して欲しい箇所（例：CI 設定、テスト手順、秘密情報の扱い方）があれば指示ください。
