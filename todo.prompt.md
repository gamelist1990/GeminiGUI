## バグ調査およびクロスプラットフォーム互換性向上タスク

以下の手順に従い、GeminiGUIプロジェクト内の潜在的なバグ（Null Pointer例外を含む）や、他のPC・異なる環境で発生しうる問題を特定・修正してください。TypeScript、Rust、Pythonの各主要コンポーネントを対象とします。

---

### Phase 1: 調査・分析

- [ ] `app/` ディレクトリ内のTypeScript/JavaScriptコードで、未初期化変数やNull/Undefinedアクセスの可能性がある箇所を静的解析ツール（例: `tsc`, `eslint`）で検出
- [ ] Rustコード（`Tool/` ディレクトリ等）に対し、`cargo check` および `clippy` を用いてNull参照や未処理のエラーを洗い出し
- [ ] Pythonスクリプト（例: `proxy_server.py`）に対し、`mypy` や `pylint` で型安全性・例外処理漏れを確認
- [ ] OS依存パスや環境変数、ファイルアクセス権限など、クロスプラットフォームで問題となりうる箇所を全体でリストアップ

#### Acceptance Criteria
- 静的解析レポートを `docs/bug_report.md` にまとめる
- 各言語ごとに主要な問題点を箇条書きで記載

---

### Phase 2: 修正・改善

- [ ] `app/` 配下のTypeScriptコードで、NullチェックやOptional Chaining（`?.`）の追加、型定義の厳格化を実施
- [ ] Rustコードで `Option` や `Result` の適切な利用、`unwrap()` の排除、エラーハンドリングの強化
- [ ] Pythonコードで `None` チェック、例外処理（`try/except`）の追加、型アノテーションの明示
- [ ] OS依存コード（パス結合、ファイル操作等）を `pathlib`（Python）、`std::path`（Rust）、`path` モジュール（Node.js）等で抽象化
- [ ] 必要に応じて `.venv/` や依存パッケージのバージョン固定（`requirements-proxy.txt`、`package.json`等）を見直し

#### Acceptance Criteria
- 主要なNull Pointer例外・未初期化変数アクセスが全て修正されている
- クロスプラットフォームでの動作に影響するコードが抽象化・修正されている

---

### Phase 3: テスト・検証

- [ ] 各修正箇所に対し、ユニットテスト・統合テストを追加（`app/`、`Tool/`、`proxy_server.py`等）
- [ ] Windows, macOS, Linuxの各環境で主要機能の動作確認
- [ ] テスト結果・動作確認内容を `docs/bug_report.md` に追記

#### Acceptance Criteria
- すべてのテストがパスし、主要機能が各OSで正常動作すること

---

### Phase 4: ドキュメント更新

- [ ] 修正内容・既知の制約事項を `README.md` および `docs/bug_report.md` に明記
- [ ] 必要に応じて `TauriPlugin.md` など関連ドキュメントも更新

#### Acceptance Criteria
- ドキュメントに修正内容・再発防止策・クロスプラットフォーム対応状況が明記されている

---

**備考:**  
各タスクの進捗・課題は `docs/bug_report.md` に随時記録してください。  
修正は必ずブランチを分けて行い、プルリクエスト時にレビュワーが再現・検証できるようにしてください。