# Gemini CLI Options Reference

このドキュメントは、Gemini CLIでサポートされているすべてのオプションと設定をまとめたものです。

## 基本的な使い方

```bash
gemini [options] [command]
```

Gemini CLI - インタラクティブCLIを起動します。非インタラクティブモードには `-p/--prompt` を使用します。

## コマンド

### `gemini [promptWords...]` (デフォルト)
Gemini CLIを起動します。

### `gemini mcp`
MCPサーバーを管理します。

### `gemini extensions <command>`
Gemini CLI拡張機能を管理します。

## オプション

### テレメトリー関連（非推奨）
すべてのテレメトリーオプションは、将来のバージョンで削除される予定です。代わりに `settings.json` を使用してください。

- `--telemetry` - テレメトリーを有効化
  - 型: `boolean`
  - 推奨: `settings.json` の `telemetry.enabled` を使用

- `--telemetry-target` - テレメトリーのターゲット（local または gcp）
  - 型: `string`
  - 選択肢: `"local"`, `"gcp"`
  - 推奨: `settings.json` の `telemetry.target` を使用

- `--telemetry-otlp-endpoint` - テレメトリーのOTLPエンドポイント
  - 型: `string`
  - 推奨: `settings.json` の `telemetry.otlpEndpoint` を使用

- `--telemetry-otlp-protocol` - テレメトリーのOTLPプロトコル（grpc または http）
  - 型: `string`
  - 選択肢: `"grpc"`, `"http"`
  - 推奨: `settings.json` の `telemetry.otlpProtocol` を使用

- `--telemetry-log-prompts` - ユーザープロンプトのログ記録を有効化
  - 型: `boolean`
  - 推奨: `settings.json` の `telemetry.logPrompts` を使用

- `--telemetry-outfile` - テレメトリー出力を指定ファイルにリダイレクト
  - 型: `string`
  - 推奨: `settings.json` の `telemetry.outfile` を使用

### デバッグとプロキシ

- `-d, --debug` - デバッグモードで実行
  - 型: `boolean`
  - デフォルト: `false`

- `--proxy` - Geminiクライアントのプロキシ（例: `schema://user:password@host:port`）
  - 型: `string`
  - 推奨: `settings.json` の `proxy` を使用（非推奨）

### モデルとプロンプト

- `-m, --model` - 使用するモデル
  - 型: `string`

- `-p, --prompt` - プロンプト。stdinの入力に追加されます
  - 型: `string`
  - 非推奨: 位置引数のプロンプトを使用してください

- `-i, --prompt-interactive` - 提供されたプロンプトを実行し、インタラクティブモードで続行
  - 型: `string`

### サンドボックス

- `-s, --sandbox` - サンドボックスで実行
  - 型: `boolean`

- `--sandbox-image` - サンドボックスイメージURI
  - 型: `string`
  - 推奨: `settings.json` の `tools.sandbox` を使用（非推奨）

### ファイルとコンテキスト

- `-a, --all-files` - すべてのファイルをコンテキストに含める
  - 型: `boolean`
  - デフォルト: `false`
  - **非推奨**: 代わりにアプリケーション内で `@` includesを使用してください

- `--include-directories` - ワークスペースに含める追加ディレクトリ（カンマ区切りまたは複数の`--include-directories`）
  - 型: `array`
  - **使用例**: `--include-directories ../lib,../docs` または `--include-directories ../lib --include-directories ../docs`

### UI設定

- `--show-memory-usage` - ステータスバーにメモリ使用量を表示
  - 型: `boolean`
  - デフォルト: `false`
  - 推奨: `settings.json` の `ui.showMemoryUsage` を使用（非推奨）

- `--screen-reader` - アクセシビリティのためのスクリーンリーダーモードを有効化
  - 型: `boolean`

### 承認モード（Approval Mode）⭐

- `-y, --yolo` - すべてのアクションを自動的に承認（YOLOモード）
  - 型: `boolean`
  - デフォルト: `false`
  - 詳細: https://www.youtube.com/watch?v=xvFZjo5PgG0

- `--approval-mode` - 承認モードを設定
  - 型: `string`
  - 選択肢: `"default"`, `"auto_edit"`, `"yolo"`
  - **default**: 承認のプロンプトを表示
  - **auto_edit**: 編集ツールを自動承認
  - **yolo**: すべてのツールを自動承認

### チェックポイントとバージョン管理

- `-c, --checkpointing` - ファイル編集のチェックポイントを有効化
  - 型: `boolean`
  - デフォルト: `false`
  - 推奨: `settings.json` の `general.checkpointing.enabled` を使用（非推奨）

### 実験的機能

- `--experimental-acp` - エージェントをACPモードで起動
  - 型: `boolean`

### MCP（Model Context Protocol）とツール

- `--allowed-mcp-server-names` - 許可されたMCPサーバー名
  - 型: `array`

- `--allowed-tools` - 確認なしで実行できるツール
  - 型: `array`

### 拡張機能

- `-e, --extensions` - 使用する拡張機能のリスト。指定しない場合、すべての拡張機能が使用されます
  - 型: `array`

- `-l, --list-extensions` - 利用可能な拡張機能をすべてリストして終了
  - 型: `boolean`

### 出力

- `-o, --output-format` - CLI出力のフォーマット
  - 型: `string`
  - 選択肢: `"text"`, `"json"`
  - **GeminiGUIでの使用**: `json`形式を使用して統計情報を取得

### その他

- `-v, --version` - バージョン番号を表示
  - 型: `boolean`

- `-h, --help` - ヘルプを表示
  - 型: `boolean`

---

## GeminiGUIでの実装状況

### ✅ 実装済み

1. **`-p, --prompt`** - プロンプト送信
2. **`-o, --output-format`** - JSON出力形式（統計情報取得）
3. **`--approval-mode`** - 承認モード選択（Settings画面）
4. **`--include-directories`** - ディレクトリ指定（`#folder`でサポート）
5. **`@includes`** - `#codebase`, `#file:path`でサポート

### 🔄 今後の実装候補

1. **`-m, --model`** - モデル選択
2. **`-s, --sandbox`** - サンドボックス実行
3. **`--allowed-tools`** - ツール制限
4. **`-e, --extensions`** - 拡張機能管理
5. **`-d, --debug`** - デバッグモード

---

## 使用例

### 基本的な使い方
```bash
gemini -p "このコードを説明して" -o json
```

### ディレクトリを含める
```bash
gemini --include-directories ../lib,../docs -p "プロジェクト構造を説明して"
```

### YOLOモード（自動承認）
```bash
gemini --yolo -p "バグを修正して"
# または
gemini --approval-mode yolo -p "バグを修正して"
```

### Auto Editモード（編集のみ自動承認）
```bash
gemini --approval-mode auto_edit -p "コードを改善して"
```

### @ includesを使用
```bash
gemini @codebase @file:src/main.ts -p "このファイルを説明して"
```

---

## 非推奨のオプション

以下のオプションは将来のバージョンで削除される予定です：

- `--telemetry` 系のすべてのオプション → `settings.json` を使用
- `-p, --prompt` → 位置引数のプロンプトを使用
- `-a, --all-files` → `@` includesを使用
- `-c, --checkpointing` → `settings.json` の `general.checkpointing.enabled` を使用
- `--proxy` → `settings.json` の `proxy` を使用
- `--sandbox-image` → `settings.json` の `tools.sandbox` を使用
- `--show-memory-usage` → `settings.json` の `ui.showMemoryUsage` を使用

---

## 参考リンク

- YOLOモードの詳細: https://www.youtube.com/watch?v=xvFZjo5PgG0
- Gemini CLI公式ドキュメント: （リンクを追加）

---

**最終更新**: 2025年10月2日
**GeminiGUIバージョン**: 0.1.0
