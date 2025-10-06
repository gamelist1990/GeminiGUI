# Agent Streaming and Tool Execution Known Issues

## Issue: Tool Calls Not Working with vscode-lm-proxy in Stream Mode

### Symptom
When using Agent mode with streaming enabled and the `vscode-lm-proxy` model (VS Code Language Model API), the AI outputs text like:
```
[TOOL] list_directory executed with args: {"path":"."}
```

Instead of actually calling the tool and continuing execution.

### Root Cause
The `vscode-lm-proxy` model does not support proper OpenAI-style function calling. When tools are defined, the model tries to describe tool usage in text format instead of making actual function calls.

### Solution
Use a model that properly supports function calling:

#### Recommended Models:
1. **OpenAI GPT-4 / GPT-3.5-turbo**
   - Full function calling support
   - Streaming works perfectly with tools
   - Configure in Settings → AI Provider → Enable OpenAI

2. **Google Gemini (via Gemini CLI)**
   - Function calling support
   - Async mode recommended
   - Default provider if configured

### Current Behavior by Model

| Model | Streaming | Function Calling | Status |
|-------|-----------|------------------|--------|
| OpenAI GPT-4 | ✅ Yes | ✅ Full Support | **Recommended** |
| OpenAI GPT-3.5 | ✅ Yes | ✅ Full Support | **Recommended** |
| Gemini (CLI) | ⚠️ Async only | ✅ Supported | Works (async) |
| vscode-lm-proxy | ❌ Limited | ❌ No Support | Not recommended for Agent |

### Workaround for Development
If you must use vscode-lm-proxy:
1. Disable streaming in Agent mode (not currently implemented)
2. Or switch to async mode
3. Or use a different model

### Implementation Details

The OpenAI streaming implementation in `openaiAPI.ts` properly handles function calling:
1. Detects tool_calls in stream
2. Executes tools
3. Sends results back to AI
4. Gets final response

However, models that don't support function calling will:
- Output tool descriptions as text
- Never actually call the functions
- Not produce useful results

### Fix Status
✅ **Fixed**: Auto-detection of Agent mode sessions for view switching
✅ **Fixed**: Resend functionality now works correctly in Agent mode
⚠️ **Known Limitation**: Model compatibility with function calling

### Recommendation
**For Production Use**: Always use OpenAI GPT-4 or Gemini CLI with proper API keys for Agent mode. The vscode-lm-proxy is intended for development/testing of non-tool-using features only.
