# 🤖 Agent Mode Quick Start Guide

> **Autonomous AI execution for complex tasks**

## What is Agent Mode?

Agent Mode is an autonomous AI execution feature that allows you to delegate complex, multi-step tasks to the AI. Instead of manually guiding the AI through each step, you provide a high-level request, and the Agent automatically:

1. **Plans** - Breaks down your request into specific tasks
2. **Executes** - Runs each task autonomously without user intervention
3. **Reports** - Provides a comprehensive summary of completed work

## Quick Start

### 1. Create an Agent Session

Click the dropdown arrow next to "New Chat":

```
┌──────────────────────┐
│ ✨ New Chat    │  ^ │  ← Click here
└──────────────────────┘
```

Select "🤖 Agent Mode" from the dropdown menu.

### 2. Send Your Request

Type a high-level request describing what you want to accomplish:

**Examples:**
- "Create a React login component with form validation"
- "Refactor all JavaScript files to TypeScript"
- "Add unit tests for all utility functions"
- "Generate API documentation from code comments"
- "Implement dark mode support across the application"

### 3. Watch the Magic Happen

The Agent will:
1. Create a detailed task plan
2. Execute each task automatically
3. Update progress in real-time (visible in the task panel on the right)
4. Provide a final summary when complete

### 4. Review Results

All changes and results are displayed in the chat. You can:
- Review each task's output
- Edit any assistant messages (double-click)
- Continue the conversation if adjustments are needed

## Task Panel

The right sidebar shows all tasks with real-time status:

```
┌─────────────────────────┐
│ 📋 Task List            │
├─────────────────────────┤
│ PENDING                 │  ← Gray (waiting)
│ Task description        │
├─────────────────────────┤
│ IN PROGRESS ⟳          │  ← Blue (executing)
│ Task description        │
├─────────────────────────┤
│ COMPLETED ✓            │  ← Green (done)
│ Task description        │
│ Result: Brief summary   │
├─────────────────────────┤
│ FAILED ✗               │  ← Red (error)
│ Task description        │
│ Error: Error message    │
└─────────────────────────┘
```

## Message Editing

Need to correct or clarify something the AI said? Double-click any assistant message to edit it:

1. Double-click the message
2. Edit the content
3. Click "Save" to continue with the corrected version

## Best Practices

### ✅ Good Agent Requests

- **Specific and clear**: "Create a REST API endpoint for user registration"
- **Well-scoped**: "Add error handling to the authentication module"
- **Actionable**: "Implement pagination for the user list component"

### ❌ Avoid These

- **Too vague**: "Make the app better"
- **Multiple unrelated tasks**: "Fix bugs and add new features and update docs"
- **Unclear requirements**: "Do something with the database"

### 💡 Pro Tips

1. **Start small**: Try simple tasks first to understand how Agent mode works
2. **Be specific**: The more detail you provide, the better the results
3. **Review changes**: Always review what the Agent did
4. **Use in trusted workspaces**: Agent has full file access within the workspace
5. **Edit if needed**: Use message editing to refine the Agent's understanding

## Real-World Examples

### Example 1: Component Creation

**Request:**
```
Create a reusable Card component in React with TypeScript. 
Include props for title, content, and an optional footer.
Add proper TypeScript interfaces and export the component.
```

**Result:**
- Task 1: Created Card.tsx with component structure
- Task 2: Added TypeScript interfaces
- Task 3: Implemented prop handling
- Task 4: Added styling with CSS modules
- Task 5: Created example usage in documentation

### Example 2: Code Refactoring

**Request:**
```
Refactor the user service to use async/await instead of promises.
Update all calling code and add proper error handling.
```

**Result:**
- Task 1: Updated user service functions
- Task 2: Modified all function calls
- Task 3: Added try-catch blocks
- Task 4: Updated unit tests
- Task 5: Verified all code still works

### Example 3: Documentation

**Request:**
```
Generate comprehensive README documentation for the 
authentication module, including setup instructions and examples.
```

**Result:**
- Task 1: Analyzed authentication module structure
- Task 2: Created README outline
- Task 3: Wrote setup instructions
- Task 4: Added code examples
- Task 5: Generated API reference

## Troubleshooting

### Agent Not Starting

**Issue**: Clicking Agent Mode doesn't create a session
**Solution**: 
- Check that you haven't reached the maximum session limit (5 sessions)
- Try refreshing the page
- Check console for errors

### Tasks Failing

**Issue**: Tasks show "FAILED" status
**Solution**:
- Review the error message in the task panel
- Check file permissions in your workspace
- Verify that required tools are enabled in settings
- Try breaking down your request into smaller parts

### No Progress Updates

**Issue**: Task panel not updating
**Solution**:
- Wait a few seconds (some tasks take time)
- Check your internet connection
- Verify Gemini API is configured correctly
- Check browser console for errors

## Security Notes

⚠️ **Important Security Considerations**

Agent Mode uses **YOLO approval mode**, which means:
- ✅ AI can execute file operations automatically
- ✅ No prompts or confirmations during execution
- ⚠️ AI has full access to files within your workspace
- ⚠️ Only use in workspaces you trust

**Recommendations:**
1. Use Agent mode only in development/test workspaces
2. Review all changes after Agent execution
3. Keep backups of important files
4. Don't use with sensitive or production code without review

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send message | `Ctrl + Enter` |
| Focus input | `Tab` (when at bottom) |
| Close dropdown | `Esc` or click outside |

## FAQ

**Q: How is Agent mode different from regular chat?**
A: Regular chat requires you to guide the AI step-by-step. Agent mode lets you provide a high-level goal, and the AI autonomously breaks it down and executes all steps.

**Q: Can I stop the Agent while it's working?**
A: Currently, no. This feature is planned for a future update. For now, wait for the current task to complete.

**Q: How many tasks can the Agent handle?**
A: The Agent can handle any number of tasks, but we recommend breaking very large requests into smaller chunks for better results.

**Q: Can I edit the task list before execution?**
A: Not yet. This is a planned feature. Currently, the Agent creates and executes the plan automatically.

**Q: What AI models does Agent mode support?**
A: Agent mode works with both Gemini AI and OpenAI, using the same model configured in your settings.

**Q: Is Agent mode available in all languages?**
A: Yes! Agent mode is fully translated into English and Japanese.

## Learn More

For detailed technical information:
- **Feature Guide**: See `AGENT_MODE.md`
- **Architecture**: See `AGENT_ARCHITECTURE.md`
- **UI Documentation**: See `AGENT_UI_MOCKUPS.md`
- **Implementation**: See `IMPLEMENTATION_SUMMARY.md`

## Feedback

Found a bug or have a suggestion? Please open an issue on GitHub!

---

**Version**: 1.0.0  
**Last Updated**: 2025-01-06  
**Status**: Production Ready ✅
