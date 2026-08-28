// IPC wrapper for compiling raw Markdown to semantic HTML using Rust pulldown-cmark

import { invokeIpc } from '../../shared/ipc.js';

/**
 * Invokes the Rust `render_markdown` command to parse and compile raw Markdown
 * into semantic HTML using the high-performance `pulldown-cmark` engine with GFM extensions.
 *
 * @param markdown - Raw Markdown string to be compiled.
 * @returns Compiled HTML string.
 */
export async function renderMarkdownIpc(markdown: string): Promise<string> {
  if (!markdown || markdown.trim().length === 0) {
    return '';
  }

  try {
    const html = await invokeIpc<string>('render_markdown', { content: markdown });
    return html ?? '';
  } catch (err) {
    console.error('[Markdown IPC] Failed to render markdown:', err);
    // Return raw markdown as fallback wrapped in a paragraph
    return `<p>${escapeHtml(markdown)}</p>`;
  }
}

/**
 * Basic HTML escaping helper for fallbacks.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

