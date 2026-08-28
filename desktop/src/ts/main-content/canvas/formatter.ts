// Zero-dependency rich text formatting engine for the WYSIWYG canvas
// Handles inline styles, block transformations, list toggles, and shortcut dispatch

export interface ActiveFormatState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
  heading: number | null; // 1 to 6 or null for paragraph
  bulletList: boolean;
  numberedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
}

/**
 * Checks the active formatting states at the current selection or cursor position.
 * Inspects both standard document command states and the DOM ancestor tree.
 */
export function getActiveFormatState(canvas: HTMLElement): ActiveFormatState {
  const selection = window.getSelection();
  const state: ActiveFormatState = {
    bold: false,
    italic: false,
    strikethrough: false,
    code: false,
    link: false,
    heading: null,
    bulletList: false,
    numberedList: false,
    taskList: false,
    blockquote: false,
    codeBlock: false,
  };

  if (!selection || selection.rangeCount === 0) {
    return state;
  }

  // Check document command states for basic inline tags
  try {
    state.bold = document.queryCommandState('bold');
    state.italic = document.queryCommandState('italic');
    state.strikethrough = document.queryCommandState('strikeThrough');
  } catch {
    // Ignore error in headless/unsupported test environments
  }

  // Inspect the DOM ancestor chain from the anchor node up to the canvas root
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();

      if (tag === 'STRONG' || tag === 'B') state.bold = true;
      if (tag === 'EM' || tag === 'I') state.italic = true;
      if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') state.strikethrough = true;
      if (tag === 'CODE' && el.parentElement?.tagName.toUpperCase() !== 'PRE') state.code = true;
      if (tag === 'A') state.link = true;
      if (tag === 'BLOCKQUOTE') state.blockquote = true;
      if (tag === 'PRE') state.codeBlock = true;

      // Check for Headings H1 to H6
      if (/^H[1-6]$/.test(tag)) {
        state.heading = parseInt(tag.charAt(1), 10);
      }

      // Check for lists
      if (tag === 'UL') {
        if (el.classList.contains('contains-task-list')) {
          state.taskList = true;
        } else {
          state.bulletList = true;
        }
      }
      if (tag === 'OL') {
        state.numberedList = true;
      }
      if (tag === 'LI' && el.classList.contains('task-list-item')) {
        state.taskList = true;
      }
    }
    node = node.parentNode;
  }

  return state;
}

/**
 * Toggles bold formatting on the current selection.
 */
export function toggleBold(): void {
  document.execCommand('bold', false);
}

/**
 * Toggles italic formatting on the current selection.
 */
export function toggleItalic(): void {
  document.execCommand('italic', false);
}

/**
 * Toggles strikethrough formatting on the current selection.
 */
export function toggleStrikethrough(): void {
  document.execCommand('strikeThrough', false);
}

/**
 * Toggles inline code formatting (`<code>...</code>`) on the current selection.
 */
export function toggleInlineCode(canvas: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // Check if we are already inside a code element
  let codeEl: HTMLElement | null = null;
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'CODE') {
      codeEl = node as HTMLElement;
      break;
    }
    node = node.parentNode;
  }

  if (codeEl) {
    // Unwrap code element
    const parent = codeEl.parentNode;
    if (parent) {
      while (codeEl.firstChild) {
        parent.insertBefore(codeEl.firstChild, codeEl);
      }
      parent.removeChild(codeEl);
    }
  } else if (!range.collapsed) {
    // Wrap selection in <code>
    const selectedText = range.extractContents();
    const code = document.createElement('code');
    code.appendChild(selectedText);
    range.insertNode(code);

    // Re-select newly created code node
    const newRange = document.createRange();
    newRange.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

/**
 * Applies or removes a hyperlink on the active selection.
 */
export function applyLink(url: string | null): void {
  if (!url || url.trim() === '') {
    document.execCommand('unlink', false);
    return;
  }

  // Ensure protocol is present
  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl) && !/^mailto:/i.test(formattedUrl) && !formattedUrl.startsWith('#')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  document.execCommand('createLink', false, formattedUrl);

  // Set target and rel on newly created links for security
  const selection = window.getSelection();
  if (selection && selection.anchorNode) {
    let parent: HTMLElement | null = selection.anchorNode.parentElement;
    while (parent && parent.tagName.toUpperCase() !== 'A') {
      parent = parent.parentElement;
    }
    if (parent && parent.tagName.toUpperCase() === 'A') {
      parent.setAttribute('target', '_blank');
      parent.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

/**
 * Removes all inline formatting (bold, italic, strike, code, link) from selection.
 */
export function clearFormatting(_canvas?: HTMLElement): void {
  document.execCommand('removeFormat', false);
  document.execCommand('unlink', false);

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // Also remove code or mark tags within range if present
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const elements = container.nodeType === Node.ELEMENT_NODE
    ? (container as HTMLElement).querySelectorAll('code, mark, s, del')
    : [];

  elements.forEach((el) => {
    if (selection.containsNode(el, true)) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      }
    }
  });
}

/**
 * Transforms the current block into a Heading (H1 to H6) or back to a Paragraph.
 */
export function applyHeading(level: 1 | 2 | 3 | 4 | 5 | 6, canvas: HTMLElement): void {
  const active = getActiveFormatState(canvas);

  if (active.heading === level) {
    // Already this heading level -> revert to normal paragraph
    document.execCommand('formatBlock', false, '<p>');
  } else {
    document.execCommand('formatBlock', false, `<h${level}>`);
  }
}

/**
 * Toggles an unordered (bullet) list for the current block.
 */
export function toggleBulletList(): void {
  document.execCommand('insertUnorderedList', false);
}

/**
 * Toggles an ordered (numbered) list for the current block.
 */
export function toggleNumberedList(): void {
  document.execCommand('insertOrderedList', false);
}

/**
 * Toggles a GitHub-Flavored task list with interactive checkbox for the current block.
 */
export function toggleTaskList(canvas: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // First convert to unordered list if not already in a list
  const active = getActiveFormatState(canvas);
  if (!active.bulletList && !active.taskList) {
    document.execCommand('insertUnorderedList', false);
  }

  // Find parent UL and LI
  let node: Node | null = selection.anchorNode;
  let liEl: HTMLLIElement | null = null;
  let ulEl: HTMLUListElement | null = null;

  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName.toUpperCase() === 'LI' && !liEl) {
        liEl = el as HTMLLIElement;
      }
      if (el.tagName.toUpperCase() === 'UL' && !ulEl) {
        ulEl = el as HTMLUListElement;
      }
    }
    node = node.parentNode;
  }

  if (ulEl && liEl) {
    const isTask = liEl.classList.contains('task-list-item');
    if (isTask) {
      // Revert from task list to normal list item
      liEl.classList.remove('task-list-item');
      const checkbox = liEl.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.remove();

      // If no other task items in UL, remove container class
      if (!ulEl.querySelector('.task-list-item')) {
        ulEl.classList.remove('contains-task-list');
      }
    } else {
      // Convert to task list item
      ulEl.classList.add('contains-task-list');
      liEl.classList.add('task-list-item');

      // Prepend checkbox if not already present
      if (!liEl.querySelector('input[type="checkbox"]')) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-list-item-checkbox';
        liEl.insertBefore(checkbox, liEl.firstChild);
      }
    }
  }
}

/**
 * Toggles a blockquote wrapper for the current block.
 */
export function toggleBlockquote(canvas: HTMLElement): void {
  const active = getActiveFormatState(canvas);
  if (active.blockquote) {
    document.execCommand('formatBlock', false, '<p>');
  } else {
    document.execCommand('formatBlock', false, '<blockquote>');
  }
}

/**
 * Inserts a fenced code block with optional syntax language.
 */
export function insertCodeBlock(_canvas?: HTMLElement, language: string = ''): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString() || 'code here';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (language) {
    code.className = `language-${language.trim()}`;
  }
  code.textContent = selectedText;
  pre.appendChild(code);

  range.deleteContents();
  range.insertNode(pre);

  // Position cursor inside code block
  const newRange = document.createRange();
  newRange.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(newRange);
}

/**
 * Inserts a horizontal rule divider at the cursor.
 */
export function insertHorizontalRule(): void {
  document.execCommand('insertHorizontalRule', false);
}
