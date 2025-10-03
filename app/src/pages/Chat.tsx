import { useState, useRef, useEffect } from 'react';
import { ChatSession, ChatMessage, Workspace } from '../types';
import { t } from '../utils/i18n';
import { formatElapsedTime, formatNumber } from '../utils/storage';
import { callGemini, GeminiOptions } from '../utils/geminiCUI';
import { scanWorkspace, getSuggestions, parseIncludes, FileItem } from '../utils/workspace';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Command } from '@tauri-apps/plugin-shell';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import './Chat.css';

// Markdown components for syntax highlighting
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match) {
      if (match[1] === 'markdown') {
        // For markdown code blocks, render the content as markdown
        return (
          <div className="markdown-preview">
            <ReactMarkdown>
              {String(children)}
            </ReactMarkdown>
          </div>
        );
      } else {
        return (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }
    } else {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  },
};

interface ChatProps {
  workspace: Workspace;
  sessions: ChatSession[];
  currentSession: ChatSession | undefined;
  currentSessionId: string;
  maxSessionsReached: boolean;
  approvalMode: 'default' | 'auto_edit' | 'yolo';
  totalTokens: number;
  customApiKey?: string;
  googleCloudProjectId?: string;
  maxMessagesBeforeCompact: number;
  onCreateNewSession: () => Promise<boolean>;
  onSwitchSession: (id: string) => void;
  onSendMessage: (sessionId: string, message: ChatMessage) => void;
  onResendMessage: (sessionId: string, messageId: string, newMessage: ChatMessage) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newName: string) => void;
  onCompactSession: (sessionId: string) => Promise<void>;
  onBack: () => void;
}

export default function Chat({
  workspace,
  sessions,
  currentSession,
  currentSessionId,
  maxSessionsReached,
  approvalMode,
  totalTokens,
  customApiKey,
  googleCloudProjectId,
  maxMessagesBeforeCompact,
  onCreateNewSession,
  onSwitchSession,
  onSendMessage,
  onResendMessage,
  onDeleteSession,
  onRenameSession,
  onCompactSession,
  onBack,
}: ChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [workspaceSuggestions, setWorkspaceSuggestions] = useState<string[]>([]);
  const [workspaceItems, setWorkspaceItems] = useState<FileItem[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('');
  const [textareaHeight, setTextareaHeight] = useState('auto');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [showCompactWarning, setShowCompactWarning] = useState(false);
  const [requestElapsedTime, setRequestElapsedTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestStartRef = useRef<number | null>(null);
  const requestIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [geminiPath, setGeminiPath] = useState<string | undefined>();
  const [recentlyCompletedSuggestion, setRecentlyCompletedSuggestion] = useState(false);

  // Load geminiPath from config on workspace change
  useEffect(() => {
    const loadGeminiPath = async () => {
      try {
        const { Config } = await import('../utils/configAPI');
        const workspaceConfig = new Config(`${workspace.id}\\.geminiconfig`);
        const config = await workspaceConfig.loadConfig();
        setGeminiPath(config?.geminiPath);
      } catch (error) {
        console.error('Failed to load geminiPath from config:', error);
        setGeminiPath(undefined);
      }
    };

    if (workspace?.id) {
      loadGeminiPath();
    }
  }, [workspace?.id]);

  // Scan workspace for files and folders
  useEffect(() => {
    if (workspace?.path) {
      scanWorkspace(workspace.path).then((items) => {
        setWorkspaceItems(items); // Store original items
        const suggestions = getSuggestions(items);
        setWorkspaceSuggestions(suggestions);
      }).catch((error) => {
        console.error('Failed to scan workspace:', error);
        // Fallback to basic suggestions
        setWorkspaceSuggestions(['codebase']);
        setWorkspaceItems([]);
      });
    }
  }, [workspace?.path]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Update elapsed time in real-time
  useEffect(() => {
    if (!currentSession) {
      setElapsedTime('');
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

    const messageCount = currentSession.messages.filter(msg => msg.role !== 'system').length;
    setShowCompactWarning(messageCount >= maxMessagesBeforeCompact);
  }, [currentSession, maxMessagesBeforeCompact]);

  // Handle command and file suggestions
  useEffect(() => {
    const text = inputValue.substring(0, cursorPosition);
    const lastWord = text.split(/\s/).pop() || '';

    // Command suggestions
    if (lastWord.startsWith('/')) {
      const query = lastWord.substring(1).toLowerCase();
      const commands = ['compact', 'fixchat', 'init'];
      const filtered = commands.filter(cmd => cmd.startsWith(query));
      setCommandSuggestions(filtered);
      setShowCommandSuggestions(filtered.length > 0);
      setShowFileSuggestions(false);
    }
    // File suggestions
    else if (lastWord.startsWith('#')) {
      const query = lastWord.substring(1).toLowerCase(); // Remove # for matching
      // Filter suggestions by matching the query against the suggestion text
      // This allows #config to match #file:config.json or #folder:config
      const filtered = workspaceSuggestions.filter(suggestion => {
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
    textarea.style.height = 'auto';
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
    while (wordStart >= 0 && text[wordStart] !== ' ' && text[wordStart] !== '\n') {
      wordStart--;
    }
    wordStart++;

    const before = text.substring(0, wordStart);
    const after = text.substring(cursorPos);
    // Suggestion already includes the prefix (# or /)
    const newText = before + suggestion + ' ' + after;

    setInputValue(newText);
    setShowCommandSuggestions(false);
    setShowFileSuggestions(false);

    // Set flag to prevent immediate Enter key from sending
    setRecentlyCompletedSuggestion(true);

    // Reset the flag after a short delay
    setTimeout(() => {
      setRecentlyCompletedSuggestion(false);
    }, 100);

    // Set cursor position after the inserted text
    setTimeout(() => {
      const newPos = wordStart + suggestion.length + 1;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  const processCommand = async (command: string, args: string) => {
    if (command === 'compact') {
      if (!currentSession) return;

      setShowProcessingModal(true);
      setProcessingMessage(t('chat.stats.processing.compacting'));
      const startTime = Date.now();

      // Update elapsed time every second
      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        // Build conversation history (exclude system messages)
        const historyMessages = currentSession.messages.filter(msg => msg.role !== 'system');

        // Check if there's any conversation to summarize
        if (historyMessages.length === 0) {
          clearInterval(interval);
          setShowProcessingModal(false);

          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: t('chat.stats.processing.compactError'),
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, errorMessage);
          return;
        }

        const historyText = historyMessages
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');

        console.log('Compacting conversation, history length:', historyText.length);

        const summaryPrompt = `${t('chat.stats.processing.compactPrompt')}\n\n${historyText}`;

        console.log('Calling Gemini for summary...');
        const summaryResponse = await callGemini(summaryPrompt, workspace.path, {
          approvalMode: 'yolo', // Use yolo mode for summary to avoid approval
          model: 'gemini-2.5-flash', // Use fast model for summary
          customApiKey: customApiKey,
        }, googleCloudProjectId, geminiPath);

        console.log('Summary response received:', summaryResponse.response.substring(0, 100) + '...');

        clearInterval(interval);
        setShowProcessingModal(false);

        // Validate response
        if (!summaryResponse.response || summaryResponse.response.trim() === '') {
          throw new Error('要約レスポンスが空です');
        }

        // Clean up the response - remove any existing summary headers
        let cleanedSummary = summaryResponse.response.trim();

        // Remove common summary headers that Gemini might add
        cleanedSummary = cleanedSummary
          .replace(/^📝\s*会話履歴の要約[::\s]*/i, '')
          .replace(/^会話履歴の要約[::\s]*/i, '')
          .replace(/^[\*\*]+会話履歴の要約[\*\*]+[::\s]*/i, '')
          .replace(/^#+\s*会話履歴の要約[::\s]*/i, '')
          .trim();

        // Step 1: Add summary message first (as system message)
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: `📝 **会話履歴の要約**\n\n${cleanedSummary}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, systemMessage);

        // Step 2: Show confirmation message
        const confirmationMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '✅ 会話履歴を要約しました。古いメッセージをクリアして整理します...',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, confirmationMessage);

        // Step 3: Wait a bit to ensure messages are saved
        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 4: Compact the session (remove non-system messages)
        await onCompactSession(currentSessionId);

        // Step 5: Add final confirmation
        const finalMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: '✅ 会話を整理しました。要約は上記のシステムメッセージに保存されています。会話を続けることができます。',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, finalMessage);

      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error('Error compacting conversation:', error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ 会話の要約中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }

    } else if (command === 'init') {
      setShowProcessingModal(true);
      setProcessingMessage('Gemini.mdを生成しています...');
      const startTime = Date.now();

      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        // Create the comprehensive project analysis prompt
        const initPrompt = `あなたはプロジェクトアナライザーとして、このワークスペースの詳細な分析を行い、Gemini.mdファイルを作成してください。

## 分析対象
- OS及び実行環境情報
- プロジェクト構造と主要コンポーネント
- ビルド構造、設定ファイル、パッケージ構成
- このプロジェクトの目的と目標
- 実装済み機能の一覧
- 使用可能な機能とAPI
- 設定や構成パターン
- 依存関係と外部ライブラリ
- 開発ワークフローとプロセス

## 出力制限
- 必ず詳細な情報を含むMarkdown形式で記述
- 使用可能な機能を網羅的に記載
- 他のAIや開発者がこのプロジェクトを完全に理解できる程の詳細度
- 技術仕様、設定、ファイル構造などを具体的に記述

#codebase の内容を分析し、上記の情報をGemini.mdとして出力してください。`;

        const initResponse = await callGemini(initPrompt, workspace.path, {
          approvalMode: 'yolo', // Force yolo mode for init command as requested
          model: 'gemini-2.5-flash',
          customApiKey: customApiKey,
          includes: ['#codebase'] // Include entire codebase for analysis
        }, googleCloudProjectId, geminiPath);

        clearInterval(interval);
        setShowProcessingModal(false);

        // Validate response
        if (!initResponse.response || initResponse.response.trim() === '') {
          throw new Error('Gemini.md作成レスポンスが空です');
        }

        // Save the Gemini.md file
        const filePath = `${workspace.path}/Gemini.md`;
        await writeTextFile(filePath, initResponse.response.trim());

        // Show success message with proper file reference
        const successMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: `Gemini.mdを作成しました。#file:Gemini.md`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, successMessage);

      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error('Error creating Gemini.md:', error);

        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ Gemini.mdの作成中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    } else if (command === 'fixchat') {
      if (!currentSession) return;

      setShowProcessingModal(true);
      setProcessingMessage('AIがメッセージを改善しています...');
      const startTime = Date.now();
      
      // Update elapsed time every second
      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      try {
        // Build conversation history (exclude system messages)
        const historyMessages = currentSession.messages.filter(msg => msg.role !== 'system');
        
        // Check if there's any conversation to summarize
        if (historyMessages.length === 0) {
          clearInterval(interval);
          setShowProcessingModal(false);
          
          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: t('chat.stats.processing.compactError'),
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, errorMessage);
          return;
        }
        
        const historyText = historyMessages
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
        
        console.log('Compacting conversation, history length:', historyText.length);
        
        const summaryPrompt = `${t('chat.stats.processing.compactPrompt')}\n\n${historyText}`;
        
        console.log('Calling Gemini for summary...');
        const summaryResponse = await callGemini(summaryPrompt, workspace.path, {
          approvalMode: 'yolo', // Use yolo mode for summary to avoid approval
          model: 'gemini-2.5-flash', // Use fast model for summary
          customApiKey: customApiKey,
        }, googleCloudProjectId, geminiPath);
        
        console.log('Summary response received:', summaryResponse.response.substring(0, 100) + '...');
        
        clearInterval(interval);
        setShowProcessingModal(false);
        
        // Validate response
        if (!summaryResponse.response || summaryResponse.response.trim() === '') {
          throw new Error('要約レスポンスが空です');
        }
        
        // Clean up the response - remove any existing summary headers
        let cleanedSummary = summaryResponse.response.trim();
        
        // Remove common summary headers that Gemini might add
        cleanedSummary = cleanedSummary
          .replace(/^📝\s*会話履歴の要約[::\s]*/i, '')
          .replace(/^会話履歴の要約[::\s]*/i, '')
          .replace(/^[\*\*]+会話履歴の要約[\*\*]+[::\s]*/i, '')
          .replace(/^#+\s*会話履歴の要約[::\s]*/i, '')
          .trim();
        
        // Step 1: Add summary message first (as system message)
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: `📝 **会話履歴の要約**\n\n${cleanedSummary}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, systemMessage);
        
        // Step 2: Show confirmation message
        const confirmationMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '✅ 会話履歴を要約しました。古いメッセージをクリアして整理します...',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, confirmationMessage);
        
        // Step 3: Wait a bit to ensure messages are saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Step 4: Compact the session (remove non-system messages)
        await onCompactSession(currentSessionId);
        
        // Step 5: Add final confirmation
        const finalMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: '✅ 会話を整理しました。要約は上記のシステムメッセージに保存されています。会話を続けることができます。',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, finalMessage);
        
      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error('Error compacting conversation:', error);
        
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ 会話の要約中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
      
    } else if (command === 'fixchat') {
      if (!args.trim()) {
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '❌ /fixchat コマンドには改善したいテキストを指定してください。\n\n使用例: /fixchat このコードを説明して',
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
        return;
      }
      
      setShowProcessingModal(true);
      setProcessingMessage('AIがメッセージを改善しています...');
      const startTime = Date.now();
      
      const interval = setInterval(() => {
        setProcessingElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      try {
        const improvementPrompt = `以下のユーザーメッセージを、AIが理解しやすく、より具体的で明確な表現に改善してください。改善後のメッセージのみを返してください。余計な説明や前置きは不要です:\n\n${args}`;
        
        const improvedResponse = await callGemini(improvementPrompt, workspace.path, {
          approvalMode: approvalMode,
          model: 'gemini-2.5-flash', // Use fast model
          customApiKey: customApiKey,
        }, googleCloudProjectId, geminiPath);
        
        clearInterval(interval);
        setShowProcessingModal(false);
        
        console.log('Gemini response received:', improvedResponse);
        console.log('Response text:', improvedResponse.response);
        
        // Set the improved message directly to the input field
        const improvedText = improvedResponse.response.trim();
        console.log('Setting input value to:', improvedText);
        console.log('Input value length:', improvedText.length);
        
        setInputValue(improvedText);
        console.log('setInputValue called');
        
        // Focus the textarea and adjust its height
        setTimeout(() => {
          console.log('setTimeout callback executing');
          if (textareaRef.current) {
            console.log('textareaRef.current exists');
            const textarea = textareaRef.current;
            
            // 直接valueを設定し、changeイベントを発火(Reactの制御コンポーネントを更新)
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value'
            )?.set;
            
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(textarea, improvedText);
              const event = new Event('input', { bubbles: true });
              textarea.dispatchEvent(event);
              console.log('Dispatched input event');
            }
            console.log('Textarea value set to:', textarea.value);
            
            // Add a visual highlight effect
            textarea.classList.add('improved-message');
            console.log('Added improved-message class');
            setTimeout(() => {
              textarea.classList.remove('improved-message');
            }, 2000);
            
            // Focus and adjust height
            textarea.focus();
            console.log('Textarea focused');
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            const lineHeight = 20;
            const maxLines = 4;
            const maxHeight = lineHeight * maxLines;
            const newHeight = Math.min(scrollHeight, maxHeight);
            textarea.style.height = `${newHeight}px`;
            setTextareaHeight(`${newHeight}px`);
            console.log('Textarea height adjusted to:', newHeight);
            
            // Place cursor at the end
            textarea.setSelectionRange(improvedText.length, improvedText.length);
            console.log('Cursor placed at end');
          } else {
            console.error('textareaRef.current is null!');
          }
        }, 100);
        
      } catch (error) {
        clearInterval(interval);
        setShowProcessingModal(false);
        console.error('Error improving message:', error);
        
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ メッセージの改善中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        };
        onSendMessage(currentSessionId, errorMessage);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession) return;

    // Reset the recentlyCompletedSuggestion flag to ensure future messages can be sent
    setRecentlyCompletedSuggestion(false);

    // Check if it's a command
    const trimmedInput = inputValue.trim();
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.substring(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      
      await processCommand(command, args);
      setInputValue('');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
      tokenUsage: Math.ceil(inputValue.length / 4), // Estimate tokens for user message
    };

    onSendMessage(currentSessionId, userMessage);
    setInputValue('');
    setIsTyping(true);
  // start timer for this request
  requestStartRef.current = Date.now();
  setRequestElapsedTime(0);

  // Start elapsed time counter
  requestIntervalRef.current = setInterval(() => {
    if (requestStartRef.current) {
      setRequestElapsedTime(Math.floor((Date.now() - requestStartRef.current) / 1000));
    }
  }, 1000);

    try {
      // Parse includes from input with workspace items for directory verification
      const { includes, directories } = parseIncludes(inputValue, workspaceItems);
      
      // Build conversation history for context
      // Exclude system messages (summaries) and only include recent user/assistant messages
      const recentMessages = currentSession.messages
        .filter(msg => msg.role !== 'system')
        .slice(-10); // Keep last 10 messages for context (5 exchanges)
      
      const conversationHistoryJson = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const conversationHistory = recentMessages
        .map(msg => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          return `${role}: ${msg.content}`;
        })
        .join('\n\n');
      
      const options: GeminiOptions = {
        approvalMode: approvalMode,
        includes: includes.length > 0 ? includes : undefined,
        includeDirectories: directories.length > 0 ? directories : undefined,
        conversationHistory: conversationHistory && recentMessages.length > 0 ? conversationHistory : undefined,
        conversationHistoryJson: conversationHistoryJson.length > 0 ? conversationHistoryJson : undefined,
        workspaceId: workspace.id,
        sessionId: currentSessionId,
      };

      console.log('Sending message with conversation history:', conversationHistory ? 'Yes' : 'No');
      const geminiResponse = await callGemini(inputValue, workspace.path, options, googleCloudProjectId, geminiPath);
      
      // Calculate total tokens from stats
      let totalTokens = 0;
      if (geminiResponse.stats && geminiResponse.stats.models) {
        totalTokens = Object.values(geminiResponse.stats.models).reduce((sum, model) => {
          return sum + (model.tokens?.total || 0);
        }, 0);
      }
      
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
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
        const errObj = (error && typeof error === 'object') ? (error as any) : null;
        const errType = errObj?.type || errObj?.error?.type || undefined;
        const errMessage = errObj?.message || errObj?.error?.message || String(error);
        if (errType === 'FatalToolExecutionError') {
          const adviseMessage: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `⚠️ ツールの実行で権限エラーが発生しました: ${errMessage}\n\nこの操作にはツールの実行権限が必要です。設定から承認モードを「auto_edit」または「yolo」に変更して自動承認を許可しますか？\n- auto_edit: 編集ツールを自動承認\n- yolo: すべてのツールを自動承認\n\n現在の承認モード: ${approvalMode}\n設定を変更する場合はSettingsで更新してください。`,
            timestamp: new Date(),
          };
          onSendMessage(currentSessionId, adviseMessage);
        }
      } catch (parseErr) {
        console.error('Error parsing error object for FatalToolExecutionError:', parseErr);
      }
      console.error('Error calling Gemini:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      alert(t('chat.sessionLimit'));
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
    setEditingSessionName('');
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditingSessionName('');
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="back-button secondary" onClick={onBack}>
          ← {workspace.name}
        </button>
        <div className="chat-stats">
          <div className="stat">
            <span className="stat-label">{t('chat.tokenUsage')}:</span>
            <span className="stat-value">
              {formatNumber(currentSession?.tokenUsage || 0)} / {formatNumber(totalTokens)}
            </span>
          </div>
          {currentSession && (
            <div className="stat">
              <span className="stat-label">{t('chat.elapsedTime')}:</span>
              <span className="stat-value">
                {elapsedTime}
              </span>
            </div>
          )}
        </div>
        <button
          className="stats-button secondary"
          onClick={() => setShowStatsModal(true)}
        >
          {t('chat.stats.button')}
        </button>
        <button
          className="new-chat-button primary"
          onClick={handleNewChat}
          disabled={maxSessionsReached}
        >
          ✨ {t('chat.newChat')}
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-sidebar">
          <div className="sessions-header">
            <h3>{t('chat.sessions')}</h3>
            <span className="session-count">{sessions.length}/5</span>
          </div>
          <div className="sessions-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
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
                        if (e.key === 'Enter') {
                          handleSaveRename(session.id);
                        } else if (e.key === 'Escape') {
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
                    <span className="session-tokens">{formatNumber(session.tokenUsage)} tokens</span>
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
          <div className="messages-container">
            {(() => {
              return currentSession?.messages.length === 0 ? (
                <div className="empty-state">
                  <div className="gemini-logo">
                    <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="20" fill="url(#gradient)" />
                      <defs>
                        <linearGradient id="gradient" x1="4" y1="4" x2="44" y2="44">
                          <stop offset="0%" stopColor="#4285f4" />
                          <stop offset="100%" stopColor="#9334e6" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <p>{t('chat.noMessages')}</p>
                </div>
              ) : (
                currentSession?.messages.map((message) => (
                  <ChatMessageBubble 
                    key={message.id} 
                    message={message}
                    workspace={workspace}
                    onResendMessage={async (newMessage) => {
                      // Call resend to update the session history
                      onResendMessage(currentSessionId, message.id, newMessage);
                      
                      // If it's a user message, call Gemini API with the new content
                      if (newMessage.role === 'user') {
                        setIsTyping(true);
                        // Start timer for resend request
                        requestStartRef.current = Date.now();
                        setRequestElapsedTime(0);

                        // Start elapsed time counter
                        requestIntervalRef.current = setInterval(() => {
                          if (requestStartRef.current) {
                            setRequestElapsedTime(Math.floor((Date.now() - requestStartRef.current) / 1000));
                          }
                        }, 1000);
                        try {
                          const { includes, directories } = parseIncludes(newMessage.content, workspaceItems);
                          
                          // Build conversation history up to this point
                          const messageIndex = currentSession.messages.findIndex(m => m.id === message.id);
                          const previousMessages = currentSession.messages
                            .slice(0, messageIndex)
                            .filter(msg => msg.role !== 'system')
                            .slice(-10); // Keep last 10 messages for context
                          
                          const conversationHistoryJson = previousMessages.map(msg => ({
                            role: msg.role,
                            content: msg.content,
                          }));

                          const conversationHistory = previousMessages
                            .map(msg => {
                              const role = msg.role === 'user' ? 'User' : 'Assistant';
                              return `${role}: ${msg.content}`;
                            })
                            .join('\n\n');
                          
                          const options: GeminiOptions = {
                            approvalMode: approvalMode,
                            includes: includes.length > 0 ? includes : undefined,
                            includeDirectories: directories.length > 0 ? directories : undefined,
                            conversationHistory: conversationHistory && previousMessages.length > 0 ? conversationHistory : undefined,
                            conversationHistoryJson: conversationHistoryJson.length > 0 ? conversationHistoryJson : undefined,
                            workspaceId: workspace.id,
                            sessionId: currentSessionId,
                          };
                          
                          console.log('Resending message with conversation history:', conversationHistory ? 'Yes' : 'No');
                          const geminiResponse = await callGemini(newMessage.content, workspace.path, options, googleCloudProjectId, geminiPath);
                          
                          // Check if the response contains a FatalToolExecutionError
                          let responseContent = geminiResponse.response;
                          let hasFatalError = false;
                          let fatalErrorObj: any = null;
                          
                          try {
                            // Try to parse the response as JSON to check for FatalToolExecutionError
                            const parsedResponse = JSON.parse(responseContent);
                            if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.error) {
                              const errorObj = parsedResponse.error;
                              if (errorObj.type === 'FatalToolExecutionError') {
                                hasFatalError = true;
                                fatalErrorObj = errorObj;
                                console.log('FatalToolExecutionError found in response:', errorObj);
                              }
                            }
                          } catch (parseError) {
                            // Not JSON, treat as normal response
                            console.log('Response is not JSON, treating as normal response');
                          }
                          
                          if (hasFatalError) {
                            // Handle FatalToolExecutionError from response
                            const errType = fatalErrorObj.type;
                            const errCode = fatalErrorObj.code;
                            const errMessage = fatalErrorObj.message;
                            
                            console.log('Handling FatalToolExecutionError from response:', { errType, errCode, errMessage });
                            
                            const isInvalidParamsError = errCode === 'invalid_tool_params' ||
                              errMessage.includes('must be within one of the workspace directories');
                            const isToolNameError = errCode === 'tool_not_registered' || 
                                                   errMessage.includes('not found in registry') || 
                                                   errMessage.includes('Tool') && errMessage.includes('not found');
                            
                            if (isInvalidParamsError) {
                              const adviseMessage: ChatMessage = {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                content: `⚠️ **ファイルアクセスエラー**: ${errMessage}\n\n🔧 **解決方法**:\n• 操作できるファイル/フォルダは現在のワークスペース配下のみです（現在のワークスペース: \`${workspace.path}\`）。\n• 対象ファイルをワークスペースフォルダの中へ移動するか、\`#file:...\` や \`#folder:...\` プレフィックスを使って明示的に指定してください。\n• 一時ファイルを扱う場合は \`Documents/PEXData/GeminiGUI/Chatrequest/${workspace.id}\` 配下を利用してください。`,
                                timestamp: new Date(),
                              };
                              console.log('Sending invalid tool params guidance from response');
                              onSendMessage(currentSessionId, adviseMessage);
                            } else if (isToolNameError) {
                              // Tool name error - provide guidance about available tools
                              const adviseMessage: ChatMessage = {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                content: `⚠️ **ツール名エラー**: ${errMessage}\n\n🔧 **解決方法**: AIが間違ったツール名を使用しようとしました。\n\n**利用可能なツール**:\n• \`read_file\` - ファイルの内容を読み取る\n• \`web_fetch\` - ウェブページの内容を取得\n• \`glob\` - ファイル検索\n\n**考えられる原因**:\n• AIの設定やプロンプトに問題がある可能性があります\n• 必要に応じて設定画面からモデルやAPIキーを確認してください\n\n別の方法でリクエストを試すか、設定を見直してください。`,
                                timestamp: new Date(),
                              };
                              console.log('Sending tool name error guidance from response');
                              onSendMessage(currentSessionId, adviseMessage);
                            } else {
                              // Approval mode error - suggest changing approval mode
                              const adviseMessage: ChatMessage = {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                content: `⚠️ **ツール実行エラー**: ${errMessage}\n\n🔧 **解決方法**: 承認モードが「default」のため、ツールの実行が制限されています。\n\n**以下のいずれかのモードに変更してください：**\n• **auto_edit**: 編集ツールを自動承認\n• **yolo**: すべてのツールを自動承認\n\n設定画面から承認モードを変更してください。`,
                                timestamp: new Date(),
                              };
                              console.log('Sending approval mode error guidance from response');
                              onSendMessage(currentSessionId, adviseMessage);
                            }
                          } else {
                            // Normal response - calculate total tokens from stats
                            let totalTokens = 0;
                            if (geminiResponse.stats && geminiResponse.stats.models) {
                              totalTokens = Object.values(geminiResponse.stats.models).reduce((sum, model) => {
                                return sum + (model.tokens?.total || 0);
                              }, 0);
                            }
                            
                            const aiMessage: ChatMessage = {
                              id: (Date.now() + 1).toString(),
                              role: 'assistant',
                              content: responseContent,
                              timestamp: new Date(),
                              tokenUsage: totalTokens,
                              stats: geminiResponse.stats,
                            };
                            onSendMessage(currentSessionId, aiMessage);
                          }
                        } catch (error) {
                          console.error('Error calling Gemini:', error);
                          const errorMessage: ChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: `エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                {showCommandSuggestions && commandSuggestions.map((cmd) => (
                  <div
                    key={cmd}
                    className="suggestion-item"
                    data-type="command"
                    onClick={() => insertSuggestion(`/${cmd}`)}
                  >
                    /{cmd} - {t(`chat.commands.${cmd}`)}
                  </div>
                ))}
                {showFileSuggestions && fileSuggestions.map((file) => {
                  // Determine the type based on the prefix
                  let dataType = 'file';
                  if (file === '#codebase') {
                    dataType = 'codebase';
                  } else if (file.startsWith('#folder:')) {
                    dataType = 'folder';
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
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleSendMessage();
                } else if (e.key === 'Enter' && !e.shiftKey && !showCommandSuggestions && !showFileSuggestions && !recentlyCompletedSuggestion) {
                  // Allow Enter for new line, but only Ctrl+Enter sends
                  // This prevents accidental sends and multiple suggestions
                  e.preventDefault();
                }
                // Handle suggestion selection with Enter/Tab
                if ((e.key === 'Enter' || e.key === 'Tab') && (showCommandSuggestions || showFileSuggestions)) {
                  e.preventDefault();
                  const suggestions = showCommandSuggestions ? commandSuggestions : fileSuggestions;
                  if (suggestions.length > 0) {
                    const suggestion = showCommandSuggestions ? `/${suggestions[0]}` : suggestions[0];
                    insertSuggestion(suggestion);
                  }
                }
              }}
              placeholder={t('chat.placeholder')}
              rows={1}
              style={{ height: textareaHeight }}
            />
            <button
              className="send-button primary"
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
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
              メッセージ数が{maxMessagesBeforeCompact}件を超えました。
              <strong>/compact</strong>で会話を整理するか、新しいセッションを作成することをお勧めします。
            </span>
            <button className="warning-close" onClick={() => setShowCompactWarning(false)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProcessingModalProps {
  message: string;
  elapsedSeconds: number;
}

function ProcessingModal({ message, elapsedSeconds }: ProcessingModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content processing-modal">
        <div className="processing-content">
          <div className="processing-spinner">
            <div className="spinner"></div>
          </div>
          <h3>{message}</h3>
          <div className="processing-dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
          <div className="processing-elapsed">
            経過時間: {elapsedSeconds}秒
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatsModalProps {
  sessions: ChatSession[];
  totalTokens: number;
  onClose: () => void;
}

function StatsModal({ sessions, totalTokens, onClose }: StatsModalProps) {
  // Calculate aggregate statistics from all sessions
  const aggregateStats = sessions.reduce((acc, session) => {
    session.messages.forEach((message) => {
      if (message.stats) {
        // Aggregate model stats
        Object.entries(message.stats.models).forEach(([modelName, modelData]) => {
          if (!acc.models[modelName]) {
            acc.models[modelName] = {
              api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
              tokens: { prompt: 0, candidates: 0, total: 0, cached: 0, thoughts: 0, tool: 0 },
            };
          }
          acc.models[modelName].api.totalRequests += modelData.api.totalRequests;
          acc.models[modelName].api.totalErrors += modelData.api.totalErrors;
          acc.models[modelName].api.totalLatencyMs += modelData.api.totalLatencyMs;
          acc.models[modelName].tokens.prompt += modelData.tokens.prompt;
          acc.models[modelName].tokens.candidates += modelData.tokens.candidates;
          acc.models[modelName].tokens.total += modelData.tokens.total;
          acc.models[modelName].tokens.cached += modelData.tokens.cached;
          acc.models[modelName].tokens.thoughts += modelData.tokens.thoughts;
          acc.models[modelName].tokens.tool += modelData.tokens.tool;
        });

        // Aggregate tool stats
        acc.tools.totalCalls += message.stats.tools.totalCalls;
        acc.tools.totalSuccess += message.stats.tools.totalSuccess;
        acc.tools.totalFail += message.stats.tools.totalFail;
        acc.tools.totalDurationMs += message.stats.tools.totalDurationMs;

        Object.entries(message.stats.tools.byName).forEach(([toolName, toolData]) => {
          if (!acc.tools.byName[toolName]) {
            acc.tools.byName[toolName] = { count: 0, durationMs: 0 };
          }
          acc.tools.byName[toolName].count += toolData.count;
          acc.tools.byName[toolName].durationMs += toolData.durationMs;
        });

        // Aggregate file stats
        acc.files.totalLinesAdded += message.stats.files.totalLinesAdded;
        acc.files.totalLinesRemoved += message.stats.files.totalLinesRemoved;
      }
    });
    return acc;
  }, {
    models: {} as Record<string, any>,
    tools: { totalCalls: 0, totalSuccess: 0, totalFail: 0, totalDurationMs: 0, byName: {} as Record<string, any> },
    files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 {t('chat.stats.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {/* Overview Section */}
          <div className="stats-section overview-section">
            <h3>📈 {t('chat.stats.overview')}</h3>
            <div className="overview-grid">
              <div className="overview-card">
                <div className="overview-icon">💬</div>
                <div className="overview-content">
                  <div className="overview-label">{t('chat.stats.sessionCount')}</div>
                  <div className="overview-value">{sessions.length}</div>
                </div>
              </div>
              <div className="overview-card">
                <div className="overview-icon">🎯</div>
                <div className="overview-content">
                  <div className="overview-label">{t('chat.stats.totalTokensSummary')}</div>
                  <div className="overview-value">{formatNumber(totalTokens)}</div>
                </div>
              </div>
              <div className="overview-card">
                <div className="overview-icon">💬</div>
                <div className="overview-content">
                  <div className="overview-label">{t('chat.stats.totalMessages')}</div>
                  <div className="overview-value">
                    {sessions.reduce((sum, s) => sum + s.messages.length, 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Model Usage Section */}
          {Object.keys(aggregateStats.models).length > 0 && (
            <div className="stats-section">
              <h3>🤖 {t('chat.stats.modelUsage')}</h3>
              {Object.entries(aggregateStats.models).map(([modelName, modelData]: [string, any]) => (
                <div key={modelName} className="model-card">
                  <div className="model-header">
                    <span className="model-name">{modelName}</span>
                  </div>
                  
                  <div className="stats-grid">
                    <div className="stat-group">
                      <h4>{t('chat.stats.apiStats')}</h4>
                      <div className="stat-row">
                        <span className="stat-icon">📤</span>
                        <span className="stat-label">{t('chat.stats.requests')}</span>
                        <span className="stat-value">{modelData.api.totalRequests}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">❌</span>
                        <span className="stat-label">{t('chat.stats.errors')}</span>
                        <span className="stat-value">{modelData.api.totalErrors}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">⏱️</span>
                        <span className="stat-label">{t('chat.stats.latency')}</span>
                        <span className="stat-value">{modelData.api.totalLatencyMs}ms</span>
                      </div>
                    </div>

                    <div className="stat-group">
                      <h4>{t('chat.stats.tokenUsage')}</h4>
                      <div className="stat-row">
                        <span className="stat-icon">📝</span>
                        <span className="stat-label">{t('chat.stats.promptTokens')}</span>
                        <span className="stat-value highlight-primary">{formatNumber(modelData.tokens.prompt)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">💬</span>
                        <span className="stat-label">{t('chat.stats.responseTokens')}</span>
                        <span className="stat-value highlight-success">{formatNumber(modelData.tokens.candidates)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">🎯</span>
                        <span className="stat-label">{t('chat.stats.totalTokens')}</span>
                        <span className="stat-value highlight-total">{formatNumber(modelData.tokens.total)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">💾</span>
                        <span className="stat-label">{t('chat.stats.cachedTokens')}</span>
                        <span className="stat-value">{formatNumber(modelData.tokens.cached)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">💭</span>
                        <span className="stat-label">{t('chat.stats.thoughtsTokens')}</span>
                        <span className="stat-value">{formatNumber(modelData.tokens.thoughts)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-icon">🔧</span>
                        <span className="stat-label">{t('chat.stats.toolTokens')}</span>
                        <span className="stat-value">{formatNumber(modelData.tokens.tool)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tool Usage Section */}
          <div className="stats-section">
            <h3>🔧 {t('chat.stats.toolUsage')}</h3>
            <div className="tool-summary-card">
              <div className="stat-row">
                <span className="stat-icon">📞</span>
                <span className="stat-label">{t('chat.stats.totalCalls')}</span>
                <span className="stat-value">{aggregateStats.tools.totalCalls}</span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">✅</span>
                <span className="stat-label">{t('chat.stats.success')}</span>
                <span className="stat-value highlight-success">{aggregateStats.tools.totalSuccess}</span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">⚠️</span>
                <span className="stat-label">{t('chat.stats.fail')}</span>
                <span className="stat-value highlight-error">{aggregateStats.tools.totalFail}</span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">⏱️</span>
                <span className="stat-label">{t('chat.stats.totalDuration')}</span>
                <span className="stat-value">{aggregateStats.tools.totalDurationMs}ms</span>
              </div>
            </div>
            
            {Object.keys(aggregateStats.tools.byName).length > 0 && (
              <div className="tools-details">
                <h4>{t('chat.stats.toolDetails')}</h4>
                <div className="tools-grid">
                  {Object.entries(aggregateStats.tools.byName).map(([toolName, toolData]: [string, any]) => (
                    <div key={toolName} className="tool-detail-card">
                      <div className="tool-name">🔨 {toolName}</div>
                      <div className="tool-stats">
                        <div className="stat-row">
                          <span className="stat-label">{t('chat.stats.usageCount')}</span>
                          <span className="stat-value">{toolData.count}</span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-label">{t('chat.stats.executionTime')}</span>
                          <span className="stat-value">{toolData.durationMs}ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* File Changes Section */}
          <div className="stats-section">
            <h3>📁 {t('chat.stats.fileChanges')}</h3>
            <div className="file-changes-card">
              <div className="stat-row">
                <span className="stat-icon">➕</span>
                <span className="stat-label">{t('chat.stats.linesAdded')}</span>
                <span className="stat-value highlight-success">{aggregateStats.files.totalLinesAdded}</span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">➖</span>
                <span className="stat-label">{t('chat.stats.linesRemoved')}</span>
                <span className="stat-value highlight-error">{aggregateStats.files.totalLinesRemoved}</span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">📊</span>
                <span className="stat-label">{t('chat.stats.diff')}</span>
                <span className="stat-value">
                  {aggregateStats.files.totalLinesAdded - aggregateStats.files.totalLinesRemoved > 0 ? '+' : ''}
                  {aggregateStats.files.totalLinesAdded - aggregateStats.files.totalLinesRemoved}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  workspace: Workspace;
  onResendMessage?: (newMessage: ChatMessage) => void;
}

/**
 * Render user message with highlighted tags
 */
function renderUserMessage(content: string, workspacePath: string): React.ReactElement {
  // Split content by tags (#file:, #folder:, #codebase, /commands)
  const tagRegex = /(#file:[^\s]+|#folder:[^\s]+|#codebase|\/\w+)/g;
  const parts: React.ReactElement[] = [];
  let lastIndex = 0;
  let match;

  const handleTagClick = async (tag: string) => {
    try {
      let targetPath = '';

      if (tag.startsWith('#file:')) {
        // Open the file directly
        const filePath = tag.substring(6); // Remove '#file:'
        // Convert relative path to absolute path if needed
        targetPath = filePath.startsWith('/') || filePath.includes(':') 
          ? filePath 
          : `${workspacePath}/${filePath}`.replace(/\\/g, '/');
      } else if (tag.startsWith('#folder:')) {
        // Open the folder
        const folderPath = tag.substring(8); // Remove '#folder:'
        targetPath = folderPath.startsWith('/') || folderPath.includes(':') 
          ? folderPath 
          : `${workspacePath}/${folderPath}`.replace(/\\/g, '/');
      } else if (tag === '#codebase') {
        // Open the workspace root directory
        targetPath = workspacePath;
      }

      if (targetPath) {
        // Use PowerShell to open the file or directory
        const command = Command.create('powershell.exe', ['-Command', `start "${targetPath}"`]);
        await command.execute();
      }
    } catch (error) {
      console.error('Failed to open target:', error);
    }
  };

  while ((match = tagRegex.exec(content)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {content.substring(lastIndex, match.index)}
        </span>
      );
    }

    // Add the tag with appropriate styling
    const tag = match[0];
    let tagType = 'tag-default';
    let icon = '🏷️';
    let isClickable = false;

    if (tag.startsWith('#file:')) {
      tagType = 'tag-file';
      icon = '📄';
      isClickable = true;
    } else if (tag.startsWith('#folder:')) {
      tagType = 'tag-folder';
      icon = '📁';
      isClickable = true;
    } else if (tag === '#codebase') {
      tagType = 'tag-codebase';
      icon = '📦';
      isClickable = true;
    } else if (tag.startsWith('/')) {
      tagType = 'tag-command';
      icon = '⚡';
    }

    parts.push(
      <span
        key={`tag-${match.index}`}
        className={`message-tag ${tagType} ${isClickable ? 'clickable' : ''}`}
        onClick={isClickable ? () => handleTagClick(tag) : undefined}
        style={isClickable ? { cursor: 'pointer' } : undefined}
        title={isClickable ? 'クリックしてディレクトリを開く' : undefined}
      >
        <span className="tag-icon">{icon}</span>
        {tag}
      </span>
    );

    lastIndex = match.index + tag.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>
        {content.substring(lastIndex)}
      </span>
    );
  }

  return <p>{parts}</p>;
}

function ChatMessageBubble({ 
  message,
  workspace,
  onResendMessage
}: ChatMessageBubbleProps) {
  const [showStats, setShowStats] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [editTextareaHeight, setEditTextareaHeight] = useState('auto');

  const handleDoubleClick = () => {
    if (message.role === 'user' && onResendMessage) {
      setIsEditing(true);
      setEditContent(message.content);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);

    // Auto-resize edit textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const lineHeight = 20; // Approximate line height
    const maxLines = 6; // Allow more lines for editing
    const maxHeight = lineHeight * maxLines;
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    setEditTextareaHeight(`${newHeight}px`);
  };

  const handleSaveEdit = () => {
    console.log('handleSaveEdit called', { onResendMessage: !!onResendMessage, editContent: editContent.trim(), originalContent: message.content, isDifferent: editContent.trim() !== message.content });
    if (onResendMessage) {
      const newMessage: ChatMessage = {
        ...message,
        content: editContent.trim(),
        timestamp: new Date(),
        tokenUsage: Math.ceil(editContent.trim().length / 4), // Estimate tokens for edited message
      };
      onResendMessage(newMessage);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-bubble">
        {isEditing ? (
          <div className="edit-mode">
            <textarea
              value={editContent}
              onChange={handleEditChange}
              className="edit-textarea"
              rows={1}
              style={{ height: editTextareaHeight }}
              autoFocus
            />
            <div className="edit-buttons">
              <button className="edit-save primary" onClick={handleSaveEdit}>
                再送信
              </button>
              <button className="edit-cancel secondary" onClick={handleCancelEdit}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div onDoubleClick={handleDoubleClick}>
            {message.role === 'assistant' || message.role === 'system' ? (
              <ReactMarkdown components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            ) : (
              renderUserMessage(message.content, workspace.path)
            )}
          </div>
        )}
        {message.stats && !isEditing && (
          <div className="message-stats-toggle">
            <button 
              className="stats-toggle-button"
              onClick={() => setShowStats(!showStats)}
            >
              📊 詳細統計 {showStats ? '▲' : '▼'}
            </button>
            {showStats && (
              <div className="message-stats">
                <div className="stats-section">
                  <h4>使用モデル</h4>
                  {Object.entries(message.stats.models).map(([modelName, modelData]) => (
                    <div key={modelName} className="model-info">
                      <div className="model-name">{modelName}</div>
                      <div className="model-details">
                        <div>リクエスト数: {modelData.api.totalRequests}</div>
                        <div>エラー数: {modelData.api.totalErrors}</div>
                        <div>レイテンシ: {modelData.api.totalLatencyMs}ms</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="stats-section">
                  <h4>トークン使用量</h4>
                  {Object.entries(message.stats.models).map(([modelName, modelData]) => (
                    <div key={modelName} className="token-info">
                      <div>プロンプト: {modelData.tokens.prompt}</div>
                      <div>応答: {modelData.tokens.candidates}</div>
                      <div>合計: {modelData.tokens.total}</div>
                      <div>キャッシュ: {modelData.tokens.cached}</div>
                      <div>思考: {modelData.tokens.thoughts}</div>
                      <div>ツール: {modelData.tokens.tool}</div>
                    </div>
                  ))}
                </div>

                <div className="stats-section">
                  <h4>ツール使用状況</h4>
                  <div className="tools-summary">
                    <div>総呼び出し数: {message.stats.tools.totalCalls}</div>
                    <div>成功: {message.stats.tools.totalSuccess}</div>
                    <div>失敗: {message.stats.tools.totalFail}</div>
                    <div>総実行時間: {message.stats.tools.totalDurationMs}ms</div>
                  </div>
                  {Object.keys(message.stats.tools.byName).length > 0 && (
                    <div className="tools-details">
                      <h5>使用ツール詳細</h5>
                      {Object.entries(message.stats.tools.byName).map(([toolName, toolData]) => (
                        <div key={toolName} className="tool-detail">
                          <div className="tool-name">{toolName}</div>
                          <div className="tool-stats">
                            <div>使用回数: {toolData.count}</div>
                            <div>実行時間: {toolData.durationMs}ms</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="stats-section">
                  <h4>{t('chat.stats.messageStats.fileChanges')}</h4>
                  <div className="file-changes">
                    <div>{t('chat.stats.messageStats.linesAdded')} {message.stats.files.totalLinesAdded}</div>
                    <div>{t('chat.stats.messageStats.linesRemoved')} {message.stats.files.totalLinesRemoved}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <span className="message-time">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
