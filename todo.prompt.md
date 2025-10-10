## GeminiGUI 設定画面 UI アップデート TODOリスト

### 概要
GeminiGUI プロジェクトの設定画面において、古いセットアップ UI が表示される問題を解決し、新しい UI デザインへ完全に移行してください。古い UI コンポーネントや関連コードはすべて削除し、最新の UI/UX ガイドラインに準拠した設定画面を実装します。

---

### Phase 1: 現状調査・計画

- [ ] `app` ディレクトリ内の設定画面関連ファイル（例: `app/src/settings`, `app/src/components/Settings*` など）を特定し、古い UI 実装箇所をリストアップする
- [ ] 新しい設定画面のUI仕様・デザインガイドラインを `docs/` または `README.md` にまとめる（必要に応じて）

### Phase 2: 新UI実装

- [ ] `app/src/components/Settings*` または該当するファイルで新しいUIコンポーネントを作成・既存のものをアップデート
  - TypeScript/React（または使用中のフレームワーク）で最新UIを実装
  - 必要に応じて `app/src/styles/` のCSSも更新
- [ ] 古いUIコンポーネント・スタイル・ロジックをすべて削除
  - 例: `app/src/components/OldSettings*` など
- [ ] 設定画面のルーティングや表示ロジック（例: `app/src/App.tsx` や `app/src/routes/`）を新UIに合わせて修正

### Phase 3: 統合・テスト

- [ ] 新しい設定画面の動作確認（全プラットフォーム: Windows, macOS, Linux）
- [ ] 既存のユニットテスト・E2Eテスト（例: `app/tests/`）を新UIに合わせて修正・追加
- [ ] 古いUIが一切表示されないことを確認

### Phase 4: ドキュメント・レビュー

- [ ] 新しい設定画面の使い方・仕様を `docs/` または `README.md` に追記
- [ ] コードレビューを実施し、不要な依存やコードが残っていないか確認

---

#### 受け入れ基準

- 設定画面で新しいUIのみが表示され、古いUI要素・コードが完全に削除されている
- 主要な機能・設定項目が新UIで正しく動作する
- ドキュメントが最新状態に更新されている
- すべてのテストがパスしている

---

#### 参考

- 設定画面の既存実装: `app/src/components/Settings*`, `app/src/App.tsx`
- ドキュメント: `docs/`, `README.md`
- スタイル: `app/src/styles/`