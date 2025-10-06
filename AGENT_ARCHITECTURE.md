# Agent Mode Architecture Diagram

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT MODE WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│   User      │
│  Request    │
└──────┬──────┘
       │
       │ "Please implement feature X"
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: TASK PLANNING                            │
├──────────────────────────────────────────────────────────────────────────┤
│  AI Prompt: "Create a detailed task list to accomplish this request"    │
│                                                                          │
│  AI Response:                                                            │
│  - [ ] Task 1: Analyze requirements                                     │
│  - [ ] Task 2: Create file structure                                    │
│  - [ ] Task 3: Implement core logic                                     │
│  - [ ] Task 4: Add tests                                                │
│  - [ ] Task 5: Update documentation                                     │
└──────────────────────────────────────────────────────────────────────────┘
       │
       │ Parse tasks → Create AgentTask objects
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       TASK LIST INITIALIZATION                           │
├──────────────────────────────────────────────────────────────────────────┤
│  tasks = [                                                               │
│    { id: '1', description: 'Analyze requirements', status: 'pending' }  │
│    { id: '2', description: 'Create file structure', status: 'pending' } │
│    { id: '3', description: 'Implement core logic', status: 'pending' }  │
│    { id: '4', description: 'Add tests', status: 'pending' }             │
│    { id: '5', description: 'Update documentation', status: 'pending' }  │
│  ]                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
       │
       │ Start autonomous execution loop
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    STEP 2: AUTONOMOUS EXECUTION                          │
└──────────────────────────────────────────────────────────────────────────┘
       │
       │ FOR EACH task in tasks:
       ▼
   ┌───────────────────────────────────────────┐
   │  Update Task Status: IN-PROGRESS          │
   │  setTasks(prev => update task.status)     │
   └───────────────────────────────────────────┘
       │
       │ Send task execution prompt to AI
       ▼
   ┌───────────────────────────────────────────┐
   │  AI Execution with YOLO Mode              │
   │  - Full tool access                       │
   │  - No user approval needed                │
   │  - Workspace-constrained                  │
   └───────────────────────────────────────────┘
       │
       ├─────────────────┬──────────────────┐
       │ SUCCESS         │ FAILURE          │
       ▼                 ▼                  │
   ┌──────────────┐  ┌──────────────┐      │
   │ Status:      │  │ Status:      │      │
   │ COMPLETED    │  │ FAILED       │      │
   │              │  │              │      │
   │ Store result │  │ Store error  │      │
   └──────────────┘  └──────────────┘      │
       │                 │                  │
       └─────────────────┴──────────────────┘
       │
       │ Add result message to chat
       ▼
   ┌───────────────────────────────────────────┐
   │  Chat Message:                            │
   │  ✅ Task N Completed: [description]       │
   │  [Detailed result from AI]                │
   │                                           │
   │  OR                                       │
   │                                           │
   │  ❌ Task N Failed: [description]          │
   │  Error: [error message]                   │
   └───────────────────────────────────────────┘
       │
       │ Move to next task
       └──────────► REPEAT until all tasks done
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       STEP 3: FINAL SUMMARY                              │
├──────────────────────────────────────────────────────────────────────────┤
│  AI Prompt: "Provide summary of completed work"                         │
│                                                                          │
│  AI Response:                                                            │
│  🎉 All Tasks Completed!                                                 │
│                                                                          │
│  Summary of accomplishments:                                            │
│  - Analyzed requirements and created detailed spec                      │
│  - Created file structure with 5 files                                  │
│  - Implemented core logic in App.tsx                                    │
│  - Added 10 unit tests with 100% coverage                               │
│  - Updated README.md with usage instructions                            │
└──────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   User      │
│  Reviews    │
│  Results    │
└─────────────┘
```

## Component Communication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  App.tsx                                                                 │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  handleCreateNewSession(isAgentMode)                           │    │
│  │    │                                                            │    │
│  │    ├─► useChatSessions.createNewSession(isAgentMode)          │    │
│  │    │     │                                                      │    │
│  │    │     └─► Creates session with isAgentMode flag            │    │
│  │    │                                                            │    │
│  │    └─► if (isAgentMode) setCurrentView('agent')               │    │
│  │        else setCurrentView('chat')                             │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           │                                       │
           ▼                                       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│  Chat.tsx               │         │  Agent.tsx              │
│  ┌───────────────────┐  │         │  ┌───────────────────┐  │
│  │                   │  │         │  │                   │  │
│  │  New Chat Button  │  │         │  │  Agent UI with   │  │
│  │    with Dropdown  │  │         │  │  Task Panel      │  │
│  │                   │  │         │  │                   │  │
│  │  ┌─────────────┐ │  │         │  │  executeAgent    │  │
│  │  │💬 Chat      │ │  │         │  │  Loop()          │  │
│  │  │🤖 Agent     │ │  │         │  │    │             │  │
│  │  └─────────────┘ │  │         │  │    ├─► Plan     │  │
│  │                   │  │         │  │    ├─► Execute  │  │
│  │  Messages List    │  │         │  │    └─► Summary  │  │
│  │                   │  │         │  │                   │  │
│  └───────────────────┘  │         │  └───────────────────┘  │
└─────────────────────────┘         └─────────────────────────┘
```

## State Management

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        REACT STATE STRUCTURE                             │
└──────────────────────────────────────────────────────────────────────────┘

App.tsx:
├─ currentView: 'workspace' | 'chat' | 'agent' | 'settings'
├─ currentWorkspace: Workspace | null
└─ globalConfig: Config

useChatSessions:
├─ sessions: ChatSession[]
│   └─ Each session contains:
│       ├─ id: string
│       ├─ name: string
│       ├─ messages: ChatMessage[]
│       ├─ isAgentMode?: boolean  ◄── NEW
│       └─ ...
├─ currentSessionId: string
└─ Methods: createNewSession(isAgentMode), addMessage, etc.

Agent.tsx:
├─ inputValue: string
├─ tasks: AgentTask[]  ◄── Tracks all tasks and their status
│   └─ Each task contains:
│       ├─ id: string
│       ├─ description: string
│       ├─ status: 'pending' | 'in-progress' | 'completed' | 'failed'
│       ├─ result?: string
│       └─ timestamps
├─ isThinking: boolean
├─ thinkingMessage: string
└─ editingMessageId: string | null

Chat.tsx:
├─ showNewChatDropdown: boolean  ◄── NEW
├─ inputValue: string
└─ ... (existing state)
```

## Data Flow for Message Editing

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     MESSAGE EDITING FLOW                                 │
└──────────────────────────────────────────────────────────────────────────┘

User double-clicks on assistant message
       │
       ▼
ChatMessageBubble.handleDoubleClick()
       │
       ├─ Check: message.role === 'assistant' && message.editable
       │
       ├─ If true:
       │   ├─ setIsEditing(true)
       │   └─ setEditContent(message.content)
       │
       ▼
Edit UI is displayed
       │
       │ User modifies content
       ▼
User clicks "Save"
       │
       ▼
handleSaveEdit()
       │
       ├─ Create new ChatMessage with edited content
       │   └─ { ...message, content: editedContent, timestamp: new Date() }
       │
       ▼
onResendMessage(newMessage)
       │
       ▼
Agent/Chat component receives edited message
       │
       ├─ Adds message to session
       └─ Continues conversation with edited context
```

## UI Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENT MODE UI                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Header                                                                 │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ ← Back  │  🤖 Agent Mode  │  Workspace  │  Tokens: XXX        │   │
│  └────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────┬──────────────────────────────────┤
│  Main Content Area                   │  Task Sidebar (300px)           │
│  ┌────────────────────────────────┐  │  ┌────────────────────────────┐ │
│  │                                │  │  │  📋 Task List              │ │
│  │  Chat Messages                 │  │  ├────────────────────────────┤ │
│  │  ┌──────────────────────────┐  │  │  │                            │ │
│  │  │ User Message             │  │  │  │  [Task Item 1]            │ │
│  │  └──────────────────────────┘  │  │  │  Status: Pending          │ │
│  │  ┌──────────────────────────┐  │  │  │                            │ │
│  │  │ Assistant Message        │  │  │  │  [Task Item 2]            │ │
│  │  │ (editable: true)         │  │  │  │  Status: In Progress ⟳   │ │
│  │  │ Double-click to edit     │  │  │  │                            │ │
│  │  └──────────────────────────┘  │  │  │  [Task Item 3]            │ │
│  │                                │  │  │  Status: Completed ✓      │ │
│  │  🤖 Thinking...                │  │  │  Result: Created file...  │ │
│  │                                │  │  │                            │ │
│  └────────────────────────────────┘  │  └────────────────────────────┘ │
├──────────────────────────────────────┴──────────────────────────────────┤
│  Input Area                                                             │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  [Text Input Area]                                        [➤]  │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```
