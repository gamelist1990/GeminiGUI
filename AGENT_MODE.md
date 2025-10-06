# Agent Mode Feature Documentation

## Overview

The Agent Mode is a new autonomous AI execution feature inspired by GitHub Copilot Agent. It allows users to delegate complex tasks to the AI, which will automatically break them down into smaller subtasks, execute them autonomously, and provide detailed progress tracking.

## Key Features

### 1. **New Chat Creation with Mode Selection**

Users can now choose between two modes when creating a new chat:
- **Standard Chat Mode** (💬): Traditional conversational interface
- **Agent Mode** (🤖): Autonomous task execution mode

The "New Chat" button has been enhanced with a dropdown menu (accessible via the `^` button) that lets users select which mode to use.

### 2. **Autonomous Task Execution**

When in Agent Mode, the AI follows a GitHub Copilot Agent-inspired algorithm:

#### Step 1: Task Planning
- User provides a high-level request
- AI analyzes the request and creates a detailed task list
- Tasks are displayed in markdown checklist format
- Each task is broken down into specific, actionable steps

#### Step 2: Autonomous Execution
- AI executes each task one by one without user intervention
- Uses `yolo` approval mode for full autonomy (automatically approves all tool executions)
- Provides detailed progress updates for each task
- Tracks task status: Pending → In Progress → Completed/Failed

#### Step 3: Summary
- After all tasks are completed, AI provides a comprehensive summary
- Reports on what was accomplished and any issues encountered

### 3. **Task List Sidebar**

The Agent interface includes a dedicated task panel on the right side that shows:
- **Task Status Badges**: Visual indicators (Pending, In Progress, Completed, Failed)
- **Task Descriptions**: Clear, actionable task descriptions
- **Task Results**: Brief summary of what was accomplished (for completed tasks)
- **Timestamps**: When each task was last updated
- **Color-coded borders**: 
  - Gray: Pending
  - Blue: In Progress (with pulsing animation)
  - Green: Completed
  - Red: Failed

### 4. **Message Editing for Assistant Messages**

Both Chat and Agent modes now support editing assistant messages:
- **Double-click on assistant messages** marked as `editable: true` to edit them
- Useful for correcting AI responses or adding additional context
- Edit interface includes:
  - Auto-resizing textarea
  - Save button to apply changes
  - Cancel button to discard changes
- Edited messages are re-sent to the AI, continuing the conversation

### 5. **Visual Indicators**

Agent Mode is clearly distinguished with:
- **Agent Badge**: Purple gradient badge in the header showing "🤖 Agent Mode"
- **Task Panel**: Dedicated right sidebar showing all tasks
- **Thinking Indicator**: Animated spinner when AI is processing

## User Interface

### New Chat Dropdown

```
┌─────────────────────────────────────┐
│ ✨ New Chat      │  ^               │  ← Button with dropdown
└─────────────────────────────────────┘
         ↓ (click ^)
┌─────────────────────────────────────┐
│ 💬 New Chat                         │
│    Standard chat mode               │
├─────────────────────────────────────┤
│ 🤖 Agent Mode                       │ ← Agent option (gradient bg)
│    AI will autonomously execute     │
│    tasks                            │
└─────────────────────────────────────┘
```

### Agent Mode Interface

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Workspace Selection  │  🤖 Agent Mode  │  Workspace Name  │  Tokens: XXX  │
├──────────────────────────────────────────┬───────────────────────────────────┤
│                                          │  📋 Task List                    │
│  Chat Messages Area                      │  ┌─────────────────────────────┐ │
│                                          │  │ PENDING                     │ │
│  User: "Please create a README file"    │  │ Create file structure       │ │
│                                          │  │ 10:30 AM                    │ │
│  Assistant: 📋 Task Plan Created:        │  └─────────────────────────────┘ │
│  - [ ] Analyze project structure         │  ┌─────────────────────────────┐ │
│  - [ ] Write README content              │  │ IN PROGRESS ⟳              │ │
│  - [ ] Create README.md file             │  │ Analyze project structure   │ │
│                                          │  │ 10:31 AM                    │ │
│  🤖 AI is thinking...                    │  └─────────────────────────────┘ │
│                                          │  ┌─────────────────────────────┐ │
│                                          │  │ COMPLETED ✓                │ │
│  [Message input area]                    │  │ Write README content        │ │
│  [Send button]                           │  │ Result: Generated...        │ │
│                                          │  │ 10:32 AM                    │ │
└──────────────────────────────────────────┴───────────────────────────────────┘
```

## Technical Implementation

### Type Definitions

#### ChatSession Enhancement
```typescript
export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  tokenUsage: number;
  createdAt: Date;
  isAgentMode?: boolean; // NEW: Identifies Agent mode sessions
}
```

#### AgentTask Type
```typescript
export interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  result?: string; // Stores brief task result
}
```

#### ChatMessage Enhancement
```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokenUsage?: number;
  stats?: GeminiStats;
  toolUsage?: ToolUsageStats[];
  hidden?: boolean;
  editable?: boolean; // NEW: Allows editing assistant messages
}
```

### Component Architecture

#### Agent.tsx
- Main Agent mode component
- Handles autonomous execution loop
- Manages task state and UI
- Integrates with existing AI APIs (Gemini/OpenAI)

#### App.tsx Updates
- Added `'agent'` to View type
- Routes to Agent component when in agent mode
- Handles creation of agent sessions

#### Chat Component Updates
- Added dropdown menu for new chat creation
- Dropdown shows both Chat and Agent mode options
- State management for dropdown visibility

#### useChatSessions Hook Updates
- `createNewSession(isAgentMode?: boolean)`: Now accepts agent mode flag
- Automatically names sessions "Agent X" or "Session X" based on mode
- Stores `isAgentMode` flag in session data

### Translation Keys

#### English (en_US.jsonc)
```json
"chat": {
  "newAgentChat": "Agent Mode",
  "agent": {
    "title": "Agent Mode",
    "description": "AI will autonomously execute tasks",
    "tasks": "Task List",
    "currentTask": "Current Task",
    "noTasks": "No tasks",
    "taskPending": "Pending",
    "taskInProgress": "In Progress",
    "taskCompleted": "Completed",
    "taskFailed": "Failed",
    "thinking": "AI is thinking...",
    "executing": "Executing task...",
    "planningTasks": "Planning tasks...",
    "updateProgress": "Updating progress...",
    "editMessage": "Edit message (double-click)",
    "saveEdit": "Save",
    "cancelEdit": "Cancel"
  }
}
```

#### Japanese (ja_JP.jsonc)
Corresponding Japanese translations are available.

## Usage Examples

### Example 1: Create a Project Structure

**User Input:**
```
Please create a complete project structure for a React app with TypeScript
```

**AI Response:**
1. Creates task list:
   - [ ] Create src directory
   - [ ] Create public directory
   - [ ] Create package.json
   - [ ] Create tsconfig.json
   - [ ] Create index.html
   - [ ] Create App.tsx

2. Executes each task autonomously
3. Provides summary of created files

### Example 2: Refactor Code

**User Input:**
```
Refactor all components to use TypeScript interfaces instead of type aliases
```

**AI Response:**
1. Creates task list:
   - [ ] Scan all component files
   - [ ] Identify type aliases
   - [ ] Convert to interfaces
   - [ ] Update imports

2. Executes refactoring for each file
3. Reports changed files and validation results

## Security and Safety

### Approval Mode
- Agent mode automatically uses `yolo` approval mode for full autonomy
- This allows AI to execute file operations without prompting
- **Warning**: Only use Agent mode in trusted workspaces

### Workspace Boundaries
- All file operations are restricted to the current workspace
- AI cannot access files outside workspace boundaries
- Temporary files are stored in designated workspace directories

## Future Enhancements

Potential improvements for future versions:
1. **Pause/Resume**: Ability to pause agent execution and intervene
2. **Task Editing**: Allow users to modify task list before execution
3. **Parallel Execution**: Execute non-dependent tasks in parallel
4. **Undo/Rollback**: Ability to rollback changes if tasks fail
5. **Custom Tools**: Allow Agent mode to use custom user-defined tools
6. **Progress Streaming**: Real-time streaming of task execution logs
7. **Multi-Agent**: Multiple agents working on different aspects of a task

## Troubleshooting

### Agent Not Responding
- Check that Gemini API is properly configured
- Ensure workspace path is valid
- Check console logs for errors

### Tasks Failing
- Verify file permissions in workspace
- Check that required tools are enabled in settings
- Review error messages in task results

### UI Not Updating
- Refresh the page
- Check browser console for errors
- Verify React DevTools shows component updates

## Credits

This feature is inspired by:
- **GitHub Copilot Agent**: Task breakdown and autonomous execution pattern
- **AutoGPT**: Autonomous agent concepts
- **LangChain Agents**: Tool use and planning strategies
