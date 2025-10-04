# グローバルクリーンアップマネージャー

## 概要

複数セッション・複数ワークスペースに対応した自動クリーンアップシステムです。一時ファイルの管理を集中化し、メモリリークやディスク容量の無駄を防ぎます。

## 主な機能

### 1. 自動クリーンアップ
- **定期実行**: 1分ごとに古い一時ファイルをチェック
- **自動削除**: 10分以上経過したファイルを自動削除
- **バックグラウンド処理**: ユーザー操作に影響を与えない

### 2. 複数セッション対応
- 各セッションが独立した一時ディレクトリを持つ
- セッション間で干渉しない
- セッション終了時に即座にクリーンアップ可能

### 3. 複数ワークスペース対応
- ワークスペースごとに一時ファイルを管理
- ワークスペース切り替え時に前のワークスペースをクリーンアップ
- 各ワークスペースが独立して動作

## 使用方法

### 基本的な使い方

```typescript
import { cleanupManager } from './utils/cleanupManager';

// ファイルを登録
cleanupManager.register(
  '/path/to/temp/file.json',
  'workspace-id',
  'session-id',
  'file'
);

// ディレクトリを登録
cleanupManager.register(
  '/path/to/temp/directory',
  'workspace-id',
  'session-id',
  'directory'
);
```

### セッション完了時のクリーンアップ

```typescript
// 特定のセッションをクリーンアップ
await cleanupManager.cleanupSession('session-id', 'workspace-id');
```

### ワークスペース切り替え時のクリーンアップ

```typescript
// ワークスペース全体をクリーンアップ
await cleanupManager.cleanupWorkspace('workspace-id');
```

### 統計情報の取得

```typescript
const stats = cleanupManager.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Oldest file age: ${stats.oldestAge}s`);
console.log(`Youngest file age: ${stats.youngestAge}s`);
```

## アーキテクチャ

### クリーンアップエントリ

各一時ファイル/ディレクトリは以下の情報と共に登録されます：

```typescript
interface CleanupEntry {
  path: string;           // ファイル/ディレクトリのパス
  workspaceId: string;    // 所属するワークスペースID
  sessionId: string;      // 所属するセッションID
  createdAt: number;      // 作成時刻（ミリ秒）
  type: 'file' | 'directory';  // タイプ
}
```

### レジストリ

- `Map<string, CleanupEntry>` でエントリを管理
- キーは `${workspaceId}:${sessionId}:${path}` の形式
- O(1) でエントリの追加・削除・検索が可能

### 自動クリーンアップタスク

1. **起動**: アプリ起動時に自動開始
2. **実行間隔**: 60秒ごと
3. **削除基準**: 作成から10分以上経過したエントリ
4. **停止**: ページアンロード時に自動停止

## 統合ポイント

### 1. geminiCUI.ts

```typescript
// 会話履歴ファイル作成時に登録
cleanupManager.register(filePath, workspaceId, sessionId, 'file');

// 一時ディレクトリ作成時に登録
cleanupManager.register(workspaceTempDir, workspaceId, sessionId, 'directory');
```

### 2. App.tsx

```typescript
// ワークスペース切り替え時にクリーンアップ
await cleanupManager.cleanupWorkspace(currentWorkspace.id);
```

## 設定

### タイミング設定

```typescript
// cleanupManager.ts で設定可能
private readonly CLEANUP_INTERVAL_MS = 60 * 1000;      // チェック間隔（1分）
private readonly MAX_AGE_MS = 10 * 60 * 1000;          // 最大保持時間（10分）
```

### カスタマイズ例

**短命ファイル（開発用）:**
```typescript
CLEANUP_INTERVAL_MS = 10 * 1000;     // 10秒ごとにチェック
MAX_AGE_MS = 30 * 1000;              // 30秒で削除
```

**長命ファイル（本番用）:**
```typescript
CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5分ごとにチェック
MAX_AGE_MS = 30 * 60 * 1000;         // 30分で削除
```

## メリット

### 1. 安全性
- ✅ 複数セッション同時実行でも競合しない
- ✅ ワークスペース切り替えでも問題なし
- ✅ エラー時も確実にクリーンアップ

### 2. パフォーマンス
- ✅ メモリリークを防止
- ✅ ディスク容量の無駄を削減
- ✅ バックグラウンド処理で UI に影響なし

### 3. 利便性
- ✅ 自動管理で手動クリーンアップ不要
- ✅ 統計情報で状態を可視化
- ✅ 手動クリーンアップも可能

## トラブルシューティング

### ファイルが削除されない

**原因**: ファイルが使用中、または登録されていない

**解決策**:
```typescript
// 手動で全クリーンアップ
await cleanupManager.cleanupAll();

// 統計を確認
const stats = cleanupManager.getStats();
console.log(stats);
```

### メモリ使用量が増える

**原因**: レジストリにエントリが溜まっている

**解決策**:
```typescript
// 定期的にクリーンアップ
setInterval(() => {
  cleanupManager.performAutoCleanup();
}, 60000);
```

## 今後の拡張

### 優先度付きクリーンアップ
```typescript
interface CleanupEntry {
  // ... existing fields
  priority: 'high' | 'normal' | 'low';
}
```

### クリーンアップポリシー
```typescript
interface CleanupPolicy {
  maxAge: number;
  maxSize: number;
  priority: 'age' | 'size' | 'priority';
}
```

### イベント通知
```typescript
cleanupManager.on('cleanup', (entry) => {
  console.log(`Cleaned up: ${entry.path}`);
});
```

## まとめ

グローバルクリーンアップマネージャーにより、以下が実現されました：

- ✅ 複数セッション・ワークスペース対応
- ✅ 自動クリーンアップ
- ✅ 安全で効率的なリソース管理
- ✅ 高い汎用性と利便性
