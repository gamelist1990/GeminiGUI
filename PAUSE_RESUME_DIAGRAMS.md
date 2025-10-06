# Pause/Resume Feature - Visual Flow Diagram

## Scenario 1: Regular Message Streaming

```
┌──────────────────────────────────────────────────────────────────┐
│ User sends message: "Explain quantum computing"                  │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Chat Interface                                                    │
├──────────────────────────────────────────────────────────────────┤
│ User: Explain quantum computing                                  │
│                                                                   │
│ Assistant: [Streaming...]                                        │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Quantum computing is a revolutionary approach to           │  │
│ │ computation that harnesses quantum mechanical              │  │
│ │ phenomena like superposition and entanglement...▊          │  │
│ │                                                             │  │
│ │ ──────────────────────────────────────────────────────     │  │
│ │                                          ⏸️ [Pause]         │  │
│ └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                     │
                     │ User clicks Pause
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Intervention Modal                                                │
├──────────────────────────────────────────────────────────────────┤
│                       ⏸️                                          │
│          Paused - AI generation suspended                        │
│                                                                   │
│        Elapsed time: 12 seconds                                  │
│                                                                   │
│  Intervention                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Focus on practical applications for beginners             │ │
│  │                                                            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [▶️ Submit & Resume]  [▶️ Resume]  [Cancel]                     │
└──────────────────────────────────────────────────────────────────┘
                     │
                     │ User clicks "Submit & Resume"
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Chat Interface (After Resume)                                    │
├──────────────────────────────────────────────────────────────────┤
│ User: Explain quantum computing                                  │
│                                                                   │
│ Assistant:                                                        │
│ Quantum computing is a revolutionary approach to                 │
│ computation that harnesses quantum mechanical                    │
│ phenomena like superposition and entanglement...                 │
│                                                                   │
│ User: [Intervention] Focus on practical applications             │
│       for beginners                                              │
│                                                                   │
│ Assistant: [Streaming with new context...]                       │
│ Let me focus on practical applications suitable for              │
│ beginners. Here are some accessible examples...▊                 │
└──────────────────────────────────────────────────────────────────┘
```

## Scenario 2: Command Processing (/compact, /init, /improve)

```
┌──────────────────────────────────────────────────────────────────┐
│ User types command: /compact                                      │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Processing Modal                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                       [Spinner Animation]                         │
│                                                                   │
│            Summarizing conversation history...                    │
│                                                                   │
│                    • • •                                          │
│                                                                   │
│        Elapsed time: 8 seconds                                   │
│                                                                   │
│              [⏸️ Pause]  [Cancel]                                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                     │
                     │ User clicks Pause
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Processing Modal (Paused)                                         │
├──────────────────────────────────────────────────────────────────┤
│                       ⏸️                                          │
│          Paused - AI generation suspended                        │
│                                                                   │
│        Elapsed time: 8 seconds                                   │
│                                                                   │
│  Intervention                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Make the summary more concise, max 200 words              │ │
│  │                                                            │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [▶️ Submit & Resume]  [▶️ Resume]  [Cancel]                     │
└──────────────────────────────────────────────────────────────────┘
```

## UI Component Breakdown

### 1. Streaming Message with Pause Button

```
┌─────────────────────────────────────────────────────────┐
│ Assistant                                                │
│ ┌───────────────────────────────────────────────────┐   │
│ │ [Streaming content with markdown rendering]       │   │
│ │ • List item 1                                     │   │
│ │ • List item 2                                     │   │
│ │ • List item 3▊                                    │   │
│ │                                                    │   │
│ │ ───────────────────────────────────────────────   │   │
│ │                                          ⏸️        │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
     ▲
     │
  Inline pause button appears during streaming
```

### 2. Processing Modal - Active State

```
╔═══════════════════════════════════════════════════╗
║              Processing Modal                      ║
╠═══════════════════════════════════════════════════╣
║                                                    ║
║                  ⚙️ [Spinner]                      ║
║                                                    ║
║          Summarizing conversation...              ║
║                                                    ║
║                   • • •                           ║
║                                                    ║
║           Elapsed time: 5 seconds                 ║
║                                                    ║
║         [⏸️ Pause]      [Cancel]                   ║
║                                                    ║
╚═══════════════════════════════════════════════════╝
```

### 3. Processing Modal - Paused State

```
╔═══════════════════════════════════════════════════╗
║         Processing Modal (Paused)                  ║
╠═══════════════════════════════════════════════════╣
║                                                    ║
║                      ⏸️                            ║
║   Paused - AI generation suspended                ║
║                                                    ║
║           Elapsed time: 5 seconds                 ║
║                                                    ║
║  Intervention                                     ║
║  ┌──────────────────────────────────────────┐    ║
║  │ Add additional instructions or           │    ║
║  │ context...                               │    ║
║  │                                          │    ║
║  │                                          │    ║
║  └──────────────────────────────────────────┘    ║
║                                                    ║
║  [▶️ Submit & Resume]  [▶️ Resume]  [Cancel]      ║
║                                                    ║
╚═══════════════════════════════════════════════════╝
```

## State Transition Diagram

```
                    ┌─────────────┐
                    │   Initial   │
                    │    State    │
                    └──────┬──────┘
                           │
                    User sends message
                           │
                           ▼
                 ┌─────────────────┐
                 │   Streaming     │◄────────┐
                 │   (isTyping)    │         │
                 └────┬────────┬───┘         │
                      │        │             │
           Click Pause│        │Response     │
                      │        │Complete     │
                      ▼        ▼             │
            ┌───────────┐  ┌──────────┐     │
            │  Paused   │  │ Complete │     │
            │(isPaused) │  └──────────┘     │
            └─────┬─────┘                    │
                  │                          │
        ┌─────────┼──────────┐              │
        │         │          │              │
    Resume    Submit     Cancel             │
  (no text) Intervention                    │
        │         │          │              │
        ▼         ▼          ▼              │
  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
  │ Show     │ │ Continue │ │  Stop &  │  │
  │ Partial  │ │ with New │ │  Reset   │  │
  │ Response │ │ Context  │ └──────────┘  │
  └──────────┘ └─────┬────┘                │
                     │                     │
                     └─────────────────────┘
```

## Data Flow During Pause/Resume

```
┌──────────────────┐
│ User Input       │
│ "Hello World"    │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ handleSendMessage()                          │
│ • Stores context in pausedContext           │
│ • Calls AI API with AbortController         │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ AI Stream Begins                             │
│ • streamingMessage accumulates chunks        │
│ • User sees real-time updates               │
└────────┬────────────────────────────────────┘
         │
         │ User clicks Pause
         ▼
┌─────────────────────────────────────────────┐
│ handlePauseProcessing()                      │
│ • Saves pausedStreamContent                  │
│ • Aborts request via abortController         │
│ • Sets isPaused = true                       │
│ • Shows intervention modal                   │
└────────┬────────────────────────────────────┘
         │
         │ User types intervention & clicks Submit
         ▼
┌─────────────────────────────────────────────┐
│ handleInterventionSubmit()                   │
│ • Saves partial response as message         │
│ • Adds intervention as user message         │
│ • Rebuilds conversation history             │
│ • Makes new AI request with:               │
│   - Original context from pausedContext     │
│   - Updated conversation history            │
│   - Intervention text                       │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ AI Continues with Updated Context           │
│ • New streaming response begins             │
│ • User sees continuation                    │
└─────────────────────────────────────────────┘
```

## Key Variables and Their Roles

| Variable | Type | Purpose |
|----------|------|---------|
| `isPaused` | boolean | Tracks whether AI is currently paused |
| `interventionText` | string | User's intervention/additional instructions |
| `pausedStreamContent` | string | Accumulated stream content at pause point |
| `pausedContext` | object | Original request context (prompt, options, settings) |
| `isStreaming` | boolean | Whether AI is actively streaming |
| `showProcessingModal` | boolean | Whether to show processing/intervention modal |
| `abortControllerRef` | ref | AbortController for canceling in-flight requests |

## User Experience Timeline

```
Time    Event                           UI State
────────────────────────────────────────────────────────────
0s      User sends message              Typing indicator
1s      First chunk arrives             Streaming content
3s      More chunks arrive              Content grows
5s      User clicks Pause               Modal appears
6s      User types intervention         Text in modal
8s      User clicks Submit & Resume     Modal closes
9s      Partial response saved          Message in chat
9s      Intervention saved              Message in chat
10s     New AI request starts           Typing indicator
11s     First new chunk                 Streaming continues
15s     Response complete               Final message shown
```

## CSS Animation Examples

### Pulsing Pause Icon
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.95);
  }
}

.paused-icon {
  animation: pulse 2s ease-in-out infinite;
}
```

### Fade-in for Modal Transition
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.processing-modal {
  animation: fadeIn 0.3s ease-out;
}
```

## Browser Compatibility

- ✅ Modern browsers (Chrome, Firefox, Edge, Safari)
- ✅ Uses standard Web APIs (AbortController, CSS animations)
- ✅ No external dependencies for pause/resume logic
- ✅ Graceful degradation if features unsupported

## Performance Considerations

1. **Memory**: Stores partial content in state (typically < 100KB)
2. **Network**: Aborts in-flight request to save bandwidth
3. **Rendering**: React updates efficiently with streaming content
4. **Cleanup**: Properly cleans up intervals and refs on unmount
