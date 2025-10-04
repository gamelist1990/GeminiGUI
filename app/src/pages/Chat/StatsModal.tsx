import { useState } from "react";
import { ChatMessage, ChatSession } from "../../types";
import { t } from "../../utils/i18n";
import { formatNumber } from "../../utils/storage";
import { formatElapsedTime } from "../../utils/storage";
import { writeBinaryFile } from "../../utils/powershellExecutor";
import * as fsPlugin from "@tauri-apps/plugin-fs";
import * as dialogPlugin from "@tauri-apps/plugin-dialog";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { StatsModalProps } from "./types";

function StatsModal({ sessions, totalTokens, onClose }: StatsModalProps) {
  // Calculate aggregate statistics from all sessions
  const aggregateStats = sessions.reduce(
    (acc, session) => {
      session.messages.forEach((message) => {
        if (message.stats) {
          // Aggregate model stats
          Object.entries(message.stats.models).forEach(
            ([modelName, modelData]) => {
              if (!acc.models[modelName]) {
                acc.models[modelName] = {
                  api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
                  tokens: {
                    prompt: 0,
                    candidates: 0,
                    total: 0,
                    cached: 0,
                    thoughts: 0,
                    tool: 0,
                  },
                };
              }
              acc.models[modelName].api.totalRequests +=
                modelData.api.totalRequests;
              acc.models[modelName].api.totalErrors +=
                modelData.api.totalErrors;
              acc.models[modelName].api.totalLatencyMs +=
                modelData.api.totalLatencyMs;
              acc.models[modelName].tokens.prompt += modelData.tokens.prompt;
              acc.models[modelName].tokens.candidates +=
                modelData.tokens.candidates;
              acc.models[modelName].tokens.total += modelData.tokens.total;
              acc.models[modelName].tokens.cached += modelData.tokens.cached;
              acc.models[modelName].tokens.thoughts +=
                modelData.tokens.thoughts;
              acc.models[modelName].tokens.tool += modelData.tokens.tool;
            }
          );

          // Aggregate tool stats
          acc.tools.totalCalls += message.stats.tools.totalCalls;
          acc.tools.totalSuccess += message.stats.tools.totalSuccess;
          acc.tools.totalFail += message.stats.tools.totalFail;
          acc.tools.totalDurationMs += message.stats.tools.totalDurationMs;

          Object.entries(message.stats.tools.byName).forEach(
            ([toolName, toolData]) => {
              if (!acc.tools.byName[toolName]) {
                acc.tools.byName[toolName] = { count: 0, durationMs: 0 };
              }
              acc.tools.byName[toolName].count += toolData.count;
              acc.tools.byName[toolName].durationMs += toolData.durationMs;
            }
          );

          // Aggregate file stats
          acc.files.totalLinesAdded += message.stats.files.totalLinesAdded;
          acc.files.totalLinesRemoved += message.stats.files.totalLinesRemoved;
        }
      });
      return acc;
    },
    {
      models: {} as Record<string, any>,
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        byName: {} as Record<string, any>,
      },
      files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
    }
  );

  // Export functionality
  const [selectedSessionId, setSelectedSessionId] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string>("");

  const selectedSession =
    selectedSessionId === "all"
      ? null
      : sessions.find((s) => s.id === selectedSessionId) || null;

  const exportAsText = async () => {
    if (!selectedSession) {
      alert(t("chat.stats.export.selectSessionFirst"));
      return;
    }

    try {
      setIsExporting(true);

      const textContent = generateConversationText(selectedSession);
      const defaultName = `${selectedSession.name.replace(
        /[^a-zA-Z0-9\-_]/g,
        "_"
      )}_conversation.txt`;

      const savePath = await dialogPlugin.save({
        title: t("chat.stats.export.title"),
        filters: [
          {
            name: "Text Files",
            extensions: ["txt"],
          },
        ],
        defaultPath: defaultName,
      });

      if (savePath) {
        await fsPlugin.writeTextFile(savePath, textContent);
        setExportSuccessMessage(t("chat.stats.export.successTxt"));
        // Clear success message after 3 seconds
        setTimeout(() => setExportSuccessMessage(""), 3000);
      }
    } catch (error) {
      console.error("Text export failed:", error);
      alert(t("chat.stats.export.error"));
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsPdf = async () => {
    if (!selectedSession) {
      alert(t("chat.stats.export.selectSessionFirst"));
      return;
    }

    try {
      setIsExporting(true);

      // Safety check: limit number of messages for PDF export
      const MAX_MESSAGES_FOR_PDF = 100; // Reasonable limit to prevent string length errors
      const visibleMessages = selectedSession.messages.filter(message => !message.hidden);

      if (visibleMessages.length > MAX_MESSAGES_FOR_PDF) {
        alert(`PDF export is limited to ${MAX_MESSAGES_FOR_PDF} messages for performance reasons.\n\nYour session has ${visibleMessages.length} messages. Please consider:\n• Export as text file instead (no limits)\n• Compact long conversations first\n• Export smaller sessions individually\n\nWould you like to continue with the first ${MAX_MESSAGES_FOR_PDF} messages?`);
      }

      // Generate HTML content with size limits
      let htmlContent: string = "";
      let messagesToExport = visibleMessages;

      try {
        // Limit messages if too many
        if (visibleMessages.length > MAX_MESSAGES_FOR_PDF) {
          messagesToExport = visibleMessages.slice(0, MAX_MESSAGES_FOR_PDF);
        }

        // Generate HTML for limited messages
        htmlContent = generateConversationHtml(selectedSession, messagesToExport);

        // Additional safety check: estimate final HTML size
        if (htmlContent.length > 5000000) { // ~5MB limit (reasonable for HTML2Canvas)
          throw new Error('HTML_TOO_LARGE');
        }
      } catch (htmlError) {
        if (htmlError === 'HTML_TOO_LARGE' || (htmlError as Error).message?.includes('Invalid string length')) {
          alert(`PDF export cancelled: Content is too large for PDF generation.\n\nPlease try:\n• Export as text file instead (no size limits)\n• Reduce message content\n• Split large conversations\n\nEstimated content size: ${htmlContent.length / 1024 / 1024}MB`);
          setIsExporting(false);
          return;
        }
        throw htmlError;
      }

      // Create a temporary div with conversation content
      const tempDiv = document.createElement("div");
      tempDiv.style.width = "1200px"; // Increased width for better quality
      tempDiv.style.maxWidth = "1200px";
      tempDiv.style.padding = "40px"; // Increased padding
      tempDiv.style.fontFamily = "Arial, sans-serif";
      tempDiv.style.backgroundColor = "white";
      tempDiv.style.color = "black";
      tempDiv.style.fontSize = "14px"; // Reduced font size for more content
      tempDiv.style.lineHeight = "1.4"; // Tighter line height
      tempDiv.style.overflow = "hidden"; // Prevent scrollbars during capture

      // Set the limited content
      if (messagesToExport.length < visibleMessages.length) {
        // Add warning about truncated content
        tempDiv.innerHTML = htmlContent.replace(
          '<h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">',
          '<div style="background: #fef3c7; padding: 15px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #f59e0b;">⚠️ <strong>Warning:</strong> This PDF contains only the first ' + MAX_MESSAGES_FOR_PDF + ' messages due to size limits. Export as text for complete conversation.</div><h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">'
        );
      } else {
        tempDiv.innerHTML = htmlContent;
      }

      // Position temporarily off-screen
      tempDiv.style.position = "absolute";
      tempDiv.style.left = "-9999px";
      tempDiv.style.top = "-9999px";

      document.body.appendChild(tempDiv);

      try {
        const canvas = await html2canvas(tempDiv, {
          scale: 2, // Reduced scale for better performance
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          width: 1200,
          height: Math.min(tempDiv.offsetHeight, 10000), // Limit max height
          windowWidth: 1200,
          windowHeight: Math.min(tempDiv.offsetHeight, 10000),
          logging: false, // Disable html2canvas logging
          foreignObjectRendering: false, // Simpler rendering
        });

        // Force garbage collection for large images (if available)
        if (window.gc) {
          window.gc();
        }

        const imgData = canvas.toDataURL("image/png", 0.9); // Slightly compressed quality
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "px",
          format: "a4",
          compress: true, // Enable compression for better performance
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // Calculate scaling to fit page while maintaining aspect ratio
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;

        // Center the image on the page
        const xOffset = (pdfWidth - finalWidth) / 2;
        const yOffset = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, "PNG", xOffset, yOffset, finalWidth, finalHeight);

        // Allow user to choose save location (like text export)
        const defaultName = `${selectedSession.name.replace(
          /[^a-zA-Z0-9\-_]/g,
          "_"
        )}_conversation.pdf`;

        const savePath = await dialogPlugin.save({
          title: "Save Conversation PDF",
          filters: [
            {
              name: "PDF Files",
              extensions: ["pdf"],
            },
          ],
          defaultPath: defaultName,
        });

        if (savePath) {
          // Try fsPlugin first, fall back to PowerShell if it fails
          const pdfBlob = pdf.output('blob');
          const arrayBuffer = await pdfBlob.arrayBuffer();

          try {
            // Try fsPlugin first (should work in most cases)
            await fsPlugin.writeFile(savePath, new Uint8Array(arrayBuffer));
          } catch (fsError) {
            console.warn('fsPlugin failed, trying PowerShell fallback:', fsError);
            try {
              // Fall back to PowerShell method
              await writeBinaryFile(savePath, arrayBuffer);
            } catch (psError) {
              console.error('PowerShell fallback also failed:', psError);
              throw new Error(`ファイル保存に失敗しました: ${psError instanceof Error ? psError.message : 'Unknown error'}`);
            }
          }

          setExportSuccessMessage(t("chat.stats.export.successPdf"));
          // Clear success message after 3 seconds
          setTimeout(() => setExportSuccessMessage(""), 3000);
        }
      } finally {
        document.body.removeChild(tempDiv);
      }
    } catch (error) {
      console.error("PDF export failed:", error);

      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('Invalid string length') || error.message === 'HTML_TOO_LARGE') {
          alert(`PDF export failed: Content too large.\n\n${t("chat.stats.export.error")}\n\nTry:\n• Export as text file (.txt) instead\n• Reduce message content\n• Split large conversations`);
        } else if (error.message.includes('HTML2Canvas')) {
          alert(`PDF export failed: Rendering issue.\n\n${t("chat.stats.export.error")}\n\nTry refreshing the page and exporting again.`);
        } else {
          alert(`${t("chat.stats.export.error")}\n\nDetails: ${error.message}`);
        }
      } else {
        alert(t("chat.stats.export.error"));
      }
    } finally {
      setIsExporting(false);
    }
  };

  const generateConversationText = (session: ChatSession): string => {
    let content = `${t("chat.stats.export.title")} - ${session.name}\n`;
    content += `=${"=".repeat(50)}=\n\n`;
    content += `${t("chat.elapsedTime")}: ${formatElapsedTime(
      session.createdAt
    )}\n`;
    content += `${t("chat.tokenUsage")}: ${formatNumber(
      session.tokenUsage
    )}\n\n`;

    session.messages.forEach((message, index) => {
      if (message.hidden) return; // Skip hidden messages (system summaries)

      const roleLabel = message.role === "user" ? "User" : "Assistant";
      const timestamp = message.timestamp
        ? message.timestamp.toLocaleString()
        : "";

      content += `${index + 1}. ${roleLabel} (${timestamp})\n`;
      content += `${"–".repeat(30)}\n`;
      content += `${message.content}\n\n`;

      if (message.tokenUsage) {
        content += `   [${t("chat.stats.tokenUsage").replace(
          "トークン使用量",
          t("chat.tokenUsage")
        )}: ${message.tokenUsage}]\n\n`;
      }
    });

    content += `=${"=".repeat(50)}=\n`;
    content += `${t("chat.stats.export.title")} - ${
      session.name
    } (${new Date().toLocaleDateString()})\n`;

    return content;
  };

  const generateConversationHtml = (session: ChatSession, messagesToUse?: ChatMessage[]): string => {
    let content = `
      <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">
        ${t("chat.stats.export.title")} - ${session.name}
      </h1>
      <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
        <div>${t("chat.elapsedTime")}: ${formatElapsedTime(
      session.createdAt
    )}</div>
        <div>${t("chat.tokenUsage")}: ${formatNumber(session.tokenUsage)}</div>
      </div>
    `;

    const messages = messagesToUse || session.messages.filter(msg => !msg.hidden);

    messages.forEach((message, index) => {
      // Skip hidden messages (system summaries) only if not explicitly passed
      if (message.hidden && !messagesToUse) return;

      const roleLabel = message.role === "user" ? "User" : "Assistant";
      const timestamp = message.timestamp
        ? message.timestamp.toLocaleString()
        : "";
      const bgColor = message.role === "user" ? "#e3f2fd" : "#f5f5f5";
      const textColor = "#333";

      content += `
        <div style="margin-bottom: 20px; padding: 15px; background-color: ${bgColor}; border-radius: 8px; border-left: 4px solid ${
        message.role === "user" ? "#2196f3" : "#4caf50"
      };">
          <div style="font-weight: bold; margin-bottom: 8px; font-size: 16px; color: ${textColor};">
            ${index + 1}. ${roleLabel}
            <span style="font-size: 12px; font-weight: normal; color: #666;"> (${timestamp})</span>
          </div>
          <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; color: ${textColor}; line-height: 1.4;">
            ${message.content.replace(/\n/g, "<br>")}
          </div>
          ${
            message.tokenUsage
              ? `<div style="font-size: 12px; color: #666; margin-top: 8px;">[${t(
                  "chat.stats.tokenUsage"
                ).replace("トークン使用量", t("chat.tokenUsage"))}: ${
                  message.tokenUsage
                }]</div>`
              : ""
          }
        </div>
      `;
    });

    content += `
      <div style="text-align: center; font-size: 12px; color: #999; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
        Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
      </div>
    `;

    return content;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content stats-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>📊 {t("chat.stats.title")}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Export Section */}
          {sessions.length > 0 && (
            <div className="export-section">
              <div className="export-session-selector">
                <label htmlFor="session-select">
                  {t("chat.stats.export.selectSession")}:
                </label>
                <select
                  id="session-select"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                >
                  <option value="all" disabled>
                    {t("chat.stats.export.noSessionAvailable")}
                  </option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name} ({formatNumber(session.messages.length)}{" "}
                      メッセージ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="export-buttons">
                <button
                  onClick={exportAsText}
                  disabled={isExporting || selectedSessionId === "all"}
                >
                  {isExporting
                    ? t("chat.stats.export.exporting")
                    : `${t("chat.stats.export.button")} TXT`}
                </button>

                <button
                  onClick={exportAsPdf}
                  disabled={isExporting || selectedSessionId === "all"}
                >
                  {isExporting
                    ? t("chat.stats.export.exporting")
                    : `${t("chat.stats.export.button")} PDF`}
                </button>
              </div>
            </div>
          )}

          {/* Export Success Notification */}
          {exportSuccessMessage && (
            <div
              className="export-success-notification"
              style={{
                padding: "12px var(--spacing-lg)",
                backgroundColor: "#d4edda",
                border: "1px solid #c3e6cb",
                borderRadius: "var(--radius-md)",
                margin: "var(--spacing-sm) var(--spacing-lg)",
                color: "#155724",
                fontSize: "14px",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "16px" }}>✅</span>
              <span>{exportSuccessMessage}</span>
            </div>
          )}
          {/* Overview Section */}
          <div className="stats-section overview-section">
            <h3>📈 {t("chat.stats.overview")}</h3>
            <div className="overview-grid">
              <div className="overview-card">
                <div className="overview-icon">💬</div>
                <div className="overview-content">
                  <div className="overview-label">
                    {t("chat.stats.sessionCount")}
                  </div>
                  <div className="overview-value">{sessions.length}</div>
                </div>
              </div>
              <div className="overview-card">
                <div className="overview-icon">🎯</div>
                <div className="overview-content">
                  <div className="overview-label">
                    {t("chat.stats.totalTokensSummary")}
                  </div>
                  <div className="overview-value">
                    {formatNumber(totalTokens)}
                  </div>
                </div>
              </div>
              <div className="overview-card">
                <div className="overview-icon">💬</div>
                <div className="overview-content">
                  <div className="overview-label">
                    {t("chat.stats.totalMessages")}
                  </div>
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
              <h3>🤖 {t("chat.stats.modelUsage")}</h3>
              {Object.entries(aggregateStats.models).map(
                ([modelName, modelData]: [string, any]) => (
                  <div key={modelName} className="model-card">
                    <div className="model-header">
                      <span className="model-name">{modelName}</span>
                    </div>

                    <div className="stats-grid">
                      <div className="stat-group">
                        <h4>{t("chat.stats.apiStats")}</h4>
                        <div className="stat-row">
                          <span className="stat-icon">📤</span>
                          <span className="stat-label">
                            {t("chat.stats.requests")}
                          </span>
                          <span className="stat-value">
                            {modelData.api.totalRequests}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">❌</span>
                          <span className="stat-label">
                            {t("chat.stats.errors")}
                          </span>
                          <span className="stat-value">
                            {modelData.api.totalErrors}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">⏱️</span>
                          <span className="stat-label">
                            {t("chat.stats.latency")}
                          </span>
                          <span className="stat-value">
                            {modelData.api.totalLatencyMs}ms
                          </span>
                        </div>
                      </div>

                      <div className="stat-group">
                        <h4>{t("chat.stats.tokenUsage")}</h4>
                        <div className="stat-row">
                          <span className="stat-icon">📝</span>
                          <span className="stat-label">
                            {t("chat.stats.promptTokens")}
                          </span>
                          <span className="stat-value highlight-primary">
                            {formatNumber(modelData.tokens.prompt)}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">💬</span>
                          <span className="stat-label">
                            {t("chat.stats.responseTokens")}
                          </span>
                          <span className="stat-value highlight-success">
                            {formatNumber(modelData.tokens.candidates)}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">🎯</span>
                          <span className="stat-label">
                            {t("chat.stats.totalTokens")}
                          </span>
                          <span className="stat-value highlight-total">
                            {formatNumber(modelData.tokens.total)}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">💾</span>
                          <span className="stat-label">
                            {t("chat.stats.cachedTokens")}
                          </span>
                          <span className="stat-value">
                            {formatNumber(modelData.tokens.cached)}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">💭</span>
                          <span className="stat-label">
                            {t("chat.stats.thoughtsTokens")}
                          </span>
                          <span className="stat-value">
                            {formatNumber(modelData.tokens.thoughts)}
                          </span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-icon">🔧</span>
                          <span className="stat-label">
                            {t("chat.stats.toolTokens")}
                          </span>
                          <span className="stat-value">
                            {formatNumber(modelData.tokens.tool)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Tool Usage Section */}
          <div className="stats-section">
            <h3>🔧 {t("chat.stats.toolUsage")}</h3>
            <div className="tool-summary-card">
              <div className="stat-row">
                <span className="stat-icon">📞</span>
                <span className="stat-label">{t("chat.stats.totalCalls")}</span>
                <span className="stat-value">
                  {aggregateStats.tools.totalCalls}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">✅</span>
                <span className="stat-label">{t("chat.stats.success")}</span>
                <span className="stat-value highlight-success">
                  {aggregateStats.tools.totalSuccess}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">⚠️</span>
                <span className="stat-label">{t("chat.stats.fail")}</span>
                <span className="stat-value highlight-error">
                  {aggregateStats.tools.totalFail}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">⏱️</span>
                <span className="stat-label">
                  {t("chat.stats.totalDuration")}
                </span>
                <span className="stat-value">
                  {aggregateStats.tools.totalDurationMs}ms
                </span>
              </div>
            </div>

            {Object.keys(aggregateStats.tools.byName).length > 0 && (
              <div className="tools-details">
                <h4>{t("chat.stats.toolDetails")}</h4>
                <div className="tools-grid">
                  {Object.entries(aggregateStats.tools.byName).map(
                    ([toolName, toolData]: [string, any]) => (
                      <div key={toolName} className="tool-detail-card">
                        <div className="tool-name">🔨 {toolName}</div>
                        <div className="tool-stats">
                          <div className="stat-row">
                            <span className="stat-label">
                              {t("chat.stats.usageCount")}
                            </span>
                            <span className="stat-value">{toolData.count}</span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">
                              {t("chat.stats.executionTime")}
                            </span>
                            <span className="stat-value">
                              {toolData.durationMs}ms
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* File Changes Section */}
          <div className="stats-section">
            <h3>📁 {t("chat.stats.fileChanges")}</h3>
            <div className="file-changes-card">
              <div className="stat-row">
                <span className="stat-icon">➕</span>
                <span className="stat-label">{t("chat.stats.linesAdded")}</span>
                <span className="stat-value highlight-success">
                  {aggregateStats.files.totalLinesAdded}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">➖</span>
                <span className="stat-label">{t("chat.stats.linesRemoved")}</span>
                <span className="stat-value highlight-error">
                  {aggregateStats.files.totalLinesRemoved}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-icon">📊</span>
                <span className="stat-label">{t("chat.stats.diff")}</span>
                <span className="stat-value">
                  {aggregateStats.files.totalLinesAdded -
                    aggregateStats.files.totalLinesRemoved >
                  0
                    ? "+"
                    : ""}
                  {aggregateStats.files.totalLinesAdded -
                    aggregateStats.files.totalLinesRemoved}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsModal;