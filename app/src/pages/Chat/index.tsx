import React, { useState, useRef, useEffect } from "react";
import "../Chat.css";
import { ChatMessage } from "../../types";
import { t } from "../../utils/i18n";
import { formatElapsedTime, formatNumber } from "../../utils/storage";
import { callGemini, GeminiOptions } from "../../utils/geminiCUI";
import { scanWorkspace, getSuggestions, parseIncludes } from "../../utils/workspace";
import * as fsPlugin from "@tauri-apps/plugin-fs";
import { ChatProps } from "./types";
import ProcessingModal from "./ProcessingModal";
import StatsModal from "./StatsModal";
import ChatMessageBubble from "./ChatMessageBubble";

export default function Chat({
  workspace,
  sessions,
  currentSession,
  currentSessionId,
  maxSessionsReached,
  approvalMode,
  responseMode,
  totalTokens,
  customApiKey,
  googleCloudProjectId,
  maxMessagesBeforeCompact,
  globalConfig,
  onCreateNewSession,
  onSwitchSession,
  onSendMessage,
  onResendMessage,
  onDeleteSession,
  onRenameSession,
  onCompactSession,
  onBack,
}: ChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [workspaceSuggestions, setWorkspaceSuggestions] = useState<string[]>(
    []
  );
  const [workspaceItems, setWorkspaceItems] = useState<any[]>([]);
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = null;
      }
    };
  }, []);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [elapsedTime, setElapsedTime] = useState("");
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [showCompactWarning, setShowCompactWarning] = useState(false);
  const [requestElapsedTime, setRequestElapsedTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestStartRef = useRef<number | null>(null);
  const requestIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [geminiPath, setGeminiPath] = useState<string | undefined>();
  const [recentlyCompletedSuggestion, setRecentlyCompletedSuggestion] =
    useState(false);
  const [geminiPathError, setGeminiPathError] = useState<string>("");

  // Load geminiPath from global config on workspace change
  useEffect(() => {
    const loadGeminiPath = async () => {
      try {
        // Load from global config only
        const config = await globalConfig.loadConfig();
        const loadedGeminiPath = config?.geminiPath;

        setGeminiPath(loadedGeminiPath);

        if (!loadedGeminiPath) {
          setGeminiPathError(t("chat.errors.geminiPathMissing"));
        } else {
          setGeminiPathError("");
        }
      } catch (error) {
        console.error("Failed to load geminiPath from global config:", error);
        setGeminiPath(undefined);
        setGeminiPathError(t("chat.errors.configLoadFailed"));
      }
    };

    if (globalConfig) {
      loadGeminiPath();
    }
  }, [globalConfig]);

  // Scan workspace for files and folders
  useEffect(() => {
    if (workspace?.path) {
      scanWorkspace(workspace.path)
        .then((items) => {
          setWorkspaceItems(items); // Store original items
          const suggestions = getSuggestions(items);
          setWorkspaceSuggestions(suggestions);
        })
        .catch((error) => {
          console.error("Failed to scan workspace:", error);
          // Fallback to basic suggestions
          setWorkspaceSuggestions(["codebase"]);
          setWorkspaceItems([]);
        });
    }
  }, [workspace?.path]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages]);

  // Update elapsed time in real-time
  useEffect(() => {
    if (!currentSession) {
      setElapsedTime("");
      return;
    }

    const updateElapsedTime = () => {
      setElapsedTime(formatElapsedTime(currentSession.createdAt));
    };

    // Update immediately
    updateElapsedTime();

    // Update every second
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [currentSession]);

  // Check for compact warning based on message count
  useEffect(() => {
    if (!currentSession) {
      setShowCompactWarning(false);
      return;
    }

    const messageCount = currentSession.messages.filter(
      (msg) => msg.role !== "system"
    ).length;
    setShowCompactWarning(messageCount >= maxMessagesBeforeCompact);
  }, [currentSession, maxMessagesBeforeCompact]);

  // Handle command and file suggestions
  useEffect(() => {
    const text = inputValue.substring(0, cursorPosition);
    const lastWord = text.split(/\s/).pop() || "";

    // Command suggestions
    if (lastWord.startsWith("/")) {
      const query = lastWord.substring(1).toLowerCase();
      const commands = ["compact", "fixchat", "init"];
      const filtered = commands.filter((cmd) => cmd.startsWith(query));
      setCommandSuggestions(filtered);
      setShowCommandSuggestions(filtered.length > 0);
      setShowFileSuggestions(false);
    }
    // File suggestions
    else if (lastWord.startsWith("#")) {
      const query = lastWord.substring(1).toLowerCase(); // Remove # for matching
      // Debounced workspace rescan to refresh suggestions in real-time when typing '#'
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
      scanDebounceRef.current = setTimeout(() => {
        if (workspace?.path) {
          scanWorkspace(workspace.path)
            .then((items) => {
              setWorkspaceItems(items);
              const suggestions = getSuggestions(items);
              setWorkspaceSuggestions(suggestions);
            })
            .catch((error) => {
              console.error("Failed to scan workspace (debounced):", error);
            });
        }
      }, 300);
      // Filter suggestions by matching the query against the suggestion text
      // This allows #config to match #file:config.json or #folder:config
      const filtered = workspaceSuggestions.filter((suggestion) => {
        const suggestionWithoutHash = suggestion.substring(1).toLowerCase(); // Remove # prefix
        return suggestionWithoutHash.includes(query);
      });
      setFileSuggestions(filtered);
      setShowFileSuggestions(filtered.length > 0);
      setShowCommandSuggestions(false);
    } else {
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);
    }
  }, [inputValue, cursorPosition, workspaceSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const lineHeight = 20; // Approximate line height
    const maxLines = 4;
    const maxHeight = lineHeight * maxLines;
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    setTextareaHeight(`${newHeight}px`);
  };

  const insertSuggestion = (suggestion: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = inputValue;
    const cursorPos = cursorPosition;

    // Find the start of the current word (command or file)
    let wordStart = cursorPos - 1;
    while (
      wordStart >= 0 &&
      text[wordStart] !== " " &&
      text[wordStart] !== "\n"
    ) {
      wordStart--;
    }
    wordStart++;

    const before = text.substring(0, wordStart);
    const after = text.substring(cursorPos);
    // Suggestion already includes the prefix (# or /)
    const newText = before + suggestion + " " + after;

    setInputValue(newText);
    setShowCommandSuggestions(false);
    setShowFileSuggestions(false);

    // Set flag to prevent immediate Enter key from sending
    setRecentlyCompletedSuggestion(true);

    // Reset the flag after a short delay
    setTimeout(() => {
      setRecentlyCompletedSuggestion(false);
    }, 100);

    // Set cursor position after the inserted text and ensure suggestions are closed
    setTimeout(() => {
      const newPos = wordStart + suggestion.length + 1;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
      // Ensure suggestions are closed after input change
      setShowCommandSuggestions(false);
      setShowFileSuggestions(false);
    }, 0);
  };

  const processCommand = async (command: string, args: string) => {
    if (command === "compact") {
      if (!currentSession) return;

      setShowProcessingModal(true);
      setProcessingMessage(t("chat.stats.processing.compacting"));
      const startTime = Date.now();

      // Update elapsed time every second
      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        // Build conversation history (exclude system messages)
        const historyMessages = currentSession.messages.filter(
          (msg) => msg.role !== "system"
        );

        // Check if there's any conversation to summarize
        if (historyMessages.length === 0) {
          clearInterval(interval);
          setShowProcessingModal(false);

          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "assistant",
            content: t("chat.stats.processing.compactError"),
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, errorMessage);
          return;
        }

        const historyText = historyMessages
          .map(
            (msg) =>
              `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
          )
          .join("\n\n");

        const historyJson = historyMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Use a concise prompt and provide the full conversation as a file via options.
        // geminiCUI will write the conversation file under workspace/temp/GeminiTemp and
        // pass @file:<path> to the CLI so the model can read it. This avoids embedding
        // large history directly in the command line.
        const summaryPrompt = t("chat.stats.processing.compactPrompt");

        const summaryResponse = await callGemini(
          summaryPrompt,
          workspace.path,
          {
            approvalMode: "yolo", // Use yolo mode for summary to avoid approval
            model: "gemini-2.5-flash", // Use fast model for summary
            customApiKey: customApiKey,
            conversationHistory: historyText,
            conversationHistoryJson: historyJson,
            workspaceId: workspace.id,
            sessionId: currentSessionId,
          },
          googleCloudProjectId,
          geminiPath
        );

        clearInterval(interval);
        setShowProcessingModal(false);

        // Validate response
        if (
          !summaryResponse.response ||
          summaryResponse.response.trim() === ""
        ) {
          throw new Error(t("chat.errors.compactEmptyHistory"));
        }

        // Clean up the response - remove any existing summary headers
        let cleanedSummary = summaryResponse.response.trim();

        // Remove common summary headers that Gemini might add
        cleanedSummary = cleanedSummary
          .replace(/^📝\s*会話履歴の要約[::\s]*/i, "")
          .replace(/^会話履歴の要約[::\s]*/i, "")
          .replace(/^[*\*]+会話履歴の要約[*\*]+[::\s]*/i, "")
          .replace(/^#{1,6}\s*会話履歴の要約[::\s]*/i, "")
          .trim();

        // Step 1: Add summary message first (as system message)
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "system",
          content: `📝 **会話履歴の要約**\n\n${cleanedSummary}`,
          timestamp: new Date(),
          hidden: true,
        };
        onSendMessage(currentSessionId, systemMessage);

        // Wait a bit to ensure messages are saved
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Compact the session (remove non-system messages)
        await onCompactSession(currentSessionId);

        // Add final confirmation (single message)
        const finalMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.errors.compactCompleted"),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, finalMessage);
      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error("Error compacting conversation:", error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.compactCommandFailed").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === "init") {
      setShowProcessingModal(true);
      setProcessingMessage(t("chat.errors.initGenerating"));
      const startTime = Date.now();

      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        const geminiFilePath = `${workspace.path}/Gemini.md`;
        const hadExistingGemini = await fsPlugin.exists(geminiFilePath);

        let existingGeminiContent = "";
        if (hadExistingGemini) {
          try {
            existingGeminiContent = await fsPlugin.readTextFile(geminiFilePath);
          } catch (readError) {
            console.warn("Failed to read existing Gemini.md:", readError);
          }
        }

        const basePrompt = `You are a project analyzer. Analyze this workspace comprehensively and deliver a detailed Gemini.md file.\n\n## Workspace Exploration\n- Use the available tools (for example, glob and read_file) to inspect directories and gather the information you need.\n- Verify important files and configuration by actually reading them.\n\n## Documentation Requirements\nProvide a complete analysis covering:\n\n### Project Overview\n- Project name and purpose\n- Technology stack and frameworks used\n- Target platform and environment\n\n### Architecture & Structure\n- Overall architecture and design patterns\n- Key components and their responsibilities\n- File organization and directory structure\n- Configuration files and their purposes\n\n### Features & Functionality\n- Complete list of implemented features\n- Available APIs and their usage\n- User interface components and workflows\n- Data models and storage solutions\n\n### Technical Details\n- Build system and deployment process\n- Dependencies and external libraries\n- Development tools and scripts\n- Security considerations and authentication\n\n### Code Quality & Standards\n- Coding conventions and style guidelines\n- Testing approach and coverage\n- Documentation standards\n- Performance considerations and optimisations\n\n### Development Workflow\n- Setup and installation instructions\n- Development environment requirements\n- Build and run commands\n- Contribution guidelines\n\n## Output Expectations\n- Return the full Gemini.md content in Markdown.\n- Ensure the result can replace the Gemini.md file entirely.\n- Highlight anything the next developer or AI assistant must know to work effectively.`;

        const normalizedExistingContent = existingGeminiContent
          .replace(/\r/g, "")
          .trim();
        let initPrompt = "";

        if (hadExistingGemini) {
          initPrompt = `${basePrompt}\n\nAn existing Gemini.md file is already present. Review the current content enclosed between <current_gemini_md> markers, then update it to reflect the latest project state. Preserve useful insights, expand missing sections, and correct any outdated information. Produce a full replacement for Gemini.md.\n\n<current_gemini_md>\n${normalizedExistingContent || "(The file is currently empty.)"}\n</current_gemini_md>`;
        } else {
          initPrompt = `${basePrompt}\n\nNo Gemini.md file exists yet. Explore the workspace with the available tools and create a comprehensive Gemini.md from scratch.`;
        }

        const initResponse = await callGemini(
          initPrompt,
          workspace.path,
          {
            approvalMode: "yolo", // Force yolo mode for init command as requested
            model: "gemini-2.5-flash",
            customApiKey: customApiKey,
            includeDirectories: ["."], // Allow the model to inspect the workspace structure via tools
          },
          googleCloudProjectId,
          geminiPath
        );

        clearInterval(interval);
        setShowProcessingModal(false);

        // Check if AI actually created or updated the file using tools
        const fileExists = await fsPlugin.exists(geminiFilePath);
        const fileStats = initResponse.stats?.files;
        const hasFileChanges = fileStats
          ? fileStats.totalLinesAdded > 0 || fileStats.totalLinesRemoved > 0
          : false;

        if (fileExists && hasFileChanges) {
          // AI successfully created or updated the file using tools
          const successMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "system",
            content: hadExistingGemini
              ? `✅ Gemini.mdを更新しました。#file:Gemini.md`
              : `✅ Gemini.mdが正常に作成されました。#file:Gemini.md`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, successMessage);
        } else {
          // AI didn't create the file or file creation failed
          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "assistant",
            content: t("chat.errors.initFailed"),
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, errorMessage);
        }
      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error("Error creating Gemini.md:", error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.initFailedWithError").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === "fixchat") {
      if (!args.trim()) {
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.fixchatNoText"),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
        return;
      }

      setShowProcessingModal(true);
      setProcessingMessage(t("chat.errors.fixchatProcessing"));
      const startTime = Date.now();

      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        const improvementPrompt = `以下のユーザーメッセージを、AIが理解しやすく、より具体的で明確な表現に改善してください。改善後のメッセージのみを返してください。余計な説明や前置きは不要です:\n\n${args}`;

        const improvedResponse = await callGemini(
          improvementPrompt,
          workspace.path,
          {
            approvalMode: approvalMode,
            model: "gemini-2.5-flash", // Use fast model
            customApiKey: customApiKey,
          },
          googleCloudProjectId,
          geminiPath
        );

        clearInterval(interval);
        setShowProcessingModal(false);

        // Set the improved message directly to the input field
        const improvedText = improvedResponse.response.trim();

        setInputValue(improvedText);

        // Focus the textarea and adjust its height
        setTimeout(() => {
          if (textareaRef.current) {
            const textarea = textareaRef.current;

            // Directly set value and fire change event (React controlled component updating)
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              "value"
            )?.set;

            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(textarea, improvedText);
              const event = new Event("input", { bubbles: true });
              textarea.dispatchEvent(event);
              console.log("Dispatched input event");
            }

            // Add a visual highlight effect
            textarea.classList.add("improved-message");
            setTimeout(() => {
              textarea.classList.remove("improved-message");
            }, 2000);

            // Focus and adjust height
            textarea.focus();
            textarea.style.height = "auto";
            const scrollHeight = textarea.scrollHeight;
            const lineHeight = 20;
            const maxLines = 4;
            const maxHeight = lineHeight * maxLines;
            const newHeight = Math.min(scrollHeight, maxHeight);
            textarea.style.height = `${newHeight}px`;
            setTextareaHeight(`${newHeight}px`);

            // Place cursor at the end
            textarea.setSelectionRange(
              improvedText.length,
              improvedText.length
            );
          } else {
            console.error("textareaRef.current is null!");
          }
        }, 100);
      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error("Error improving message:", error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("chat.errors.fixchatCommandFailed").replace(
            "{error}",
            error instanceof Error ? error.message : "Unknown error"
          ),
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession) return;

    // Prevent sending another message while a request is in-flight
    if (isTyping) {
      // ignore additional send attempts until current response completes
      return;
    }

    // Reset the recentlyCompletedSuggestion flag to ensure future messages can be sent
    setRecentlyCompletedSuggestion(false);

    // Check if it's a command
    const trimmedInput = inputValue.trim();
    if (trimmedInput.startsWith("/")) {
      const parts = trimmedInput.substring(1).split(" ");
      const command = parts[0];
      const args = parts.slice(1).join(" ");

      await processCommand(command, args);
      setInputValue("");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
      tokenUsage: Math.ceil(inputValue.length / 4), // Estimate tokens for user message
    };

    // Mark as typing/request-in-flight immediately to prevent races
    setIsTyping(true);

    // Send the user message so it appears in the UI immediately
    onSendMessage(currentSessionId, userMessage);
    setInputValue("");
    // start timer for this request
    requestStartRef.current = Date.now();
    setRequestElapsedTime(0);

    // Start elapsed time counter
    requestIntervalRef.current = setInterval(() => {
      if (requestStartRef.current) {
        setRequestElapsedTime(
          Math.floor((Date.now() - requestStartRef.current) / 1000)
        );
      }
    }, 1000);

    try {
      // Parse includes from input with workspace items for directory verification
      const { includes, directories } = parseIncludes(
        inputValue,
        workspaceItems
      );

      // Build conversation history for context
      // Exclude system messages (summaries) and include all user/assistant messages
      // This ensures the AI has access to the full conversation context
      const allMessages = currentSession.messages
        .filter((msg) => msg.role !== "system");

      const conversationHistoryJson = allMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const conversationHistory = allMessages
        .map((msg) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          return `${role}: ${msg.content}`;
        })
        .join("\n\n");

      const options: GeminiOptions = {
        approvalMode: approvalMode,
        includes: includes.length > 0 ? includes : undefined,
        includeDirectories: directories.length > 0 ? directories : undefined,
        conversationHistory:
          conversationHistory && allMessages.length > 0
            ? conversationHistory
            : undefined,
        conversationHistoryJson:
          conversationHistoryJson.length > 0
            ? conversationHistoryJson
            : undefined,
        workspaceId: workspace.id,
        sessionId: currentSessionId,
      };

      console.log(
        "Sending message with conversation history:",
        conversationHistory ? "Yes" : "No"
      );
      
      // Response mode handling: async (current) vs stream (future)
      // Currently, only async mode is fully implemented
      // Stream mode will be implemented in future updates
      let geminiResponse;
      if (responseMode === 'stream') {
        // TODO: Future implementation - Stream mode
        // For now, fallback to async mode
        console.warn('Stream mode is not yet implemented, using async mode');
        geminiResponse = await callGemini(
          inputValue,
          workspace.path,
          options,
          googleCloudProjectId,
          geminiPath
        );
      } else {
        // Async mode (default)
        geminiResponse = await callGemini(
          inputValue,
          workspace.path,
          options,
          googleCloudProjectId,
          geminiPath
        );
      }

      // Calculate total tokens from stats
      let totalTokens = 0;
      if (geminiResponse.stats && geminiResponse.stats.models) {
        totalTokens = Object.values(geminiResponse.stats.models).reduce(
          (sum, model) => {
            return sum + (model.tokens?.total || 0);
          },
          0
        );
      }

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: geminiResponse.response,
        timestamp: new Date(),
        tokenUsage: totalTokens,
        stats: geminiResponse.stats,
      };
      onSendMessage(currentSessionId, aiMessage);

      // Reset request timer
      if (requestStartRef.current) {
        requestStartRef.current = null;
      }
    } catch (error) {
      // Detect FatalToolExecutionError and suggest approval mode changes
      try {
        const errObj =
          error && typeof error === "object" ? (error as any) : null;
        const errType = errObj?.type || errObj?.error?.type || undefined;
        const errMessage =
          errObj?.message || errObj?.error?.message || String(error);

        // Check for geminiPath error
        if (
          errMessage.includes("Command failed with code 1") &&
          (errMessage.includes("is not recognized as the name of a cmdlet") ||
            errMessage.includes("gemini.ps1"))
        ) {
          const pathErrorMessage: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: `❌ **Gemini CLI パスエラー**\n\ngemini.ps1 のパスが正しく設定されていないか、ファイルが見つかりません。\n\n**エラー詳細:**\n\`\`\`\n${errMessage}\n\`\`\`\n\n**対処方法:**\n1. 設定画面を開く（右上の⚙️ボタン）\n2. 「Gemini CLI パス設定」セクションで「🔍 自動検出」ボタンをクリック\n3. パスが自動的に検出されない場合は、手動で正しいパスを入力してください\n\n**ヒント:**\n- 通常、gemini.ps1 は npm のグローバルインストールディレクトリにあります\n- 例: \`C:\\\\Users\\\\YourName\\\\AppData\\\\Roaming\\\\npm\\\\gemini.ps1\`\n- コマンド \`npm config get prefix\` で確認できます`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, pathErrorMessage);
          return; // Skip default error message
        }

        if (errType === "FatalToolExecutionError") {
          const adviseMessage: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: `⚠️ ツールの実行で権限エラーが発生しました: ${errMessage}\n\nこの操作にはツールの実行権限が必要です。設定から承認モードを「auto_edit」または「yolo」に変更して自動承認を許可しますか？\n- auto_edit: 編集ツールを自動承認\n- yolo: すべてのツールを自動承認\n\n現在の承認モード: ${approvalMode}\n設定を変更する場合はSettingsで更新してください。`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, adviseMessage);
          return; // Skip default error message
        }
      } catch (parseErr) {
        console.error(
          "Error parsing error object for FatalToolExecutionError:",
          parseErr
        );
      }
      console.error("Error calling Gemini:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t("chat.errors.geminiError").replace(
          "{error}",
          error instanceof Error ? error.message : "Unknown error"
        ),
        timestamp: new Date(),
      };
      onSendMessage(currentSessionId, errorMessage);
    } finally {
      setIsTyping(false);
      // Clear the elapsed time counter
      if (requestIntervalRef.current) {
        clearInterval(requestIntervalRef.current);
        requestIntervalRef.current = null;
      }
      setRequestElapsedTime(0);
    }
  };

  const handleNewChat = async () => {
    const success = await onCreateNewSession();
    if (!success) {
      alert(t("chat.sessionLimit"));
    }
  };

  const handleRenameSession = (sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId);
    setEditingSessionName(currentName);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingSessionName.trim()) {
      onRenameSession(sessionId, editingSessionName.trim());
    }
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  // Helper to safely render translations that may contain simple <strong>...</strong> markers.
  // This converts <strong>...</strong> into React <strong> elements while leaving other text as strings.
  const renderWithStrong = (text: string) => {
    if (!text) return null;
    const regex = /<strong>(.*?)<\/strong>/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }
      parts.push(
        React.createElement(
          "strong",
          { key: `strong-${idx}` },
          match[1]
        )
      );
      lastIndex = regex.lastIndex;
      idx++;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="back-button secondary" onClick={onBack}>
          ← {workspace.name}
        </button>
        <div className="chat-stats">
          <div className="stat">
            <span className="stat-label">{t("chat.tokenUsage")}:</span>
            <span className="stat-value">
              {formatNumber(currentSession?.tokenUsage || 0)} /{" "}
              {formatNumber(totalTokens)}
            </span>
          </div>
          {currentSession && (
            <div className="stat">
              <span className="stat-label">{t("chat.elapsedTime")}:</span>
              <span className="stat-value">{elapsedTime}</span>
            </div>
          )}
        </div>
        <button
          className="stats-button secondary"
          onClick={() => setShowStatsModal(true)}
        >
          {t("chat.stats.button")}
        </button>
        <button
          className="new-chat-button primary"
          onClick={handleNewChat}
          disabled={maxSessionsReached}
        >
          ✨ {t("chat.newChat")}
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-sidebar">
          <div className="sessions-header">
            <h3>{t("chat.sessions")}</h3>
            <span className="session-count">{sessions.length}/5</span>
          </div>
          <div className="sessions-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${
                  session.id === currentSessionId ? "active" : ""
                }`}
                onClick={() => onSwitchSession(session.id)}
              >
                <div className="session-info">
                  {editingSessionId === session.id ? (
                    <input
                      type="text"
                      className="session-name-input"
                      value={editingSessionName}
                      onChange={(e) => setEditingSessionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveRename(session.id);
                        } else if (e.key === "Escape") {
                          handleCancelRename();
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => handleSaveRename(session.id)}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="session-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRenameSession(session.id, session.name);
                      }}
                      title="Double-click to rename"
                    >
                      {session.name}
                    </span>
                  )}
                  {isTyping && session.id === currentSessionId ? (
                    <div className="request-timer">
                      <div className="timer-spinner"></div>
                      <span className="timer-text">{requestElapsedTime}s</span>
                    </div>
                  ) : (
                    <span className="session-tokens">
                      {formatNumber(session.tokenUsage)} tokens
                    </span>
                  )}
                </div>
                {sessions.length > 1 && (
                  <button
                    className="delete-session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="chat-main">
          {geminiPathError && (
            <div className="error-banner">
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{geminiPathError}</span>
                <button
                  className="error-dismiss"
                  onClick={() => setGeminiPathError("")}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <div className="messages-container">
            {(() => {
              return currentSession?.messages.length === 0 ? (
                <div className="empty-state">
                  <div className="gemini-logo">
                    <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="20" fill="url(#gradient)" />
                      <defs>
                        <linearGradient
                          id="gradient"
                          x1="4"
                          y1="4"
                          x2="44"
                          y2="44"
                        >
                          <stop offset="0%" stopColor="#4285f4" />
                          <stop offset="100%" stopColor="#9334e6" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <p>{t("chat.noMessages")}</p>
                </div>
              ) : (
                currentSession?.messages
                  .filter((message) => !message.hidden)
                  .map((message) => (
                    <ChatMessageBubble
                      key={message.id}
                      message={message}
                      workspace={workspace}
                      onResendMessage={async (newMessage) => {
                        // Call resend to update the session history
                        onResendMessage(
                          currentSessionId,
                          message.id,
                          newMessage
                        );

                        // If it's a user message, call Gemini API with the new content
                        if (newMessage.role === "user") {
                          setIsTyping(true);
                          // Start timer for resend request
                          requestStartRef.current = Date.now();
                          setRequestElapsedTime(0);

                          // Start elapsed time counter
                          requestIntervalRef.current = setInterval(() => {
                            if (requestStartRef.current) {
                              setRequestElapsedTime(
                                Math.floor(
                                  (Date.now() - requestStartRef.current) / 1000
                                )
                              );
                            }
                          }, 1000);
                          try {
                            const { includes, directories } = parseIncludes(
                              newMessage.content,
                              workspaceItems
                            );

                            // Build conversation history up to this point
                            const messageIndex =
                              currentSession.messages.findIndex(
                                (m) => m.id === message.id
                              );
                            const previousMessages = currentSession.messages
                              .slice(0, messageIndex)
                              .filter((msg) => msg.role !== "system");
                              // Include all previous messages for full context

                            const conversationHistoryJson =
                              previousMessages.map((msg) => ({
                                role: msg.role,
                                content: msg.content,
                              }));

                            const conversationHistory = previousMessages
                              .map((msg) => {
                                const role =
                                  msg.role === "user" ? "User" : "Assistant";
                                return `${role}: ${msg.content}`;
                              })
                              .join("\n\n");

                            const options: GeminiOptions = {
                              approvalMode: approvalMode,
                              includes:
                                includes.length > 0 ? includes : undefined,
                              includeDirectories:
                                directories.length > 0
                                  ? directories
                                  : undefined,
                              conversationHistory:
                                conversationHistory &&
                                previousMessages.length > 0
                                  ? conversationHistory
                                  : undefined,
                              conversationHistoryJson:
                                conversationHistoryJson.length > 0
                                  ? conversationHistoryJson
                                  : undefined,
                              workspaceId: workspace.id,
                              sessionId: currentSessionId,
                            };

                            console.log(
                              "Resending message with conversation history:",
                              conversationHistory ? "Yes" : "No"
                            );
                            const geminiResponse = await callGemini(
                              newMessage.content,
                              workspace.path,
                              options,
                              googleCloudProjectId,
                              geminiPath
                            );

                            // Check if the response contains a FatalToolExecutionError
                            let responseContent = geminiResponse.response;
                            let hasFatalError = false;
                            let fatalErrorObj: any = null;

                            try {
                              // Try to parse the response as JSON to check for FatalToolExecutionError
                              const parsedResponse =
                                JSON.parse(responseContent);
                              if (
                                parsedResponse &&
                                typeof parsedResponse === "object" &&
                                parsedResponse.error
                              ) {
                                const errorObj = parsedResponse.error;
                                if (
                                  errorObj.type === "FatalToolExecutionError"
                                ) {
                                  hasFatalError = true;
                                  fatalErrorObj = errorObj;
                                  console.log(
                                    "FatalToolExecutionError found in response:",
                                    errorObj
                                  );
                                }
                              }
                            } catch (parseError) {
                              // Not JSON, treat as normal response
                              console.log(
                                "Response is not JSON, treating as normal response"
                              );
                            }

                            if (hasFatalError) {
                              // Handle FatalToolExecutionError from response
                              const errType = fatalErrorObj.type;
                              const errCode = fatalErrorObj.code;
                              const errMessage = fatalErrorObj.message;

                              console.log(
                                "Handling FatalToolExecutionError from response:",
                                { errType, errCode, errMessage }
                              );

                              const isInvalidParamsError =
                                errCode === "invalid_tool_params" ||
                                errMessage.includes(
                                  "must be within one of the workspace directories"
                                );
                              const isToolNameError =
                                errCode === "tool_not_registered" ||
                                errMessage.includes("not found in registry") ||
                                (errMessage.includes("Tool") &&
                                  errMessage.includes("not found"));

                              if (isInvalidParamsError) {
                                const adviseMessage: ChatMessage = {
                                  id: (Date.now() + 1).toString(),
                                  role: "assistant",
                                  content: `⚠️ **ファイルアクセスエラー**: ${errMessage}\n\n🔧 **解決方法**:\n• 操作できるファイル/フォルダは現在のワークスペース配下のみです（現在のワークスペース: \`${workspace.path}\`）。\n• 対象ファイルをワークスペースフォルダの中へ移動するか、\`#file:...\` や \`#folder:...\` プレフィックスを使って明示的に指定してください。\n• 一時ファイルを扱う場合は \`Documents/PEXData/GeminiGUI/Chatrequest/${workspace.id}\` 配下を利用してください。`,
                                  timestamp: new Date(),
                                };
                                console.log(
                                  "Sending invalid tool params guidance from response"
                                );
                                onSendMessage(currentSessionId, adviseMessage);
                              } else if (isToolNameError) {
                                // Tool name error - provide guidance about available tools
                                const adviseMessage: ChatMessage = {
                                  id: (Date.now() + 1).toString(),
                                  role: "assistant",
                                  content: `⚠️ **ツール名エラー**: ${errMessage}\n\n🔧 **解決方法**: AIが間違ったツール名を使用しようとしました。\n\n**利用可能なツール**:\n• \`read_file\` - ファイルの内容を読み取る\n• \`web_fetch\` - ウェブページの内容を取得\n• \`glob\` - ファイル検索\n\n**考えられる原因**:\n• AIの設定やプロンプトに問題がある可能性があります\n• 必要に応じて設定画面からモデルやAPIキーを確認してください\n\n別の方法でリクエストを試すか、設定を見直してください。`,
                                  timestamp: new Date(),
                                };
                                console.log(
                                  "Sending tool name error guidance from response"
                                );
                                onSendMessage(currentSessionId, adviseMessage);
                              } else {
                                // Approval mode error - suggest changing approval mode
                                const adviseMessage: ChatMessage = {
                                  id: (Date.now() + 1).toString(),
                                  role: "assistant",
                                  content: `⚠️ **ツール実行エラー**: ${errMessage}\n\n🔧 **解決方法**: 承認モードが「default」のため、ツールの実行が制限されています。\n\n**以下のいずれかのモードに変更してください：**\n• **auto_edit**: 編集ツールを自動承認\n• **yolo**: すべてのツールを自動承認\n\n設定画面から承認モードを変更してください。`,
                                  timestamp: new Date(),
                                };
                                console.log(
                                  "Sending approval mode error guidance from response"
                                );
                                onSendMessage(currentSessionId, adviseMessage);
                              }
                            } else {
                              // Normal response - calculate total tokens from stats
                              let totalTokens = 0;
                              if (
                                geminiResponse.stats &&
                                geminiResponse.stats.models
                              ) {
                                totalTokens = Object.values(
                                  geminiResponse.stats.models
                                ).reduce((sum, model) => {
                                  return sum + (model.tokens?.total || 0);
                                }, 0);
                              }

                              const aiMessage: ChatMessage = {
                                id: (Date.now() + 1).toString(),
                                role: "assistant",
                                content: responseContent,
                                timestamp: new Date(),
                                tokenUsage: totalTokens,
                                stats: geminiResponse.stats,
                              };
                              onSendMessage(currentSessionId, aiMessage);
                            }
                          } catch (error) {
                            console.error("Error calling Gemini:", error);
                            const errorMessage: ChatMessage = {
                              id: (Date.now() + 2).toString(),
                              role: "assistant",
                              content: t("chat.errors.geminiError").replace(
                                "{error}",
                                error instanceof Error
                                  ? error.message
                                  : "Unknown error"
                              ),
                              timestamp: new Date(),
                            };
                            onSendMessage(currentSessionId, errorMessage);
                          } finally {
                            setIsTyping(false);
                            // Clear the elapsed time counter
                            if (requestIntervalRef.current) {
                              clearInterval(requestIntervalRef.current);
                              requestIntervalRef.current = null;
                            }
                            setRequestElapsedTime(0);
                          }
                        }
                      }}
                    />
                  ))
              );
            })()}
            {isTyping && (
              <div className="message assistant">
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            {(showCommandSuggestions || showFileSuggestions) && (
              <div className="suggestions-popup">
                {showCommandSuggestions &&
                  commandSuggestions.map((cmd) => (
                    <div
                      key={cmd}
                      className="suggestion-item"
                      data-type="command"
                      onClick={() => insertSuggestion(`/${cmd}`)}
                    >
                      /{cmd} - {t(`chat.commands.${cmd}`)}
                    </div>
                  ))}
                {showFileSuggestions &&
                  fileSuggestions.map((file) => {
                    // Determine the type based on the prefix
                    let dataType = "file";
                    if (file === "#codebase") {
                      dataType = "codebase";
                    } else if (file.startsWith("#folder:")) {
                      dataType = "folder";
                    }

                    return (
                      <div
                        key={file}
                        className="suggestion-item"
                        data-type={dataType}
                        onClick={() => insertSuggestion(file)}
                      >
                        {file}
                      </div>
                    );
                  })}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  if (!isTyping) {
                    handleSendMessage();
                  }
                } else if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !showCommandSuggestions &&
                  !showFileSuggestions &&
                  !recentlyCompletedSuggestion
                ) {
                  // Allow Enter for new line, but only Ctrl+Enter sends
                  // This prevents accidental sends and multiple suggestions
                  e.preventDefault();
                }
                // Handle suggestion selection with Enter/Tab
                if (
                  (e.key === "Enter" || e.key === "Tab") &&
                  (showCommandSuggestions || showFileSuggestions)
                ) {
                  e.preventDefault();
                  const suggestions = showCommandSuggestions
                    ? commandSuggestions
                    : fileSuggestions;
                  if (suggestions.length > 0) {
                    const suggestion = showCommandSuggestions
                      ? `/${suggestions[0]}`
                      : suggestions[0];
                    insertSuggestion(suggestion);
                  }
                }
              }}
              placeholder={t("chat.placeholder")}
              disabled={isTyping}
              rows={1}
              style={{ height: textareaHeight }}
            />
            <button
              className="send-button primary"
              onClick={handleSendMessage}
                disabled={!inputValue.trim() || isTyping}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {showStatsModal && (
        <StatsModal
          sessions={sessions}
          totalTokens={totalTokens}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {showProcessingModal && (
        <ProcessingModal
          message={processingMessage}
          elapsedSeconds={processingElapsed}
        />
      )}

      {showCompactWarning && (
        <div className="compact-warning">
          <div className="warning-content">
            <span className="warning-icon">⚠️</span>
            <span className="warning-text">
              {t("chat.compactWarning.messageCountExceeded").replace("{maxMessagesBeforeCompact}", maxMessagesBeforeCompact.toString())}
              <br />
              {renderWithStrong(t("chat.compactWarning.recommendCompactOrNew"))}
            </span>
            <button
              className="warning-close"
              onClick={() => setShowCompactWarning(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}