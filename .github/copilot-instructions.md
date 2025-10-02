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
- Use async/await for Tauri commands
- Follow Rust conventions for backend code

### Commands and Scripts
- `npm run dev` / `bun run dev` - Start Vite dev server (port 1420)
- `npm run build` / `bun run build` - TypeScript compilation + Vite build
- `npm run tauri dev` - Start Tauri development mode
- `npm run tauri build` - Build production application

### Tauri Commands
- Use `invoke` from `@tauri-apps/api/core` to call Rust functions
- Rust commands are defined with `#[tauri::command]` attribute
- Register commands in `lib.rs` using `invoke_handler!` macro

### Port Configuration
- Vite dev server: port 1420 (strict)
- HMR (Hot Module Reload): port 1421

### Important Notes
- Do not modify `src-tauri` directory unless adding/modifying Rust commands
- Vite is configured to ignore watching `src-tauri` directory
- The app uses React StrictMode for development

### Adding New Tauri Commands
1. Define the command in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register it in the `invoke_handler!` macro
3. Call it from React using `invoke("command_name", { args })`

### Adding New Tauri Plugins
1. Add the plugin to `Cargo.toml` in `src-tauri`
2. Add the corresponding npm package to `package.json`
3. Initialize the plugin in `lib.rs` using `.plugin()` in the Builder
4. Update TauriPlugin.md documentation

## Common Patterns
- State management: Use React `useState` hook
- Async operations: Use `async/await` with Tauri `invoke`
- Styling: CSS with support for light/dark mode (prefers-color-scheme)
- Type safety: Ensure TypeScript types are properly defined for Tauri commands
