import React, { useState } from "react";
import { ChatMessage } from "../../types";
import { t } from "../../utils/i18n";
import { openFile } from "../../utils/powershellExecutor";
import * as fsPlugin from "@tauri-apps/plugin-fs";
import { openExternal } from "./utils";
import { ChatMessageBubbleProps } from "./types";

const ReactMarkdown = React.lazy(
  () => import("react-markdown")
) as unknown as any;
const SyntaxHighlighter = React.lazy(() =>
  import("react-syntax-highlighter").then((mod) => ({ default: mod.Prism }))
) as unknown as any;
// oneDark is relatively small; keep it static import for style reference
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Markdown components for syntax highlighting - Exported for reuse in streaming
export const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\\w+)/.exec(className || "");
    if (!inline && match) {
      if (match[1] === "markdown") {
        // For markdown code blocks, render the content as markdown
        return (
          <div className="markdown-preview">
            <React.Suspense fallback={<div>Loading preview…</div>}>
              <ReactMarkdown>{String(children)}</ReactMarkdown>
            </React.Suspense>
          </div>
        );
      } else {
        return (
          <React.Suspense
            fallback={<pre className="code-loading">Loading code…</pre>}
          >
            <SyntaxHighlighter
              style={oneDark}
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\\n$/, "")}
            </SyntaxHighlighter>
          </React.Suspense>
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
  p({ node, children, ...props }: any) {
    // children may contain strings or elements. We need to linkify plain text nodes.
    const processed: React.ReactNode[] = [];
    const urlRegex = /(https?:\/\/[^\s<>\"'`]+)/g;

    const linkifyString = (text: string) => {
      const parts = text.split(urlRegex);
      return parts.map((part, i) => {
        if (!part) return null;
        if (urlRegex.test(part)) {
          const url = part;
          return (
            <a
              key={`link-${i}-${url}`}
              href={url}
              className="message-link"
              onClick={(e) => {
                e.preventDefault();
                openExternal(url);
              }}
              rel="noopener noreferrer"
            >
              <span className="link-icon">🔗</span>
              <span className="link-text">{url}</span>
            </a>
          );
        }
        return <span key={`text-${i}-${part}`}>{part}</span>;
      });
    };

    React.Children.forEach(children, (child) => {
      if (typeof child === "string") {
        processed.push(...linkifyString(child));
      } else {
        processed.push(child as any);
      }
    });

    return <p {...props}>{processed}</p>;
  },
};

/**
 * Render message with clickable tags (#file:, #folder:, #codebase, /commands)
 */
function renderMessageWithTags(
  content: string,
  workspacePath: string
): React.ReactElement {
  // Split content by tags (#file:, #folder:, #codebase, /commands)
  // Important: only match commands that start at the beginning of the string or are preceded by whitespace
  // This prevents matching slashes that are part of URLs (e.g. https://example.com/menu)
  const tagRegex =
    /(#file:[^\s]+|#folder:[^\s]+|#codebase|(?:^|\s)(\/[A-Za-z0-9_-]+))/g;
  const parts: React.ReactElement[] = [];
  let lastIndex = 0;
  let match;

  const handleTagClick = async (tag: string) => {
    try {
      let targetPath = "";

      if (tag.startsWith("#file:")) {
        // Open the file directly
        const filePath = tag.substring(6); // Remove '#file:'
        // Convert relative path to absolute path if needed
        targetPath =
          filePath.startsWith("/") || filePath.includes(":")
            ? filePath
            : `${workspacePath}/${filePath}`.replace(/\\/g, "/");
      } else if (tag.startsWith("#folder:")) {
        // Open the folder
        const folderPath = tag.substring(8); // Remove '#folder:'
        targetPath =
          folderPath.startsWith("/") || folderPath.includes(":")
            ? folderPath
            : `${workspacePath}/${folderPath}`.replace(/\\/g, "/");
      } else if (tag === "#codebase") {
        // Open the workspace root directory
        targetPath = workspacePath;
      }

      if (targetPath) {
        // Check if file exists before trying to open
        const fileExists = await fsPlugin.exists(targetPath);
        if (!fileExists) {
          alert(t("fileAccess.fileNotFound").replace("{path}", targetPath));
          return;
        }

        // Use PowerShell to open the file or directory
        await openFile(targetPath);
      }
    } catch (error) {
      console.error("Failed to open target:", error);
      alert(
        t("fileAccess.fileOpenFailed").replace(
          "{error}",
          error instanceof Error ? error.message : "Unknown error"
        )
      );
    }
  };

  // helper: linkify plain text into nodes with clickable anchors
  const urlRegex = /(https?:\/\/[^\s<>\"'`]+)/g;
  const linkifyText = (text: string) => {
    const nodes: React.ReactElement[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = urlRegex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        nodes.push(
          <span key={`t-${lastIndex}`}>
            {text.substring(lastIndex, m.index)}
          </span>
        );
      }
      const url = m[0];
      nodes.push(
        <a
          key={`u-${m.index}`}
          href={url}
          className="message-link"
          onClick={(e) => {
            e.preventDefault();
            openExternal(url);
          }}
          rel="noopener noreferrer"
        >
          <span className="link-icon">🔗</span>
          <span className="link-text">{url}</span>
        </a>
      );
      lastIndex = m.index + url.length;
    }
    if (lastIndex < text.length) {
      nodes.push(
        <span key={`t-last-${lastIndex}`}>{text.substring(lastIndex)}</span>
      );
    }
    return nodes;
  };

  while ((match = tagRegex.exec(content)) !== null) {
    // Determine which group produced the tag. If group 2 matched, the overall match may include a leading
    // whitespace (because we used (?:^|\s) to avoid matching slashes inside URLs). Compute the actual
    // tag text and its true start index so we can correctly slice the surrounding text.
    const fullMatch = match[0];
    const group1 = match[1];
    const group2 = match[2];
    const tag = group2 ?? group1 ?? fullMatch;

    // Compute tag start index (adjust if fullMatch contains a leading whitespace)
    const tagStartIndex =
      match.index + (fullMatch.indexOf(tag) >= 0 ? fullMatch.indexOf(tag) : 0);

    // Add text before the tag
    if (tagStartIndex > lastIndex) {
      const textBefore = content.substring(lastIndex, tagStartIndex);
      // linkify text before tag
      parts.push(...linkifyText(textBefore));
    }

    // Add the tag with appropriate styling
    let tagType = "tag-default";
    let icon = "🏷️";
    let isClickable = false;

    if (tag.startsWith("#file:")) {
      tagType = "tag-file";
      icon = "📄";
      isClickable = true;
    } else if (tag.startsWith("#folder:")) {
      tagType = "tag-folder";
      icon = "📁";
      isClickable = true;
    } else if (tag === "#codebase") {
      tagType = "tag-codebase";
      icon = "📦";
      isClickable = true;
    } else if (tag.startsWith("/")) {
      tagType = "tag-command";
      icon = "⚡";
    }

    parts.push(
      <span
        key={`tag-${tagStartIndex}`}
        className={`message-tag ${tagType} ${isClickable ? "clickable" : ""}`}
        onClick={isClickable ? () => handleTagClick(tag) : undefined}
        style={isClickable ? { cursor: "pointer" } : undefined}
        title={isClickable ? "クリックしてディレクトリを開く" : undefined}
      >
        <span className="tag-icon">{icon}</span>
        {tag}
      </span>
    );

    lastIndex = tagStartIndex + tag.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex);
    parts.push(...linkifyText(remaining));
  }

  return <p>{parts}</p>;
}

function ChatMessageBubble({
  message,
  workspace,
  onResendMessage,
}: ChatMessageBubbleProps) {
  const [showStats, setShowStats] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [editTextareaHeight, setEditTextareaHeight] = useState("auto");

  const handleDoubleClick = () => {
    if (message.role === "user" && onResendMessage) {
      setIsEditing(true);
      setEditContent(message.content);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);

    // Auto-resize edit textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const lineHeight = 20; // Approximate line height
    const maxLines = 6; // Allow more lines for editing
    const maxHeight = lineHeight * maxLines;
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    setEditTextareaHeight(`${newHeight}px`);
  };

  const handleSaveEdit = () => {
    console.log("handleSaveEdit called", {
      onResendMessage: !!onResendMessage,
      editContent: editContent.trim(),
      originalContent: message.content,
      isDifferent: editContent.trim() !== message.content,
    });
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
        {message.role === "user" ? "👤" : "🤖"}
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
              <button
                className="edit-cancel secondary"
                onClick={handleCancelEdit}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div onDoubleClick={handleDoubleClick}>
            {message.role === "assistant" ? (
              <ReactMarkdown components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            ) : message.role === "system" ? (
              renderMessageWithTags(message.content, workspace.path)
            ) : (
              renderMessageWithTags(message.content, workspace.path)
            )}
          </div>
        )}
        {message.stats && !isEditing && (
          <div className="message-stats-toggle">
            <button
              className="stats-toggle-button"
              onClick={() => setShowStats(!showStats)}
            >
              📊 詳細統計 {showStats ? "▲" : "▼"}
            </button>
            {showStats && (
              <div className="message-stats">
                <div className="stats-section">
                  <h4>{t("fileAccess.modelStats")}</h4>
                  {Object.entries(message.stats.models).map(
                    ([modelName, modelData]) => (
                      <div key={modelName} className="model-info">
                        <div className="model-name">{modelName}</div>
                        <div className="model-details">
                          <div>
                            {t("fileAccess.requestCount")}{" "}
                            {modelData.api.totalRequests}
                          </div>
                          <div>
                            {t("fileAccess.errorCount")}{" "}
                            {modelData.api.totalErrors}
                          </div>
                          <div>
                            {t("fileAccess.latency")}{" "}
                            {modelData.api.totalLatencyMs}ms
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="stats-section">
                  <h4>{t("fileAccess.tokenStats")}</h4>
                  {Object.entries(message.stats.models).map(
                    ([modelName, modelData]) => (
                      <div key={modelName} className="token-info">
                        <div>
                          {t("fileAccess.promptTokens")}{" "}
                          {modelData.tokens.prompt}
                        </div>
                        <div>
                          {t("fileAccess.responseTokens")}{" "}
                          {modelData.tokens.candidates}
                        </div>
                        <div>
                          {t("fileAccess.totalTokens")} {modelData.tokens.total}
                        </div>
                        <div>
                          {t("fileAccess.cachedTokens")}{" "}
                          {modelData.tokens.cached}
                        </div>
                        <div>
                          {t("fileAccess.thoughtTokens")}{" "}
                          {modelData.tokens.thoughts}
                        </div>
                        <div>
                          {t("fileAccess.toolTokens")} {modelData.tokens.tool}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="stats-section">
                  <h4>{t("fileAccess.toolStats")}</h4>
                  <div className="tools-summary">
                    <div>
                      {t("fileAccess.totalCalls")}{" "}
                      {message.stats.tools.totalCalls}
                    </div>
                    <div>
                      {t("fileAccess.successful")}{" "}
                      {message.stats.tools.totalSuccess}
                    </div>
                    <div>
                      {t("fileAccess.failed")} {message.stats.tools.totalFail}
                    </div>
                    <div>
                      {t("fileAccess.totalExecutionTime")}{" "}
                      {message.stats.tools.totalDurationMs}ms
                    </div>
                  </div>
                  {Object.keys(message.stats.tools.byName).length > 0 && (
                    <div className="tools-details">
                      <h5>{t("fileAccess.toolsDetailed")}</h5>
                      {Object.entries(message.stats.tools.byName).map(
                        ([toolName, toolData]) => (
                          <div key={toolName} className="tool-detail">
                            <div className="tool-name">{toolName}</div>
                            <div className="tool-stats">
                              <div>
                                {t("fileAccess.usageCount")} {toolData.count}
                              </div>
                              <div>
                                {t("fileAccess.executionTime")}{" "}
                                {toolData.durationMs}ms
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="stats-section">
                  <h4>{t("chat.stats.messageStats.fileChanges")}</h4>
                  <div className="file-changes">
                    <div>
                      {t("chat.stats.messageStats.linesAdded")}{" "}
                      {message.stats.files.totalLinesAdded}
                    </div>
                    <div>
                      {t("chat.stats.messageStats.linesRemoved")}{" "}
                      {message.stats.files.totalLinesRemoved}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* OpenAI Tool Usage Statistics */}
            {message.toolUsage && message.toolUsage.length > 0 && (
              <div className="tool-usage-section">
                <h4 className="tool-usage-title">
                  🔧 Tool Usage History ({message.toolUsage.length} calls)
                </h4>
                <div className="tool-usage-list">
                  {message.toolUsage.map((tool, index) => (
                    <div 
                      key={`${tool.toolName}-${index}`} 
                      className={`tool-usage-item ${tool.success ? 'success' : 'failed'}`}
                    >
                      <div className="tool-usage-header">
                        <span className="tool-usage-icon">
                          {tool.success ? '✓' : '✗'}
                        </span>
                        <span className="tool-usage-name">{tool.toolName}</span>
                        <span className="tool-usage-time">{tool.executionTime}ms</span>
                      </div>
                      
                      {/* Parameters Section */}
                      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                        <div className="tool-usage-parameters">
                          <div className="parameters-label">📝 Parameters:</div>
                          <div className="parameters-content">
                            {Object.entries(tool.parameters).map(([key, value]) => (
                              <div key={key} className="parameter-item">
                                <span className="parameter-key">{key}:</span>
                                <span className="parameter-value">
                                  {typeof value === 'string' 
                                    ? value.length > 50 
                                      ? `${value.substring(0, 50)}...` 
                                      : value
                                    : JSON.stringify(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Result Section */}
                      {tool.result && (
                        <div className="tool-usage-result">
                          <div className="result-label">📊 Result:</div>
                          <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="tool-usage-summary">
                  <div className="tool-usage-stat">
                    <span className="stat-label">Total Execution:</span>
                    <span className="stat-value">
                      {message.toolUsage.reduce((sum, t) => sum + t.executionTime, 0)}ms
                    </span>
                  </div>
                  <div className="tool-usage-stat">
                    <span className="stat-label">Success Rate:</span>
                    <span className="stat-value">
                      {Math.round((message.toolUsage.filter(t => t.success).length / message.toolUsage.length) * 100)}%
                    </span>
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

export default ChatMessageBubble;