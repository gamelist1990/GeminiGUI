import { useState } from "react";
import { ChatSession } from "../../types";
import { t } from "../../utils/i18n";
import { formatNumber } from "../../utils/storage";
import { formatElapsedTime } from "../../utils/storage";
import * as dialogPlugin from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
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
      const makeSafeName = (name: string, ext: string) => {
        const cleaned = name.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const maxBase = 60; // keep base name reasonable to avoid long paths
        const base =
          cleaned.length > maxBase ? cleaned.slice(0, maxBase) : cleaned;
        return `${base}_conversation.${ext}`;
      };

  const defaultName = makeSafeName(selectedSession.id || `session_${Date.now()}`, "txt");

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
        await writeTextFile(savePath, textContent);
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

  const exportAsJson = async () => {
    if (!selectedSession) {
      alert(t("chat.stats.export.selectSessionFirst"));
      return;
    }

    try {
      setIsExporting(true);

      // Generate JSON content
      const jsonContent = generateConversationJson(selectedSession);

      const makeSafeName = (name: string, ext: string) => {
        const cleaned = name.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const maxBase = 60; // keep base name reasonable to avoid long paths
        const base =
          cleaned.length > maxBase ? cleaned.slice(0, maxBase) : cleaned;
        return `${base}_conversation.${ext}`;
      };

      const defaultName = makeSafeName(selectedSession.id || `session_${Date.now()}`, "json");

      const savePath = await dialogPlugin.save({
        title: t("chat.stats.export.title"),
        filters: [
          {
            name: "JSON Files",
            extensions: ["json"],
          },
        ],
        defaultPath: defaultName,
      });

      if (savePath) {
        await writeTextFile(savePath, jsonContent);
        setExportSuccessMessage(t("chat.stats.export.successJson"));
        // Clear success message after 3 seconds
        setTimeout(() => setExportSuccessMessage(""), 3000);
      }
    } catch (error) {
      console.error("JSON export failed:", error);
      alert(t("chat.stats.export.error"));
    } finally {
      setIsExporting(false);
    }
  };

  const generateConversationJson = (session: ChatSession): string => {
    const exportData = {
      metadata: {
        exportType: "chat_session",
        exportVersion: "1.0",
        exportedAt: new Date().toISOString(),
        sessionId: session.id,
        sessionName: session.name,
        createdAt: session.createdAt.toISOString(),
        totalTokenUsage: session.tokenUsage,
        messageCount: session.messages.filter(msg => !msg.hidden).length,
        totalMessageCount: session.messages.length,
      },
      messages: session.messages
        .filter(message => !message.hidden)
        .map((message, index) => ({
          id: message.id,
          index: index + 1,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp ? message.timestamp.toISOString() : null,
          tokenUsage: message.tokenUsage || 0,
          stats: message.stats || null,
        })),
      summary: {
        userMessages: session.messages.filter(msg => msg.role === "user" && !msg.hidden).length,
        assistantMessages: session.messages.filter(msg => msg.role === "assistant" && !msg.hidden).length,
        systemMessages: session.messages.filter(msg => msg.role === "system" && !msg.hidden).length,
        totalTokens: session.tokenUsage,
        sessionDuration: formatElapsedTime(session.createdAt),
      }
    };

    return JSON.stringify(exportData, null, 2);
  };

  const generateConversationText = (session: ChatSession): string => {
  let content = `${t("chat.stats.export.title")}\n`;
    content += `=${"=".repeat(50)}=\n\n`;
    content += `${t("chat.elapsedTime")}: ${formatElapsedTime(
      session.createdAt
    )}\n`;
    content += `${t("chat.tokenUsage")}: ${formatNumber(
      session.tokenUsage
    )}\n\n`;

    session.messages.forEach((message, index) => {
      if (message.hidden) return; // Skip hidden messages (system summaries)

  const roleLabel = message.role === "user" ? t("chat.role.user") : t("chat.role.assistant");
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
    content += `${t("chat.stats.export.title")} (${new Date().toLocaleDateString()})\n`;

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

              {/* ロゴ削除オプションは廃止 */}

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
                  onClick={exportAsJson}
                  disabled={isExporting || selectedSessionId === "all"}
                >
                  {isExporting
                    ? t("chat.stats.export.exporting")
                    : `${t("chat.stats.export.button")} JSON`}
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
                <span className="stat-label">
                  {t("chat.stats.linesRemoved")}
                </span>
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
