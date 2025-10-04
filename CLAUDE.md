# CLAUDE.md - Claude Code Workflow Guide

## Project Overview

**GeminiGUI** is a desktop GUI application that leverages Google's Gemini AI models. It provides an intuitive graphical interface for Gemini API functionality without requiring complex command-line operations or API setup.

### Technology Stack
- **Framework**: Tauri + React + TypeScript
- **Frontend**: React 18 with TypeScript
- **Backend**: Tauri (Rust) for native desktop functionality
- **AI**: Google Gemini API
- **Build Tool**: Bun
- **Internationalization**: Supports English (en_US) and Japanese (ja_JP)

## Development Guidelines

### Code Style
- **TypeScript**: Strict mode enabled, use proper type annotations
- **Imports**: Group by external libraries first, then internal utilities
- **Naming**: Use camelCase for variables/functions, PascalCase for components
- **Components**: Use functional components with hooks
- **Async/Await**: Preferred over Promises for better readability

### Commit Messages
Use the following format:
```
feat: Description of feature
fix: Description of bug fix
docs: Documentation updates
refactor: Code restructuring
chore: Maintenance tasks

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Internationalization (i18n)
All user-facing text must be internationalized using the `t()` function:

```typescript
// Correct
t('chat.errors.geminiError').replace('{error}', errorMessage)

// Incorrect - never use hardcoded strings
"Error occurred: " + errorMessage
```

- **Translation Keys**: Follow the pattern `category.subcategory.key`
- **Placeholders**: Use `{variable}` syntax for dynamic content
- **Consistency**: Keys must exist in both `en_US.jsonc` and `ja_JP.jsonc`

### Error Handling
- Use try-catch blocks for async operations
- Provide meaningful error messages through i18n
- Handle both network errors and API-specific errors
- Log errors to console.error() for debugging

### State Management
- Use React hooks (useState, useEffect) for component state
- Global config is managed through the `configAPI`
- Workspace-specific settings are stored in JSON files

## Build & Development

### Local Development
```bash
cd app
bun install
bun run tauri dev
```

### Build Production
```bash
cd app
bun run tauri build
```

### Testing
- Manually test internationalization by switching languages
- Verify all user flows work correctly
- Test both English and Japanese interfaces
- Confirm API calls work with different approval modes

## Code Quality Checklist

### Before Committing
- [ ] All TypeScript errors resolved
- [ ] No console.log() statements (except for debugging)
- [ ] All hardcoded strings internationalized
- [ ] Consistent code formatting
- [ ] Proper error handling
- [ ] Translation files updated if new strings added

### Pull Request Requirements
- [ ] Descriptive title describing the feature/fix
- [ ] Updated relevant documentation
- [ ] Tested in both languages
- [ ] No breaking changes without migration
- [ ] Follows commit message format

## Architecture Notes

### Component Structure
- `pages/`: Main application screens (Chat, Settings, WorkspaceSelection, Setup)
- `utils/`: Utility functions (i18n, config, API clients)
- `types/`: TypeScript type definitions
- `components/`: Reusable UI components

### Internationalization Files
- `app/public/lang/en_US.jsonc`: English translations
- `app/public/lang/ja_JP.jsonc`: Japanese translations

### Config Management
- Global config: Tauri backend config
- Per-workspace config: JSON files in workspace paths
- Settings: User preferences and authentication state

## Common Patterns

### Chat Commands
The application supports special chat commands like `/compact`, `/fixchat`, `/init`. These should:
- Have appropriate translations in the `chat.commands` section
- Handle errors through internationalization
- Provide clear usage instructions

### File Operations
- Always check file existence before operations
- Handle both absolute and relative paths
- Use workspace root as base for relative paths
- Provide user feedback for file operations

### Gemini API Integration
- Use appropriate approval modes (default, auto_edit, yolo)
- Handle API rate limits and errors
- Support both custom API keys and default authentication
- Provide clear error messages for API failures

## Security Considerations
- OAuth credentials are stored locally only
- API keys are handled securely
- User input is properly escaped
- File system access is restricted to workspace directories

## Performance Guidelines
- Lazy load heavy components when possible
- Cache translation files
- Minimize re-renders through proper React patterns
- Optimize bundle size through code splitting