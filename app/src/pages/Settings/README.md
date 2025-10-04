# Settings Module - モジュール化された設定画面

## 📁 ファイル構造

```
Settings/
├── index.tsx                    # エクスポートモジュール（共通CSS含む）
├── index.css                    # 共通スタイル（カテゴリコンテナ、カラーテーマなど）
├── GeneralSettings.tsx          # 一般設定（言語・テーマ）
├── GeneralSettings.css          # 一般設定のスタイル
├── AISettings.tsx               # AI設定（モデル・APIキー・OpenAI）
├── AISettings.css               # AI設定のスタイル
├── ToolsSettings.tsx            # ツール設定（承認モード・ツール管理）
├── ToolsSettings.css            # ツール設定のスタイル
├── AppearanceSettings.tsx       # 外観設定（テーマプレビュー）
├── AppearanceSettings.css       # 外観設定のスタイル
├── SystemSettings.tsx           # システム設定（セットアップ・バックアップ）
└── SystemSettings.css           # システム設定のスタイル
```

## 🎯 設計思想

### モジュール化のメリット
1. **責任の分離**: 各設定カテゴリが独立したコンポーネント
2. **保守性向上**: 特定の設定を変更する際、該当ファイルのみ編集
3. **スタイル管理**: コンポーネントごとにCSSを分離し、スタイルの衝突を防止
4. **拡張性**: 新しい設定カテゴリを簡単に追加可能

### CSS設計原則
- **共通スタイル**: `index.css`にカテゴリコンテナやカラーテーマ変数を定義
- **個別スタイル**: 各`.css`ファイルにそのタブ固有のスタイルを配置
- **BEM風命名**: `.setting-card`, `.card-header`, `.card-content`など一貫した命名
- **レスポンシブ**: 全CSSファイルにメディアクエリを実装

## 📝 各コンポーネントの役割

### GeneralSettings.tsx / .css
- **機能**: 言語選択、テーマ選択（ライト/ダーク）
- **スタイル**: セレクトボックス、ラジオグループの基本スタイル

### AISettings.tsx / .css
- **機能**: モデル選択、カスタムAPIキー、OpenAI設定、会話整理設定
- **スタイル**: 入力フィールド、サブ設定、トグル、数値入力

### ToolsSettings.tsx / .css
- **機能**: 承認モード設定、ツール有効/無効管理
- **スタイル**: ボタン、ツールパネルコンテナ、ステータスバッジ

### AppearanceSettings.tsx / .css
- **機能**: テーマプレビュー、将来の外観設定
- **スタイル**: プレビューカード、選択状態、ビジュアル表現

### SystemSettings.tsx / .css
- **機能**: セットアップ確認、バックアップ警告
- **スタイル**: 警告カード、ステータスメッセージ、バックアップチップス

## 🚀 新しい設定カテゴリの追加方法

1. **コンポーネントとCSSを作成**:
   ```tsx
   // NewCategorySettings.tsx
   import React from 'react';
   import { Settings } from '../../types';
   import { t } from '../../utils/i18n';
   import './NewCategorySettings.css';
   
   interface NewCategorySettingsProps {
     settings: Settings;
     onUpdateSettings: (updates: Partial<Settings>) => void;
   }
   
   export const NewCategorySettings: React.FC<NewCategorySettingsProps> = 
     ({ settings, onUpdateSettings }) => {
     return (
       <div className="settings-category">
         <h2>{t('settings.categories.newCategory.title')}</h2>
         {/* 設定項目 */}
       </div>
     );
   };
   ```

2. **index.tsxにエクスポートを追加**:
   ```tsx
   export { NewCategorySettings } from './NewCategorySettings';
   ```

3. **SettingsPage.tsxに統合**:
   ```tsx
   import { NewCategorySettings } from './Settings/NewCategorySettings';
   
   // categories配列に追加
   {
     id: 'newCategory',
     icon: '🆕',
     label: 'settings.categories.newCategory.label',
     description: 'settings.categories.newCategory.description'
   }
   
   // renderCategoryContent()に追加
   case 'newCategory':
     return <NewCategorySettings {...props} />;
   ```

4. **翻訳ファイルに追加** (`en_US.jsonc`, `ja_JP.jsonc`):
   ```jsonc
   "categories": {
     "newCategory": {
       "title": "New Category",
       "label": "New Category Settings",
       "description": "Description of new category"
     }
   }
   ```

## 🎨 スタイルガイド

### カラーテーマ変数
```css
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}
```

### 共通クラス
- `.setting-card`: 設定項目のカード
- `.card-header`: カードヘッダー
- `.card-content`: カード本体
- `.setting-select`: セレクトボックス
- `.setting-input`: テキスト入力
- `.radio-group`: ラジオボタングループ
- `.setting-description`: 説明文

### 状態クラス
- `.warning`: 警告状態（オレンジ）
- `.highlight`: 強調状態（グリーン）
- `.disabled`: 無効状態

## 📱 レスポンシブ対応

全CSSファイルに以下のブレークポイントを実装:
- `1024px`: タブレット対応
- `768px`: モバイル対応

## 🔧 保守・更新時の注意点

1. **スタイル変更時**: 該当するコンポーネントの`.css`ファイルのみを編集
2. **共通スタイル追加時**: `index.css`に追加（全カテゴリに影響）
3. **新機能追加時**: 対応する`.tsx`と`.css`の両方を更新
4. **翻訳追加時**: `t()`関数を使用し、翻訳ファイルにキーを追加

## ✅ 完成状態の確認

```bash
# 開発サーバー起動
bun tauri dev

# 設定画面を開く
# 1. ワークスペース選択画面で「設定」をクリック
# 2. サイドバーで各カテゴリを切り替え
# 3. スタイルが正しく適用されているか確認
```

---

**作成日**: 2025年10月5日  
**バージョン**: 1.0.0  
**管理**: モジュール構造による設定画面の実装
