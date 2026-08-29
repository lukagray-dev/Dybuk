// Bidirectional serialization between WYSIWYG DOM and GitHub-Flavored Markdown (GFM)
// Compiles Markdown -> HTML via Rust pulldown-cmark backend, and DOM -> Markdown via pure-TS walker

import { renderMarkdownIpc } from '../markdown/ipc.js';
import { invokeIpc } from '../../shared/ipc.js';

/**
 * Compiles a raw Markdown string into structured semantic HTML via the Rust backend
 * and populates the given canvas container.
 *
 * @param markdown - Raw Markdown source string.
 * @param container - The contenteditable canvas HTMLElement.
 * @param docPath - Optional file path of the currently open document for relative asset resolution.
 */
export async function markdownToDom(
  markdown: string,
  container: HTMLElement,
  docPath?: string | null
): Promise<void> {
  if (!markdown || markdown.trim().length === 0) {
    container.innerHTML = '<p><br></p>';
    return;
  }

  // Compile via Rust pulldown-cmark engine
  const html = await renderMarkdownIpc(markdown);
  container.innerHTML = html;

  // 1. Post-process KaTeX Math formulas
  renderMathInContainer(container);

  // 2. Post-process GitHub Alert blockquotes into interactive alert cards
  postProcessAlertCards(container);

  // 3. Post-process tasklist checkboxes to make them interactive in the editor
  const checkboxes = container.querySelectorAll<HTMLInputElement>(
    'input.task-list-item-checkbox, li.task-list-item > input[type="checkbox"]'
  );
  checkboxes.forEach((cb) => {
    cb.removeAttribute('disabled');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        cb.setAttribute('checked', 'checked');
      } else {
        cb.removeAttribute('checked');
      }
      // Dispatch input event to notify editor of changes
      container.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // 4. Post-process existing HTML5 media figure elements
  postProcessMediaNodes(container);

  // 5. Asynchronously resolve any local relative media files (e.g. assets/demo.png)
  await resolveRelativeMedia(container, docPath);
}

/**
 * Normalizes existing figure elements. Does NOT break inline images or badges.
 */
export function postProcessMediaNodes(container: HTMLElement): void {
  const figures = container.querySelectorAll<HTMLElement>('figure');
  figures.forEach((fig) => {
    fig.classList.add('media-wrapper');
    fig.setAttribute('contenteditable', 'false');
    if (!fig.getAttribute('align')) {
      fig.setAttribute('align', 'center');
    }
    const caption = fig.querySelector('figcaption');
    if (caption) {
      caption.setAttribute('contenteditable', 'true');
    }
  });
}

/**
 * Resolves local relative media filepaths (e.g. assets/demo.png) relative to the active document
 * and loads them via Base64 streaming so they render without broken image icons in Tauri.
 */
export async function resolveRelativeMedia(
  container: HTMLElement,
  docPath?: string | null
): Promise<void> {
  if (!docPath) return;

  const docDir = docPath.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  if (!docDir) return;

  const mediaElements = container.querySelectorAll<HTMLElement>('img, video, audio, source');
  for (let i = 0; i < mediaElements.length; i++) {
    const el = mediaElements[i];
    if (!el) continue;

    const rawSrc = el.getAttribute('src');
    if (!rawSrc) continue;

    const srcTrimmed = rawSrc.trim();
    if (!srcTrimmed) continue;

    const isRemoteOrData =
      srcTrimmed.startsWith('http://') ||
      srcTrimmed.startsWith('https://') ||
      srcTrimmed.startsWith('data:') ||
      srcTrimmed.startsWith('asset:') ||
      srcTrimmed.startsWith('blob:') ||
      srcTrimmed.startsWith('//');

    const isAbsoluteLocal =
      srcTrimmed.startsWith('/') ||
      /^[a-zA-Z]:[\\/]/.test(srcTrimmed) ||
      srcTrimmed.startsWith('\\');

    if (!isRemoteOrData) {
      // Store original relative path so we can cleanly serialize it back on save
      el.setAttribute('data-original-src', srcTrimmed);

      let fullPath = srcTrimmed;
      if (!isAbsoluteLocal) {
        const cleanRelative = srcTrimmed.replace(/^\.\//, '');
        fullPath = `${docDir}/${cleanRelative}`;
      }

      try {
        const payload = await invokeIpc<{ data_url: string }>('read_media_file_base64', {
          path: fullPath,
        });
        if (payload && payload.data_url) {
          el.setAttribute('src', payload.data_url);
        }
      } catch (err) {
        console.warn(`[Media] Could not load local relative media "${srcTrimmed}" from "${fullPath}":`, err);
      }
    }
  }
}



/**
 * Finds all LaTeX math elements in the given container and renders them with KaTeX.
 */
export function renderMathInContainer(container: HTMLElement): void {
  const winKatex = (window as unknown as { katex?: { render: (t: string, e: HTMLElement, opt?: unknown) => void } }).katex;

  const mathElements = container.querySelectorAll<HTMLElement>('.math, [data-tex]');
  mathElements.forEach((el) => {
    const isDisplay = el.classList.contains('math-display') || el.classList.contains('katex-display') || el.tagName.toUpperCase() === 'DIV';
    const tex = el.getAttribute('data-tex') || el.textContent || '';
    const cleanTex = tex.trim();
    if (!cleanTex) return;

    el.setAttribute('data-tex', cleanTex);
    if (winKatex) {
      try {
        winKatex.render(cleanTex, el, { displayMode: isDisplay, throwOnError: false });
      } catch {
        el.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
      }
    } else {
      el.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
    }
  });
}

/**
 * Post-processes blockquotes starting with `[!NOTE]`, `[!TIP]`, etc. into GitHub alert cards.
 */
function postProcessAlertCards(container: HTMLElement): void {
  const blockquotes = container.querySelectorAll<HTMLElement>('blockquote');
  blockquotes.forEach((bq) => {
    const text = bq.textContent || '';
    const match = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (match && match[1]) {
      const type = match[1].toUpperCase() as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
      const typeLower = type.toLowerCase();
      const alertTitle = type.charAt(0) + type.slice(1).toLowerCase();

      // Clean first paragraph header
      const firstP = bq.querySelector('p');
      if (firstP) {
        firstP.innerHTML = firstP.innerHTML.replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br>)?/i, '');
      }

      const alertDiv = document.createElement('div');
      alertDiv.className = `markdown-alert markdown-alert-${typeLower}`;

      const titlePara = document.createElement('p');
      titlePara.className = 'markdown-alert-title';
      titlePara.textContent = alertTitle;

      alertDiv.appendChild(titlePara);
      while (bq.firstChild) {
        alertDiv.appendChild(bq.firstChild);
      }
      bq.parentNode?.replaceChild(alertDiv, bq);
    }
  });
}

/**
 * Serializes the contenteditable canvas DOM tree back into clean, standard GitHub-Flavored Markdown.
 *
 * @param root - The contenteditable canvas root HTMLElement.
 * @returns Clean, standardized Markdown string.
 */
export function domToMarkdown(root: HTMLElement): string {
  let md = walkNode(root, 0);

  // Normalize excessive blank lines (max 2 newlines)
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

/**
 * Recursive DOM node walker that transforms HTML AST nodes into Markdown strings.
 */
function walkNode(node: Node, indentLevel: number = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  // 1. Math Elements (Highest Priority before inner KaTeX DOM)
  if (el.classList.contains('math') || el.hasAttribute('data-tex') || el.classList.contains('katex') || el.classList.contains('katex-display')) {
    const isDisplay = el.classList.contains('math-display') || el.classList.contains('katex-display') || tag === 'DIV';
    const tex = el.getAttribute('data-tex') || el.textContent || '';
    const cleanTex = tex.trim();
    if (isDisplay) {
      return `\n\n$$${cleanTex}$$\n\n`;
    }
    return `$${cleanTex}$`;
  }

  // 2. GitHub Alert Cards
  if (el.classList.contains('markdown-alert')) {
    let alertType = 'NOTE';
    if (el.classList.contains('markdown-alert-tip')) alertType = 'TIP';
    else if (el.classList.contains('markdown-alert-important')) alertType = 'IMPORTANT';
    else if (el.classList.contains('markdown-alert-warning')) alertType = 'WARNING';
    else if (el.classList.contains('markdown-alert-caution')) alertType = 'CAUTION';

    const paras = Array.from(el.querySelectorAll(':scope > p:not(.markdown-alert-title)'));
    const bodyText = paras
      .map((p) => serializeChildren(p as HTMLElement).trim())
      .filter(Boolean)
      .join('\n>\n> ');

    return `> [!${alertType}]\n> ${bodyText || 'Alert content'}\n\n`;
  }

  switch (tag) {
    case 'H1':
      return `# ${serializeChildren(el).trim()}\n\n`;
    case 'H2':
      return `## ${serializeChildren(el).trim()}\n\n`;
    case 'H3':
      return `### ${serializeChildren(el).trim()}\n\n`;
    case 'H4':
      return `#### ${serializeChildren(el).trim()}\n\n`;
    case 'H5':
      return `##### ${serializeChildren(el).trim()}\n\n`;
    case 'H6':
      return `###### ${serializeChildren(el).trim()}\n\n`;

    case 'P': {
      const textAlign = el.style.textAlign || el.getAttribute('align');
      const content = serializeChildren(el).trim();
      if (!content) return '';
      if (textAlign && (textAlign === 'center' || textAlign === 'right')) {
        return `<div align="${textAlign}">\n\n${content}\n\n</div>\n\n`;
      }
      return `${content}\n\n`;
    }

    case 'STRONG':
    case 'B': {
      const inner = serializeChildren(el);
      if (!inner.trim()) return '';
      return `**${inner}**`;
    }

    case 'EM':
    case 'I': {
      const inner = serializeChildren(el);
      if (!inner.trim()) return '';
      return `*${inner}*`;
    }

    case 'DEL':
    case 'S':
    case 'STRIKE': {
      const inner = serializeChildren(el);
      if (!inner.trim()) return '';
      return `~~${inner}~~`;
    }

    case 'CODE': {
      if (el.parentElement?.tagName.toUpperCase() === 'PRE') {
        return el.textContent || '';
      }
      const codeText = el.textContent || '';
      return `\`${codeText}\``;
    }

    case 'KBD':
      return `<kbd>${serializeChildren(el)}</kbd>`;

    case 'SUB':
      return `<sub>${serializeChildren(el)}</sub>`;

    case 'SUP':
      return `<sup>${serializeChildren(el)}</sup>`;

    case 'MARK': {
      const bg = el.style.backgroundColor;
      const inner = serializeChildren(el);
      if (bg) {
        return `<mark style="background-color: ${bg}; color: inherit;">${inner}</mark>`;
      }
      return `<mark>${inner}</mark>`;
    }

    case 'SPAN': {
      const color = el.style.color;
      const shadow = el.style.textShadow;
      const inner = serializeChildren(el);
      if (color || (shadow && shadow !== 'none')) {
        let styleStr = '';
        if (color) styleStr += `color: ${color};`;
        if (shadow && shadow !== 'none') styleStr += ` text-shadow: ${shadow};`;
        return `<span style="${styleStr.trim()}">${inner}</span>`;
      }
      return inner;
    }

    case 'PRE': {
      let lang = '';
      const codeEl = el.querySelector('code');
      if (codeEl) {
        const className = codeEl.className || '';
        const match = className.match(/language-([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          lang = match[1];
        }
      }
      const codeContent = codeEl ? codeEl.textContent || '' : el.textContent || '';
      return `\`\`\`${lang}\n${codeContent.replace(/\r\n/g, '\n').trimEnd()}\n\`\`\`\n\n`;
    }

    case 'BLOCKQUOTE': {
      const inner = serializeChildren(el).trim();
      const lines = inner.split('\n');
      const quoted = lines.map((line) => (line.trim() ? `> ${line}` : '>')).join('\n');
      return `${quoted}\n\n`;
    }

    case 'DETAILS': {
      const summaryEl = el.querySelector('summary');
      const summaryText = summaryEl ? serializeChildren(summaryEl).trim() : 'Details';
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelector('summary')?.remove();
      const content = serializeChildren(clone).trim();
      return `<details>\n<summary>${summaryText}</summary>\n\n${content}\n\n</details>\n\n`;
    }

    case 'UL': {
      let result = '';
      const children = Array.from(el.children);
      children.forEach((child) => {
        if (child.tagName.toUpperCase() === 'LI') {
          result += serializeListItem(child as HTMLElement, false, indentLevel);
        }
      });
      return `${result}\n`;
    }

    case 'OL': {
      let result = '';
      let index = 1;
      const children = Array.from(el.children);
      children.forEach((child) => {
        if (child.tagName.toUpperCase() === 'LI') {
          result += serializeListItem(child as HTMLElement, true, indentLevel, index++);
        }
      });
      return `${result}\n`;
    }

    case 'HR':
      return '---\n\n';

    case 'A': {
      const href = el.getAttribute('href') || '';
      const linkText = serializeChildren(el) || href;
      if (!href) return linkText;
      return `[${linkText}](${href})`;
    }

    case 'FIGURE': {
      const align = el.getAttribute('align') || el.style.textAlign || 'center';
      const img = el.querySelector('img');
      const video = el.querySelector('video');
      const audio = el.querySelector('audio');
      const figcaption = el.querySelector('figcaption');
      const captionText = figcaption ? serializeChildren(figcaption).trim() : '';

      let mediaHtml = '';
      if (img) {
        const src = img.getAttribute('data-original-src') || img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || captionText || '';
        const width = img.style.width || img.getAttribute('width');
        mediaHtml = `<img src="${src}" alt="${alt}"${width ? ` width="${width}"` : ''} />`;
      } else if (video) {
        const src = video.getAttribute('data-original-src') || video.getAttribute('src') || '';
        const width = video.style.width || video.getAttribute('width');
        mediaHtml = `<video controls src="${src}"${width ? ` width="${width}"` : ''}></video>`;
      } else if (audio) {
        const src = audio.getAttribute('data-original-src') || audio.getAttribute('src') || '';
        const width = audio.style.width || audio.getAttribute('width');
        mediaHtml = `<audio controls src="${src}"${width ? ` width="${width}"` : ''}></audio>`;
      }

      if (!mediaHtml) {
        return serializeChildren(el);
      }

      const captionHtml = captionText ? `<figcaption>${captionText}</figcaption>` : '';
      const alignAttr = align ? ` align="${align}"` : '';

      return `<figure${alignAttr}>${mediaHtml}${captionHtml}</figure>\n\n`;
    }

    case 'IMG': {
      const src = el.getAttribute('data-original-src') || el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      const rawWidth = el.getAttribute('width') || el.style.width || '';
      const align = el.getAttribute('align') || el.style.textAlign;

      const isInsideLink = el.closest('a') !== null;
      let width = rawWidth.trim();
      // Unset width when it represents natural/auto sizing or when an inline link badge is 100%
      if (width === 'auto' || width === '' || (isInsideLink && (width === '100%' || width === '100'))) {
        width = '';
      }

      if (!width && !align) {
        return `![${alt}](${src})`;
      }
      return `<img src="${src}" alt="${alt}"${width ? ` width="${width}"` : ''}${align ? ` align="${align}"` : ''} />`;
    }

    case 'VIDEO': {
      const src = el.getAttribute('data-original-src') || el.getAttribute('src') || '';
      const rawWidth = el.getAttribute('width') || el.style.width || '';
      const width = rawWidth === 'auto' || rawWidth === '100%' ? '' : rawWidth;
      return `<video controls src="${src}"${width ? ` width="${width}"` : ''}></video>`;
    }

    case 'AUDIO': {
      const src = el.getAttribute('data-original-src') || el.getAttribute('src') || '';
      const rawWidth = el.getAttribute('width') || el.style.width || '';
      const width = rawWidth === 'auto' || rawWidth === '100%' ? '' : rawWidth;
      return `<audio controls src="${src}"${width ? ` width="${width}"` : ''}></audio>`;
    }



    case 'TABLE':
      return serializeTable(el as HTMLTableElement);

    case 'BR':
      return '\n';

    case 'DIV':
    case 'SECTION':
    case 'ARTICLE': {
      const align = el.getAttribute('align') || el.style.textAlign;
      const inner = serializeChildren(el);
      if (align && (align === 'center' || align === 'right')) {
        return `<div align="${align}">\n\n${inner.trim()}\n\n</div>\n\n`;
      }
      return inner.endsWith('\n') ? inner : `${inner}\n`;
    }

    default:
      return serializeChildren(el);
  }
}

/**
 * Serializes all children of a given element.
 */
function serializeChildren(el: HTMLElement): string {
  let output = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child) {
      output += walkNode(child);
    }
  }
  return output;
}

/**
 * Serializes a list item (`<li>`) taking into account nested lists, tasklist checkboxes, and indentation.
 */
function serializeListItem(
  li: HTMLElement,
  isOrdered: boolean,
  indentLevel: number,
  index: number = 1
): string {
  const indent = '  '.repeat(indentLevel);
  let prefix = isOrdered ? `${index}. ` : '- ';

  // Check if this is a task list checkbox item
  const checkbox = li.querySelector(':scope > input[type="checkbox"]');
  if (checkbox || li.classList.contains('task-list-item')) {
    const isChecked = (checkbox as HTMLInputElement)?.checked || checkbox?.hasAttribute('checked');
    prefix = isOrdered
      ? `${index}. [${isChecked ? 'x' : ' '}] `
      : `- [${isChecked ? 'x' : ' '}] `;
  }

  let textContent = '';
  let nestedLists = '';

  for (let i = 0; i < li.childNodes.length; i++) {
    const child = li.childNodes[i];
    if (!child) continue;

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      const childTag = childEl.tagName.toUpperCase();

      // Skip checkbox input element itself from inner text
      if (childTag === 'INPUT' && (childEl as HTMLInputElement).type === 'checkbox') {
        continue;
      }

      if (childTag === 'UL' || childTag === 'OL') {
        nestedLists += walkNode(childEl, indentLevel + 1);
        continue;
      }
    }

    textContent += walkNode(child);
  }

  const cleanText = textContent.replace(/\n+$/, '').trim();
  let result = `${indent}${prefix}${cleanText}\n`;
  if (nestedLists) {
    result += nestedLists;
  }
  return result;
}

/**
 * Serializes a standard HTML `<table>` element into GitHub-Flavored Markdown table syntax.
 */
function serializeTable(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableMatrix: string[][] = [];
  const alignments: ('left' | 'center' | 'right' | null)[] = [];

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const rowValues: string[] = [];

    cells.forEach((cell, colIndex) => {
      const cellText = serializeChildren(cell as HTMLElement).replace(/\n+/g, ' ').trim();
      rowValues.push(cellText);

      // Detect alignment from header row
      if (rowIndex === 0) {
        const align = cell.getAttribute('align') || (cell as HTMLElement).style.textAlign;
        if (align === 'center') alignments[colIndex] = 'center';
        else if (align === 'right') alignments[colIndex] = 'right';
        else alignments[colIndex] = 'left';
      }
    });

    tableMatrix.push(rowValues);
  });

  if (tableMatrix.length === 0 || !tableMatrix[0]) return '';

  // Determine maximum column widths
  const numCols = Math.max(...tableMatrix.map((r) => r.length));
  const colWidths: number[] = new Array(numCols).fill(3);

  tableMatrix.forEach((row) => {
    row.forEach((cell, idx) => {
      if (cell.length > (colWidths[idx] || 0)) {
        colWidths[idx] = cell.length;
      }
    });
  });

  let md = '';

  // 1. Header row
  const headerRow = tableMatrix[0];
  md += '|';
  for (let i = 0; i < numCols; i++) {
    const val = (headerRow[i] || '').padEnd(colWidths[i] || 3, ' ');
    md += ` ${val} |`;
  }
  md += '\n';

  // 2. Delimiter row with alignment
  md += '|';
  for (let i = 0; i < numCols; i++) {
    const width = Math.max(3, colWidths[i] || 3);
    const align = alignments[i] || 'left';
    if (align === 'center') {
      md += ` :${'-'.repeat(width - 2)}: |`;
    } else if (align === 'right') {
      md += ` ${'-'.repeat(width - 1)}: |`;
    } else {
      md += ` ${'-'.repeat(width)} |`;
    }
  }
  md += '\n';

  // 3. Body rows
  for (let r = 1; r < tableMatrix.length; r++) {
    const row = tableMatrix[r];
    if (!row) continue;
    md += '|';
    for (let c = 0; c < numCols; c++) {
      const val = (row[c] || '').padEnd(colWidths[c] || 3, ' ');
      md += ` ${val} |`;
    }
    md += '\n';
  }

  return `${md}\n`;
}
