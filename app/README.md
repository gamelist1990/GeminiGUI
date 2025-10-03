# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## React DevTools の利用

GeminiGUI の開発時には [React DevTools](https://react.dev/link/react-devtools) を導入すると、コンポーネントツリーや hooks の状態を確認できて便利です。

1. 上記リンク先から **Standalone (デスクトップ) 版** をダウンロードします。macOS / Windows どちらも同梱されており、Windows の場合は `React Developer Tools.exe` を起動するだけで利用できます。
2. もしくは、プロジェクトルートで `npx react-devtools` を実行してスタンドアロン版を起動することも可能です。
3. `bun run tauri dev` などでアプリを起動した状態で React DevTools を開くと、自動的に `ws://localhost:8097` に接続され、アプリの React ツリーを検査できます。
4. 接続できない場合は、Tauri アプリを再起動するか DevTools 側の `Settings > Connection` でホスト名とポート (`localhost:8097`) を再入力してください。

開発ビルド中のみ DevTools が利用できる点に注意してください。プロダクションビルドには同梱されません。
