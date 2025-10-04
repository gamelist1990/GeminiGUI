import { useState } from "react";
import { ChatMessage, ChatSession } from "../../types";
import { t } from "../../utils/i18n";
import { formatNumber } from "../../utils/storage";
import { formatElapsedTime } from "../../utils/storage";
import { writeBinaryFile } from "../../utils/powershellExecutor";
import { renderMarkdownToHtml } from "../../utils/htmlUtils";
import * as dialogPlugin from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { StatsModalProps } from "./types";

// Inline small subset of Chat.css relevant to markdown/message styling for PDF export.
// Kept in JS so we can inject the styles into the temporary export DOM.
const readChatCssForPdf = (): string => `
/* PDF Export Optimized Styles */
* { box-sizing: border-box; }

.export-wrapper { 
  width: 100%; 
  max-width: 1200px; 
  margin: 0 auto; 
  padding: 0; 
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  background: #ffffff;
}

.export-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 24px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
  margin-bottom: 24px;
}

.export-title { 
  font-size: 24px; 
  font-weight: 700; 
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.export-meta { 
  font-size: 13px; 
  color: rgba(255,255,255,0.95);
  text-align: right;
  line-height: 1.6;
}

.page { 
  padding: 24px 32px; 
  min-height: 100px;
}

.message { 
  display: block; 
  margin-bottom: 24px;
  page-break-inside: avoid;
}

/* User Message Styling */
.message.user {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-left: 5px solid #2196f3;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.15);
}

/* Assistant Message Styling */
.message.assistant {
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
  border-left: 5px solid #4caf50;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.15);
}

/* Role Badge Styling */
[data-export-role] {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.message.user [data-export-role] {
  background: #2196f3;
  color: white;
}

.message.assistant [data-export-role] {
  background: #4caf50;
  color: white;
}

.message-bubble { 
  background-color: rgba(255,255,255,0.6);
  border-radius: 8px; 
  padding: 16px;
  margin-top: 8px;
}

.message-bubble p { 
  font-size: 14px; 
  line-height: 1.7; 
  margin: 8px 0;
  white-space: pre-wrap; 
  word-wrap: break-word; 
  color: #212121;
}

/* Heading Styles */
.message-bubble h1 { 
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 24px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 3px solid #667eea;
}

.message-bubble h2 { 
  font-size: 20px;
  font-weight: 600;
  color: #2a2a2a;
  margin: 20px 0 10px 0;
  padding-bottom: 6px;
  border-bottom: 2px solid #764ba2;
}

.message-bubble h3 { 
  font-size: 18px;
  font-weight: 600;
  color: #3a3a3a;
  margin: 18px 0 8px 0;
}

.message-bubble h4, .message-bubble h5, .message-bubble h6 { 
  font-size: 16px;
  font-weight: 600;
  color: #4a4a4a;
  margin: 16px 0 8px 0;
}

/* Code Block Styling */
.message-bubble pre { 
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 16px;
  border-radius: 10px;
  overflow: auto;
  color: #e2e8f0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  margin: 16px 0;
  border: 1px solid #334155;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.message-bubble code { 
  background: rgba(139, 92, 246, 0.1);
  padding: 3px 8px;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.92em;
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.message-bubble pre code {
  background: transparent;
  padding: 0;
  border: none;
  color: inherit;
  font-size: 13px;
}

/* Blockquote Styling */
.message-bubble blockquote { 
  border-left: 5px solid #667eea;
  padding: 16px 20px;
  margin: 16px 0;
  background: linear-gradient(90deg, rgba(102, 126, 234, 0.08) 0%, rgba(102, 126, 234, 0.02) 100%);
  border-radius: 0 8px 8px 0;
  font-style: italic;
  color: #424242;
}

/* Table Styling */
.message-bubble table { 
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border-radius: 8px;
  overflow: hidden;
}

.message-bubble table th { 
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.message-bubble table td { 
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  background: white;
}

.message-bubble table tr:nth-child(even) td {
  background: #f8f9fa;
}

/* List Styling */
.message-bubble ul, .message-bubble ol {
  margin: 12px 0;
  padding-left: 24px;
  line-height: 1.8;
}

.message-bubble li {
  margin: 6px 0;
  color: #212121;
}

/* Image Styling */
.message-bubble img { 
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

/* Horizontal Rule */
.message-bubble hr {
  border: none;
  height: 2px;
  background: linear-gradient(90deg, transparent, #667eea, transparent);
  margin: 24px 0;
}

/* Link Styling */
.message-bubble a {
  color: #667eea;
  text-decoration: none;
  border-bottom: 1px solid rgba(102, 126, 234, 0.3);
  transition: all 0.2s;
}

.message-bubble a:hover {
  color: #764ba2;
  border-bottom-color: #764ba2;
}

/* Footer Styling */
.export-footer { 
  text-align: center;
  font-size: 11px;
  color: #9e9e9e;
  padding: 24px 32px;
  border-top: 2px solid #e0e0e0;
  margin-top: 32px;
  background: #fafafa;
  border-radius: 0 0 12px 12px;
}

/* Utility Classes */
.page-break { 
  page-break-after: always;
}

pre code { 
  display: block;
  white-space: pre;
}
`;

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

  const exportAsPdf = async () => {
    if (!selectedSession) {
      alert(t("chat.stats.export.selectSessionFirst"));
      return;
    }

    try {
      setIsExporting(true);

      // Safety check: limit number of messages for PDF export
      const MAX_MESSAGES_FOR_PDF = 100; // Reasonable limit to prevent string length errors
      const visibleMessages = selectedSession.messages.filter(
        (message) => !message.hidden
      );

      if (visibleMessages.length > MAX_MESSAGES_FOR_PDF) {
        alert(
          `PDF export is limited to ${MAX_MESSAGES_FOR_PDF} messages for performance reasons.\n\nYour session has ${visibleMessages.length} messages. Please consider:\n• Export as text file instead (no limits)\n• Compact long conversations first\n• Export smaller sessions individually\n\nWould you like to continue with the first ${MAX_MESSAGES_FOR_PDF} messages?`
        );
      }

      // Generate HTML content with size limits
      let htmlContent: string = "";
      let messagesToExport = visibleMessages;

      try {
        // Limit messages if too many
        // Generate HTML for limited messages
        htmlContent = generateConversationHtml(
          selectedSession,
          messagesToExport
        );

        // Additional safety check: estimate final HTML size
        if (htmlContent.length > 5000000) {
          // ~5MB limit (reasonable for HTML2Canvas)
          throw new Error("HTML_TOO_LARGE");
        }
      } catch (htmlError) {
        if (
          htmlError === "HTML_TOO_LARGE" ||
          (htmlError as Error).message?.includes("Invalid string length")
        ) {
          alert(
            `PDF export cancelled: Content is too large for PDF generation.\n\nPlease try:\n• Export as text file instead (no size limits)\n• Reduce message content\n• Split large conversations\n\nEstimated content size: ${
              htmlContent.length / 1024 / 1024
            }MB`
          );
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

      // Prefer cloning the live chat DOM if possible (simpler and preserves exact styles)
      const chatDom = document.querySelector(
        ".messages-container"
      ) as HTMLElement | null;
      if (chatDom) {
        // Use the live chat markup instead of generated HTML
        tempDiv.innerHTML = "";
        const chatClone = chatDom.cloneNode(true) as HTMLElement;
        // Ensure the clone expands fully (remove scrolls)
        chatClone.style.overflow = "visible";
        chatClone.style.maxHeight = "none";
        chatClone.style.width = "1200px";

        // Expand any scrollable children so their full content is visible for rendering
        try {
          const scrollableSelectors = ['.scrollable', '.overflow-auto', '.message-bubble', '.code-block', 'pre', '.chat-message-body'];
          const scrollables = new Set<HTMLElement>();
          for (const sel of scrollableSelectors) {
            const found = Array.from(chatClone.querySelectorAll<HTMLElement>(sel));
            found.forEach((el) => scrollables.add(el));
          }

          scrollables.forEach((el) => {
            try {
              el.style.overflow = 'visible';
              el.style.maxHeight = 'none';
              (el as HTMLElement).scrollTop = 0;
              // If element contains code blocks or pre, expand them as well
              const pres = Array.from(el.querySelectorAll('pre, code')) as HTMLElement[];
              pres.forEach((p) => {
                p.style.whiteSpace = 'pre-wrap';
                p.style.overflow = 'visible';
                p.style.maxHeight = 'none';
              });
            } catch (e) {
              // ignore
            }
          });
        } catch (e) {
          console.warn('Failed to expand scrollable elements for export', e);
        }

        // Ensure the cloned chat contains visible role labels (User / Assistant)
        try {
          // Prefer the message container element (.message) which wraps avatar and bubble
          const msgContainers = Array.from(
            chatClone.querySelectorAll<HTMLElement>(".message")
          );

          msgContainers.forEach((m) => {
            // skip system-type messages that shouldn't show a user/assistant label
            if (m.classList.contains("system")) return;

            // avoid double-injection
            if (m.querySelector("[data-export-role]")) return;

            let roleText = "";
            if (m.classList.contains("user")) {
              roleText = t("chat.role.user");
            } else if (m.classList.contains("assistant")) {
              roleText = t("chat.role.assistant");
            } else if (m.getAttribute("data-role")) {
              const r = m.getAttribute("data-role");
              if (r === "user") roleText = t("chat.role.user");
              else if (r === "assistant") roleText = t("chat.role.assistant");
            }

            if (roleText) {
              const label = document.createElement("div");
              label.setAttribute("data-export-role", "1");
              // Badge styling with role-specific colors
              label.style.display = "inline-block";
              label.style.padding = "6px 12px";
              label.style.borderRadius = "20px";
              label.style.fontSize = "12px";
              label.style.fontWeight = "700";
              label.style.marginBottom = "12px";
              label.style.marginRight = "8px";
              label.style.lineHeight = "1";
              label.style.textTransform = "uppercase";
              label.style.letterSpacing = "0.5px";
              label.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
              
              // Role-specific colors
              if (m.classList.contains("user")) {
                label.style.background = "#2196f3";
                label.style.color = "#ffffff";
              } else if (m.classList.contains("assistant")) {
                label.style.background = "#4caf50";
                label.style.color = "#ffffff";
              } else {
                label.style.background = "#9e9e9e";
                label.style.color = "#ffffff";
              }
              
              label.innerText = roleText;

              // Insert label before the message-bubble if present, otherwise at top
              const bubble = m.querySelector(".message-bubble");
              if (bubble && bubble.parentElement === m) {
                m.insertBefore(label, bubble);
              } else {
                m.insertBefore(label, m.firstChild);
              }
            }
          });
        } catch (e) {
          // Non-fatal: proceed without injected labels if something goes wrong
          console.warn("Failed to inject role labels into chat clone", e);
        }


        if (messagesToExport.length < visibleMessages.length) {
          const warn = document.createElement("div");
          warn.style.background = "#fef3c7";
          warn.style.padding = "15px";
          warn.style.marginBottom = "20px";
          warn.style.borderRadius = "8px";
          warn.style.border = "1px solid #f59e0b";
          warn.innerHTML = `⚠️ <strong>Warning:</strong> This PDF contains only the first ${MAX_MESSAGES_FOR_PDF} messages due to size limits. Export as text for complete conversation.`;
          tempDiv.appendChild(warn);
        }

        tempDiv.appendChild(chatClone);
      } else {
        // Fallback: use previously generated HTML
        if (messagesToExport.length < visibleMessages.length) {
          // Add warning about truncated content
          tempDiv.innerHTML = htmlContent.replace(
            '<h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">',
            '<div style="background: #fef3c7; padding: 15px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #f59e0b;">⚠️ <strong>Warning:</strong> This PDF contains only the first ' +
              MAX_MESSAGES_FOR_PDF +
              ' messages due to size limits. Export as text for complete conversation.</div><h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #333;">'
          );
        } else {
          tempDiv.innerHTML = htmlContent;
        }
      }

      // Position temporarily off-screen
      tempDiv.style.position = "absolute";
      tempDiv.style.left = "-9999px";
      tempDiv.style.top = "-9999px";

      document.body.appendChild(tempDiv);

      try {
        // Inject optimized CSS for export
        const chatCss = readChatCssForPdf();
        if (!tempDiv.querySelector("style[data-export-chat-css]")) {
          const styleEl = document.createElement("style");
          styleEl.setAttribute("data-export-chat-css", "1");
          styleEl.innerHTML = chatCss;
          tempDiv.insertBefore(styleEl, tempDiv.firstChild);
        }

        // Remove suspect decorative/branding elements that render as small centered blue text
        // We only remove elements outside of message bubbles and not anchors (links).
        try {
          const suspectRgb = ['rgb(102, 126, 234)', 'rgb(102,126,234)', 'rgba(102, 126, 234, 1)', 'rgb(0, 0, 255)'];
          const allEls = Array.from(tempDiv.querySelectorAll<HTMLElement>('*'));
          for (const el of allEls) {
            try {
              if (el.tagName === 'A') continue; // skip links
              if (el.closest('.message-bubble')) continue; // keep message content
              const cs = window.getComputedStyle(el);
              const color = (cs && cs.color) || '';
              if (!color) continue;
              const trimmed = color.replace(/\s/g, '');
              const isSuspectColor = suspectRgb.some((s) => s.replace(/\s/g, '') === trimmed);
              if (!isSuspectColor) continue;
              const text = (el.textContent || '').trim();
              if (!text) continue;
              // Heuristic: small headline-like content (short length) and centered
              const isCentered = (cs.textAlign || '').toLowerCase() === 'center';
              if (isCentered && text.length < 120) {
                el.remove();
              }
            } catch (e) {
              // ignore per-element failures
            }
          }
        } catch (e) {
          console.warn('Failed to prune decorative elements before export', e);
        }

        // New simplified flow:
        // 1) Render the entire tempDiv at high scale into a single canvas.
        // 2) Slice the canvas vertically to fit A4 pages.
        // 3) Add header/footer for each page and save to PDF.

        const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4", compress: true });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Render full content to one canvas (scale up for quality)
        const renderScale = 2; // 2x for better quality
        const canvas = await html2canvas(tempDiv, {
          scale: renderScale,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          foreignObjectRendering: false,
        });

        const imgW = canvas.width;
        const imgH = canvas.height;

        // Map DOM message element positions to canvas pixel coordinates so we can
        // slice only at message boundaries when possible.
        const containerClientW = tempDiv.clientWidth || tempDiv.scrollWidth || imgW / renderScale;
        const scaleFactor = imgW / Math.max(1, containerClientW);

        const messageEls = Array.from(
          tempDiv.querySelectorAll<HTMLElement>('[data-export-message], .message')
        );

        const messageBounds: { top: number; bottom: number }[] = [];
        try {
          const containerRect = tempDiv.getBoundingClientRect();
          for (const el of messageEls) {
            const r = el.getBoundingClientRect();
            const relTop = Math.max(0, r.top - containerRect.top + tempDiv.scrollTop);
            const relBottom = relTop + el.offsetHeight;
            messageBounds.push({ top: Math.round(relTop * scaleFactor), bottom: Math.round(relBottom * scaleFactor) });
          }
        } catch (e) {
          // If anything goes wrong, fall back to empty bounds so we slice uniformly.
          console.warn("Failed to compute message bounds for PDF slicing", e);
        }

        // Calculate pixels per PDF page (in canvas pixel space)
        const pxPerPdfPage = Math.floor((imgW * pdfHeight) / pdfWidth);

        const pages: { sy: number; sh: number }[] = [];
        let currentTop = 0;

        if (messageBounds.length === 0) {
          // No message boundaries found: uniform slicing
          while (currentTop < imgH) {
            const sh = Math.min(pxPerPdfPage, imgH - currentTop);
            pages.push({ sy: currentTop, sh });
            currentTop += sh;
          }
        } else {
          // Build pages snapping to message bottoms when possible
          const totalMsg = messageBounds.length;
          let nextMsgIdx = 0;

          while (currentTop < imgH) {
            const pageLimit = currentTop + pxPerPdfPage;

            // Find the last message whose bottom is <= pageLimit
            let lastIdx = -1;
            for (let i = nextMsgIdx; i < totalMsg; i++) {
              if (messageBounds[i].bottom <= pageLimit) lastIdx = i;
              else break;
            }

            if (lastIdx >= 0) {
              // slice at the bottom of that message
              const sliceBottom = messageBounds[lastIdx].bottom;
              const sh = Math.min(sliceBottom - currentTop, imgH - currentTop);
              pages.push({ sy: currentTop, sh });
              // advance nextMsgIdx to first message after lastIdx
              nextMsgIdx = lastIdx + 1;
              currentTop = sliceBottom;
            } else {
              // No complete message fits on this page.
              // If the very next message is taller than a page, we need to slice within it.
              const nextMsg = messageBounds[nextMsgIdx];
              if (!nextMsg) {
                // no more messages: just slice the remainder
                const sh = Math.min(pxPerPdfPage, imgH - currentTop);
                pages.push({ sy: currentTop, sh });
                currentTop += sh;
              } else {
                const msgTop = nextMsg.top;
                const msgBottom = nextMsg.bottom;
                // If message starts after currentTop and fits partially, include up to pageLimit
                if (msgBottom - msgTop > pxPerPdfPage) {
                  // oversized single message -> slice one page worth
                  const sh = Math.min(pxPerPdfPage, imgH - currentTop);
                  pages.push({ sy: currentTop, sh });
                  currentTop += sh;
                } else if (msgTop > currentTop && msgBottom > pageLimit) {
                  // message starts after currentTop but doesn't fully fit: include up to its top
                  const sh = Math.min(msgTop - currentTop, imgH - currentTop);
                  if (sh <= 0) {
                    // fallback to pageLimit
                    const sh2 = Math.min(pxPerPdfPage, imgH - currentTop);
                    pages.push({ sy: currentTop, sh: sh2 });
                    currentTop += sh2;
                  } else {
                    pages.push({ sy: currentTop, sh });
                    currentTop += sh;
                  }
                } else {
                  // default: slice up to pageLimit
                  const sh = Math.min(pxPerPdfPage, imgH - currentTop);
                  pages.push({ sy: currentTop, sh });
                  currentTop += sh;
                }
              }
            }
          }
        }

        // Render pages
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
          const { sy, sh } = pages[pageIdx];
          const partCanvas = document.createElement("canvas");
          partCanvas.width = imgW;
          partCanvas.height = sh;
          const ctx = partCanvas.getContext("2d");
          if (!ctx) throw new Error("CanvasRenderingContext2D not available");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, partCanvas.width, partCanvas.height);
          ctx.drawImage(canvas, 0, sy, imgW, sh, 0, 0, imgW, sh);

          const imgData = partCanvas.toDataURL("image/png", 0.95);

          if (pageIdx > 0) pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, (sh * pdfWidth) / imgW);


          // Footer
          try { pdf.setFont("helvetica", "normal"); } catch (e) {/* ignore */}
          pdf.setFontSize(9);
          pdf.setTextColor(158, 158, 158);
          pdf.text(`Page ${pageIdx + 1} / ${pages.length}`, pdfWidth / 2, pdfHeight - 20, { align: "center" });
          pdf.setFontSize(8);
          pdf.text(new Date().toLocaleDateString(), pdfWidth / 2, pdfHeight - 12, { align: "center" });
          pdf.setDrawColor(224, 224, 224);
          pdf.setLineWidth(0.3);
          pdf.line(40, pdfHeight - 26, pdfWidth - 40, pdfHeight - 26);
        }

        // Let user pick save location
        const makeSafeName = (name: string, ext: string) => {
          const cleaned = name.replace(/[^a-zA-Z0-9\-_]/g, "_");
          const maxBase = 60;
          const base = cleaned.length > maxBase ? cleaned.slice(0, maxBase) : cleaned;
          return `${base}_conversation.${ext}`;
        };

  const defaultName = makeSafeName(selectedSession.id || `session_${Date.now()}`, "pdf");
        const savePath = await dialogPlugin.save({
          title: "Save Conversation PDF",
          filters: [{ name: "PDF Files", extensions: ["pdf"] }],
          defaultPath: defaultName,
        });

        if (savePath) {
          const pdfBlob = pdf.output("blob");
          const arrayBuffer = await pdfBlob.arrayBuffer();
          await writeBinaryFile(savePath, arrayBuffer);
          setExportSuccessMessage(t("chat.stats.export.successPdf"));
          setTimeout(() => setExportSuccessMessage(""), 3000);
        }
      } finally {
        try { document.body.removeChild(tempDiv); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error("PDF export failed:", error);

      // Provide more helpful error messages
      if (error instanceof Error) {
        if (
          error.message.includes("Invalid string length") ||
          error.message === "HTML_TOO_LARGE"
        ) {
          alert(
            `PDF export failed: Content too large.\n\n${t(
              "chat.stats.export.error"
            )}\n\nTry:\n• Export as text file (.txt) instead\n• Reduce message content\n• Split large conversations`
          );
        } else if (error.message.includes("HTML2Canvas")) {
          alert(
            `PDF export failed: Rendering issue.\n\n${t(
              "chat.stats.export.error"
            )}\n\nTry refreshing the page and exporting again.`
          );
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

  const generateConversationHtml = (
    session: ChatSession,
    messagesToUse?: ChatMessage[]
  ): string => {
    let content = `
      <div class="export-wrapper">
        <div class="export-header">
          <div class="export-title">${t("chat.stats.export.title")}</div>
          <div class="export-meta">${t(
            "chat.elapsedTime"
          )}: ${formatElapsedTime(session.createdAt)}<br/>${t(
      "chat.tokenUsage"
    )} : ${formatNumber(session.tokenUsage)}</div>
        </div>
    `;

    const messages =
      messagesToUse || session.messages.filter((msg) => !msg.hidden);

    messages.forEach((message) => {
      // Skip hidden messages (system summaries) only if not explicitly passed
      if (message.hidden && !messagesToUse) return;

      const roleLabel = message.role === "user" ? t("chat.role.user") : t("chat.role.assistant");
      const timestamp = message.timestamp
        ? message.timestamp.toLocaleString()
        : "";
      const bgColor = message.role === "user" 
        ? "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)"
        : "linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)";
      const borderColor = message.role === "user" ? "#2196f3" : "#4caf50";
      const badgeBg = message.role === "user" ? "#2196f3" : "#4caf50";
      const shadowColor = message.role === "user" 
        ? "rgba(33, 150, 243, 0.15)" 
        : "rgba(76, 175, 80, 0.15)";

      content += `
        <div data-export-message="1" class="message ${message.role}" style="margin-bottom: 24px; padding: 16px 20px; background: ${bgColor}; border-radius: 12px; border-left: 5px solid ${borderColor}; box-shadow: 0 2px 8px ${shadowColor}; page-break-inside: avoid;">
          <div data-export-role="1" style="display: inline-block; padding: 6px 12px; border-radius: 20px; background: ${badgeBg}; color: white; font-size: 12px; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ${roleLabel}
          </div>
          <div style="font-size: 11px; color: #757575; margin-bottom: 12px; display: inline-block; margin-left: 8px;">
            📅 ${timestamp}
          </div>
          <div class="message-bubble" style="background-color: rgba(255,255,255,0.6); border-radius: 8px; padding: 16px; margin-top: 8px;">
            <div style="font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; white-space: pre-wrap; color: #212121; line-height: 1.7; font-size: 14px;">
              ${renderMarkdownToHtml(message.content)}
            </div>
          </div>
          ${
            message.tokenUsage
              ? `<div style="font-size: 12px; color: #757575; margin-top: 12px; padding: 8px 12px; background: rgba(158, 158, 158, 0.08); border-radius: 6px; display: inline-block;">🔢 ${t(
                  "chat.stats.tokenUsage"
                ).replace("トークン使用量", t("chat.tokenUsage"))}: ${formatNumber(
                  message.tokenUsage
                )}</div>`
              : ""
          }
        </div>
      `;
    });

    content += `
      <div class="export-footer">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</div>
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
