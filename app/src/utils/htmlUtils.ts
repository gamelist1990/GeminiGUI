// Small utility for HTML escaping user content to prevent XSS when using innerHTML
export function escapeHtml(unsafe: string): string {
  if (!unsafe && unsafe !== '') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function formatMessageForHtml(message: string): string {
  // Preserve newlines while escaping
  return escapeHtml(message).replace(/\n/g, '<br>');
}

// Lightweight Markdown -> HTML renderer (safe):
// - supports fenced code blocks (```), inline code (`), headings (#), bold (**), italic (*), links [text](url), unordered lists (-)
// - escapes HTML to prevent XSS (content inside code blocks and inline code is escaped)
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown && markdown !== '') return '';

  let text = markdown;

  // Extract fenced code blocks first
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    const escaped = escapeHtml(code);
    const index = codeBlocks.push({ lang: lang || '', code: escaped } as any) - 1;
    return `__CODEBLOCK_${index}__`;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+?)`/g, (_m: string, code: string) => {
    const escaped = escapeHtml(code);
    const index = inlineCodes.push(escaped) - 1;
    return `__INLINECODE_${index}__`;
  });

  // Escape remaining text
  text = escapeHtml(text);

  // Headings
  text = text.replace(/^######\s?(.*)$/gm, '<h6>$1</h6>');
  text = text.replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>');
  text = text.replace(/^####\s?(.*)$/gm, '<h4>$1</h4>');
  text = text.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>');

  // Bold and italic (simple)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered lists: lines starting with - or *
  // Convert consecutive list lines into <ul>
  text = text.replace(/(?:^|\n)([ \t]*[-\*]\s+.+(?:\n[ \t]*[-\*]\s+.+)*)/g, (_m: string, group: string) => {
    const items = group.split(/\n/).map((l: string) => l.replace(/^[ \t]*[-\*]\s+/, ''));
    return '\n<ul>' + items.map((i: string) => `<li>${i}</li>`).join('') + '</ul>';
  });

  // Paragraphs: split by double newlines
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  text = paragraphs.map(p => p.includes('<h') || p.startsWith('<ul') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');

  // Restore inline code
  text = text.replace(/__INLINECODE_(\d+)__/g, (_m: string, idx: string) => `<code>${inlineCodes[Number(idx)]}</code>`);

  // Restore code blocks
  text = text.replace(/__CODEBLOCK_(\d+)__/g, (_m: string, idx: string) => {
    const entry = (codeBlocks as any[])[Number(idx)];
    if (!entry) return '';
    const langClass = entry.lang ? ` class="language-${entry.lang}"` : '';
    return `<pre><code${langClass}>${entry.code}</code></pre>`;
  });

  return text;
}
