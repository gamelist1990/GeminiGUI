import React from "react";
import * as opener from "@tauri-apps/plugin-opener";

const ReactMarkdown = React.lazy(
  () => import("react-markdown")
) as unknown as any;
// dynamic highlighter handled by DynamicSyntaxHighlighter component

// Use a dynamic wrapper component to avoid TDZ/initialization ordering issues in production bundles
import DynamicSyntaxHighlighter from "../../components/DynamicSyntaxHighlighter";

// Markdown components for syntax highlighting
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
            <DynamicSyntaxHighlighter
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\\n$/, "")}
            </DynamicSyntaxHighlighter>
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

// Open external links using Tauri opener plugin when available, fallback to window.open
export async function openExternal(url: string) {
  try {
    const mod: any = opener;
    if (mod) {
      if (typeof mod.openUrl === "function") {
        await mod.openUrl(url);
        return;
      }
      if (typeof mod.open === "function") {
        await mod.open(url);
        return;
      }
      if (mod.default) {
        if (typeof mod.default.openUrl === "function") {
          await mod.default.openUrl(url);
          return;
        }
        if (typeof mod.default.open === "function") {
          await mod.default.open(url);
          return;
        }
      }
    }
  } catch (e) {
    // ignore and fallback to window.open
  }

  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    // ignore
  }
}