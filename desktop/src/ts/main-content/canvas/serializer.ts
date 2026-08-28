// Bidirectional serialization between WYSIWYG DOM and GitHub-Flavored Markdown (GFM)
// Compiles Markdown -> HTML via Rust pulldown-cmark backend, and DOM -> Markdown via pure-TS walker

import { renderMarkdownIpc } from '../markdown/ipc.js';

/**
 * Compiles a raw Markdown string into structured semantic HTML via the Rust backend
 * and populates the given canvas container.
 *
 * @param markdown - Raw Markdown source string.
 * @param container - The contenteditable canvas HTMLElement.
 */
export async function markdownToDom(markdown: string, container: HTMLElement): Promise<void> {
  if (!markdown || markdown.trim().length === 0) {
    container.innerHTML = '<p><br></p>';
    return;
  }

  // Compile via Rust pulldown-cmark engine
  const html = await renderMarkdownIpc(markdown);
  container.innerHTML = html;

  // Post-process tasklist checkboxes to make them interactive in the editor
  const checkboxes = container.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox, li.task-list-item > input[type="checkbox"]');
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
      const content = serializeChildren(el).trim();
      return content ? `${content}\n\n` : '';
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
      // If parent is PRE, handled by PRE handler
      if (el.parentElement?.tagName.toUpperCase() === 'PRE') {
        return el.textContent || '';
      }
      const codeText = el.textContent || '';
      return `\`${codeText}\``;
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

    case 'IMG': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    }

    case 'TABLE':
      return serializeTable(el as HTMLTableElement);

    case 'BR':
      return '\n';

    case 'DIV':
    case 'SECTION':
    case 'ARTICLE': {
      const inner = serializeChildren(el);
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

      // Skip the checkbox itself from inner text
      if (childTag === 'INPUT' && (childEl as HTMLInputElement).type === 'checkbox') {
        continue;
      }

      if (childTag === 'UL' || childTag === 'OL') {
        nestedLists += walkNode(childEl, indentLevel + 1);
        continue;
      }
    }
    textContent += walkNode(child, indentLevel);
  }

  const cleanText = textContent.trim();
  let itemOutput = `${indent}${prefix}${cleanText}\n`;
  if (nestedLists) {
    itemOutput += nestedLists;
  }

  return itemOutput;
}

/**
 * Serializes an HTML `<table>` into clean GitHub-Flavored Markdown table syntax.
 */
function serializeTable(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  let tableMd = '';
  const headerRow = rows[0];
  if (!headerRow) return '';
  const headerCells = Array.from(headerRow.querySelectorAll('th, td'));

  if (headerCells.length === 0) return '';

  // Header row
  const headers = headerCells.map((c) => serializeChildren(c as HTMLElement).trim());
  tableMd += `| ${headers.join(' | ')} |\n`;

  // Delimiter row
  const delimiters = headerCells.map((c) => {
    const cellEl = c as HTMLElement;
    const align = (cellEl.getAttribute('align') || cellEl.style.textAlign || '').toLowerCase();
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    return '---';
  });
  tableMd += `| ${delimiters.join(' | ')} |\n`;

  // Body rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = Array.from(row.querySelectorAll('td, th'));
    const rowValues = cells.map((c) => serializeChildren(c as HTMLElement).trim());
    // Pad row with empty cells if fewer than header
    while (rowValues.length < headers.length) {
      rowValues.push('');
    }
    tableMd += `| ${rowValues.join(' | ')} |\n`;
  }

  return `${tableMd}\n`;
}

