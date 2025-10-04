# CLAUDE AI Assistant - GeminiGUI Project Guide

## 🎯 Project Overview
GeminiGUI is a sophisticated desktop application that provides a modern GUI interface for interacting with both Gemini AI and OpenAI APIs. Built with Tauri v2, React 19, TypeScript, and Vite, it offers a workspace-based chat interface with advanced features including tool execution, session management, and multi-API support.

## 🛠️ Tech Stack
- **Frontend**: React 19.1.0, TypeScript 5.8.3, Vite 7.0.4
- **Backend**: Tauri v2 (Rust)
- **Build Tool**: Vite with Tauri CLI
- **Package Manager**: Bun (primary), npm/yarn (compatible)
- **AI APIs**: Gemini AI (via PowerShell CLI), OpenAI (Function Calling API)
- **UI Framework**: Custom React components with CSS modules

## 📁 Detailed Project Structure
```
/app
  ├── src/                          # React TypeScript source code
  │   ├── App.tsx                   # Main application component with routing
  │   ├── App.css                   # Global styles
  │   ├── main.tsx                  # React entry point
  │   ├── vite-env.d.ts            # Vite type definitions
  │   ├── AITool/                   # Modern AI Tool System
  │   │   ├── modernTools.ts        # Tool definitions (JSON Schema)
  │   │   └── toolExecutor.ts       # Tool execution engine (Rust/Tauri)
  │   ├── components/               # Reusable UI components
  │   │   └── ModernToolSettingsPanel.tsx  # Tool configuration UI
  │   ├── hooks/                    # Custom React hooks (business logic)
  │   │   ├── useChatSessions.ts    # Session CRUD, message handling
  │   │   ├── useSettings.ts        # Global settings management
  │   │   └── useWorkspaces.ts      # Workspace management
  │   ├── pages/                    # Main application views
  │   │   ├── Chat/                 # Chat interface components
  │   │   │   ├── index.tsx         # Main chat page
  │   │   │   ├── ChatMessageBubble.tsx  # Message rendering
  │   │   │   ├── ProcessingModal.tsx    # Loading states
  │   │   │   ├── StatsModal.tsx    # Statistics display
  │   │   │   ├── types.tsx         # Chat-specific types
  │   │   │   └── utils.tsx         # Chat utilities
  │   │   ├── Settings/             # Settings panel (category-based)
  │   │   │   ├── index.tsx         # Settings container
  │   │   │   ├── GeneralSettings.tsx    # Language, theme
  │   │   │   ├── AISettings.tsx    # AI model configuration
  │   │   │   ├── ToolsSettings.tsx # Tool enable/disable
  │   │   │   ├── AppearanceSettings.tsx # UI customization
  │   │   │   └── SystemSettings.tsx     # System info, logs
  │   │   ├── Chat.tsx              # Legacy chat wrapper
  │   │   ├── Settings.tsx          # Legacy settings wrapper
  │   │   ├── SettingsPage.tsx      # Modern settings page
  │   │   ├── WorkspaceSelection.tsx # Workspace picker
  │   │   └── Setup.tsx             # Initial setup wizard
  │   ├── styles/                   # Global style definitions
  │   │   └── theme.css             # Theme variables, colors
  │   ├── types/                    # TypeScript type definitions
  │   │   └── index.ts              # Core interfaces (Workspace, Settings, etc.)
  │   └── utils/                    # Utility functions and APIs
  │       ├── configAPI.ts          # Config persistence (filesystem)
  │       ├── geminiCUI.ts          # Gemini AI integration (PowerShell)
  │       ├── openaiAPI.ts          # OpenAI API integration (Function Calling)
  │       ├── modernToolSystem.ts   # Tool system compatibility layer
  │       ├── cleanupManager.ts     # Temporary file cleanup
  │       ├── i18n.ts               # Internationalization (JSONC)
  │       ├── workspace.ts          # Workspace file scanning
  │       ├── setupAPI.ts           # Setup wizard logic
  │       ├── cloudSetup.ts         # Google Cloud setup
  │       ├── storage.ts            # Data serialization
  │       ├── streamingFetch.ts     # Streaming HTTP client
  │       ├── toolManager.ts        # Legacy tool manager
  │       ├── powershellExecutor.ts # PowerShell command execution
  │       ├── localFileSystem.ts    # File system operations
  │       └── htmlUtils.ts          # HTML/Markdown rendering
  ├── src-tauri/                    # Rust/Tauri backend
  │   ├── src/
  │   │   ├── lib.rs                # Tauri commands and handlers
  │   │   ├── main.rs               # Application entry point
  │   │   └── tools/                # Rust tool implementations
  │   ├── build.rs                  # Build script
  │   ├── Cargo.toml                # Rust dependencies
  │   └── tauri.conf.json           # Tauri configuration
  ├── public/                       # Static assets
  │   └── lang/                     # Translation files
  │       ├── en_US.jsonc           # English translations
  │       ├── ja_JP.jsonc           # Japanese translations
  │       └── README.md             # Translation guide
  ├── index.html                    # HTML entry point
  ├── package.json                  # Node.js dependencies and scripts
  ├── tsconfig.json                 # TypeScript configuration
  ├── tsconfig.node.json            # Node-specific TS config
  └── vite.config.ts                # Vite build configuration
```

## 🔌 Tauri Plugins
The project uses the following Tauri plugins:
- **Official Plugins**:
  - `tauri-plugin-os` - OS information and platform detection
  - `tauri-plugin-notification` - System notifications
  - `tauri-plugin-fs` - File system access (read/write/delete)
  - `tauri-plugin-shell` - Shell command execution (PowerShell, etc.)
  - `tauri-plugin-dialog` - Native file/folder dialogs
  - `tauri-plugin-opener` - Open files/URLs with default apps
  - `tauri-plugin-http` - HTTP client for API requests
- **Third-Party Plugins**:
  - `tauri-controls` - Custom window controls (minimize, maximize, close)

## 🎨 Code Style & Best Practices
- **TypeScript**: Strict mode, explicit types for all public APIs
- **React**: Functional components with hooks (React 19 patterns)
- **Error Handling**: Try-catch with proper error propagation
- **Logging**: Consistent console.log patterns with prefixes (e.g., `[Chat]`, `[OpenAI]`)
- **File Naming**: PascalCase for components, camelCase for utilities
- **CSS**: Component-scoped CSS modules, global theme variables in `theme.css`

## 🏗️ Architecture Deep Dive

### Application Flow
1. **Initialization** (`App.tsx`):
   - Load global configuration from `~/Documents/PEXData/GeminiGUI/config.json`
   - Initialize i18n system with user's language preference
   - Check for Gemini/Cloud authentication status
   - Route to appropriate view (Setup → Workspace Selection → Chat)

2. **Workspace Management** (`useWorkspaces` hook):
   - Store workspace list with favorites and recent access
   - Persist to filesystem via `Config` class
   - Track last opened timestamp for sorting

3. **Chat Session Lifecycle** (`useChatSessions` hook):
   - Create session with unique ID
   - Store messages in `~/Documents/PEXData/GeminiGUI/Chatrequest/{workspaceId}/sessions/{sessionId}.json`
   - Calculate token usage per message and session
   - Support for message editing, resending, and compaction

4. **AI Integration** (Dual API support):
   - **Gemini**: PowerShell CLI (`gemini.ps1`) with text-based tool instructions
   - **OpenAI**: Direct API calls with Function Calling (tools as JSON schema)
   - Unified interface via `callAI()` function
   - Streaming and async response modes

### Modern Tool System
**Location**: `app/src/AITool/`

**Architecture**:
- **Tool Definitions** (`modernTools.ts`):
  - JSON Schema-based definitions (OpenAI/Anthropic/Gemini compatible)
  - Categories: File Operations, Directory Operations, Search Tools
  - 7 core tools: `read_file`, `write_file`, `delete_file`, `move_file`, `list_directory`, `create_directory`, `search_files`
  
- **Tool Executor** (`toolExecutor.ts`):
  - Executes tools via Tauri commands (Rust backend)
  - Security: Workspace boundary validation
  - Logging: Detailed execution traces with timing
  - Error handling: Structured error responses

**Tool Execution Flow**:
1. AI requests tool via Function Call (OpenAI) or text instruction (Gemini)
2. Frontend parses tool call (name + arguments)
3. `executeModernTool()` validates and routes to Rust command
4. Rust executes file operation securely within workspace
5. Result returned to AI for final response generation

**OpenAI Function Calling Integration**:
- Initial request: AI decides to use tool → returns `tool_calls`
- Tool execution: Frontend executes tools, collects results
- Follow-up request: Results sent back to AI as `tool` role messages
- Final response: AI generates human-readable explanation

### Configuration System
**Location**: `app/src/utils/configAPI.ts`

**Storage Structure**:
```
~/Documents/PEXData/GeminiGUI/
├── config.json                    # Global settings
├── workspaces.json                # Workspace list
└── Chatrequest/                   # Per-workspace data
    └── {workspaceId}/
        ├── sessions/
        │   └── {sessionId}.json   # Chat messages
        └── temp/                  # Temporary files
            └── GeminiTemp/        # Auto-cleaned temp directory
```

**Config Class API**:
- `load()`: Read configuration from disk
- `save()`: Write configuration to disk
- `get(key)`: Get configuration value
- `set(key, value)`: Set configuration value
- Automatic directory creation and error handling

### Cleanup Manager
**Location**: `app/src/utils/cleanupManager.ts`

**Purpose**: Automatic cleanup of temporary files created during AI interactions

**Features**:
- **Registry**: Tracks all temporary files/directories with metadata
- **Auto-cleanup**: Runs every 60 seconds, deletes files older than 10 minutes
- **Session-based**: Associates temp files with workspace + session
- **Manual cleanup**: `cleanupSession()` for immediate cleanup
- **Workspace cleanup**: `cleanupWorkspace()` for full workspace cleanup

**Usage Pattern**:
```typescript
// Register temp file
cleanupManager.register(tempPath, workspaceId, sessionId, 'file');

// Auto-cleanup will handle deletion after 10 minutes
// Or manual cleanup when session ends
cleanupManager.cleanupSession(workspaceId, sessionId);
```

### Internationalization (i18n)
**Location**: `app/src/utils/i18n.ts`, `app/public/lang/`

**Implementation**:
- **Format**: JSONC (JSON with comments)
- **Structure**: Nested keys (e.g., `settings.categories.general.title`)
- **Loading**: Async loading from `/public/lang/{language}.jsonc`
- **Fallback**: Returns key string if translation missing
- **API**: `t('key')` for translation, `setLanguage()` to switch

**Translation File Structure**:
```jsonc
{
  "settings": {
    "categories": {
      "general": {
        "title": "General Settings",
        "description": "Language, theme, and basic preferences"
      }
    }
  }
}
```

## 🔑 Critical Files Reference

### Core Application Files
- **`app/src/App.tsx`**: Main routing logic, global state initialization
- **`app/src/pages/Chat/index.tsx`**: Chat interface, AI interaction logic
- **`app/src/pages/SettingsPage.tsx`**: Unified settings interface
- **`app/src/pages/WorkspaceSelection.tsx`**: Workspace picker with favorites

### Business Logic Hooks
- **`app/src/hooks/useChatSessions.ts`**: Session CRUD, message sending, token tracking
- **`app/src/hooks/useSettings.ts`**: Settings management, persistence
- **`app/src/hooks/useWorkspaces.ts`**: Workspace CRUD, favorites, recent list

### AI Integration
- **`app/src/utils/geminiCUI.ts`**: Gemini AI integration (PowerShell CLI)
- **`app/src/utils/openaiAPI.ts`**: OpenAI API integration (Function Calling)
- **`app/src/AITool/modernTools.ts`**: Tool definitions (JSON Schema)
- **`app/src/AITool/toolExecutor.ts`**: Tool execution engine

### Utilities
- **`app/src/utils/configAPI.ts`**: Configuration persistence
- **`app/src/utils/cleanupManager.ts`**: Temporary file cleanup
- **`app/src/utils/i18n.ts`**: Internationalization
- **`app/src/utils/workspace.ts`**: Workspace file scanning
- **`app/src/utils/setupAPI.ts`**: Setup wizard logic

### Backend
- **`app/src-tauri/src/lib.rs`**: Tauri commands (file operations, tool execution)
- **`app/src-tauri/tauri.conf.json`**: Tauri configuration (permissions, window settings)

## 🚀 Development Commands

### Prerequisites
- **Bun** (recommended) or npm/yarn
- **Rust** (for Tauri backend)
- **PowerShell** (Windows only, for Gemini CLI)

### Setup
```powershell
cd app
bun install          # or: npm install
```

### Development
```powershell
bun run dev          # Frontend only (Vite dev server)
bun run tauri dev    # Full app with Tauri backend
```

### Building
```powershell
bun run build        # Build frontend assets
bun run tauri build  # Build complete application bundle
```

### Other
```powershell
bun run preview      # Preview built frontend
```

## 🔧 Common Development Patterns

### Adding a New Tauri Command
1. Add command in `app/src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Hello {}", arg))
}
```

2. Register in `invoke_handler!`:
```rust
tauri::generate_handler![greet, my_command]
```

3. Call from frontend:
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<string>('my_command', { arg: 'World' });
```

### Adding a Translation
1. Edit `app/public/lang/en_US.jsonc` and `ja_JP.jsonc`:
```jsonc
{
  "myFeature": {
    "title": "My Feature",
    "description": "Description here"
  }
}
```

2. Use in component:
```typescript
import { t } from '../utils/i18n';
<h1>{t('myFeature.title')}</h1>
```

### Adding a New Tool
1. Define in `app/src/AITool/modernTools.ts`:
```typescript
export const MY_TOOL: ModernToolDefinition = {
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'What the tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'First parameter' }
      },
      required: ['param1']
    }
  }
};
```

2. Implement execution in `app/src/AITool/toolExecutor.ts`:
```typescript
case 'my_tool':
  // Execute tool logic
  return { success: true, result: data };
```

3. Add to tool array and exports

### Managing Settings
```typescript
// In a component
const { settings, updateSettings } = useSettings();

// Update a setting
updateSettings({ theme: 'dark' });

// Setting is automatically persisted to disk
```

### Working with Chat Sessions
```typescript
const { sessions, currentSessionId, createSession, addMessage } = useChatSessions(workspaceId);

// Create new session
const sessionId = await createSession('Session Name');

// Send message
addMessage(sessionId, {
  role: 'user',
  content: 'Hello AI',
  timestamp: new Date()
});
```

## 🐛 Debugging Tips

### Frontend Debugging
- Run `bun run dev` for fast HMR (Hot Module Replacement)
- Use browser DevTools (F12) in Tauri window
- Check console for `[Component]` prefixed logs

### Backend Debugging
- Rust logs appear in Tauri dev console
- Use VS Code with Rust Analyzer extension
- Set breakpoints in `src-tauri/src/` files

### Common Issues
1. **TypeScript errors**: Run `bun run build` to check all types
2. **Tauri plugin errors**: Check `tauri.conf.json` permissions
3. **File system errors**: Verify Tauri FS plugin permissions
4. **Translation missing**: Falls back to key string, check console

## 📚 Key Dependencies

### Frontend
- **react**: ^19.1.0 - UI framework
- **react-markdown**: ^10.1.0 - Markdown rendering
- **react-syntax-highlighter**: ^15.6.6 - Code syntax highlighting
- **html2canvas**: ^1.4.1 - Screenshot capture
- **jspdf**: ^3.0.3 - PDF export

### Tauri Plugins
- **@tauri-apps/api**: ^2 - Core Tauri APIs
- **@tauri-apps/plugin-fs**: ~2 - File system access
- **@tauri-apps/plugin-http**: ^2.5.2 - HTTP client
- **@tauri-apps/plugin-shell**: ~2 - Shell command execution
- **@tauri-apps/plugin-dialog**: ~2 - Native dialogs

### Dev Dependencies
- **typescript**: ~5.8.3 - Type checking
- **vite**: ^7.0.4 - Build tool
- **@vitejs/plugin-react**: ^4.6.0 - React support for Vite

## 🔐 Security Considerations

### File System Access
- All file operations are validated against workspace boundaries
- Tauri FS plugin provides sandboxed file access
- No arbitrary file system access outside workspace

### API Keys
- Stored in encrypted user config directory
- Never exposed in logs or error messages
- OpenAI API key can be placeholder for proxy services

### Tool Execution
- Tools execute via Rust backend (safe)
- Input validation before execution
- Error messages sanitized

## 🎯 Project-Specific Conventions

### Naming Conventions
- **Components**: PascalCase (e.g., `ChatMessageBubble.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useChatSessions.ts`)
- **Utilities**: camelCase (e.g., `configAPI.ts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MODERN_TOOLS`)
- **Types/Interfaces**: PascalCase (e.g., `ChatSession`, `Workspace`)

### Import Organization
1. External libraries (React, Tauri, etc.)
2. Internal utilities and hooks
3. Components
4. Types
5. CSS

### Error Handling Pattern
```typescript
try {
  const result = await someOperation();
  console.log('[Component] Success:', result);
} catch (error) {
  console.error('[Component] Error:', error);
  // Show user-friendly error message
}
```

### Logging Pattern
- Use prefixes: `[Chat]`, `[Settings]`, `[OpenAI]`, `[Gemini]`
- Log important state changes
- Log API calls with timing info
- Sanitize sensitive data before logging

## 📝 Notes for AI Assistants

When working on this codebase:
1. **Always check** if Tauri plugins are properly configured in `tauri.conf.json`
2. **Verify** file paths are within workspace boundaries
3. **Maintain** the existing hook-based architecture
4. **Preserve** translation keys when modifying UI text
5. **Test** both Gemini and OpenAI integrations when changing AI logic
6. **Update** CleanupManager registrations when creating temp files
7. **Follow** existing code patterns for consistency
8. **Document** new features in comments and README

## 🔄 Recent Major Changes

### Tool System Modernization (Latest)
- Migrated from legacy tool manager to Modern Tool System
- Separated tool definitions from execution logic
- Added OpenAI Function Calling support with follow-up requests
- Implemented proper tool result feedback to AI

### Settings System Overhaul
- Unified settings interface with category-based navigation
- Real-time tool configuration with immediate persistence
- Fixed tool enable/disable synchronization issues

### OpenAI Integration
- Added streaming support with proper tool execution
- Implemented two-phase request pattern (tool call → result → final response)
- Added workspace context and conversation history support

---

**Last Updated**: 2025-10-05  
**Project Version**: 0.1.0  
**Maintainer**: gamelist1990
