// Zero-dependency rich text formatting engine for the WYSIWYG canvas
// Handles inline styles, block transformations, list toggles, and shortcut dispatch

export interface ActiveFormatState {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
  math: boolean;
  color: string | null;
  glow: 'none' | 'soft' | 'neon';
  highlight: boolean;
  kbd: boolean;
  subscript: boolean;
  superscript: boolean;
  heading: number | null; // 1 to 6 or null for paragraph
  bulletList: boolean;
  numberedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  alertType: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION' | null;
  alignment: 'left' | 'center' | 'right' | null;
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
    math: false,
    color: null,
    glow: 'none',
    highlight: false,
    kbd: false,
    subscript: false,
    superscript: false,
    heading: null,
    bulletList: false,
    numberedList: false,
    taskList: false,
    blockquote: false,
    codeBlock: false,
    alertType: null,
    alignment: null,
  };

  if (!selection || selection.rangeCount === 0) {
    return state;
  }

  // Check document command states for basic inline tags
  try {
    state.bold = document.queryCommandState('bold');
    state.italic = document.queryCommandState('italic');
    state.strikethrough = document.queryCommandState('strikeThrough');
    state.subscript = document.queryCommandState('subscript');
    state.superscript = document.queryCommandState('superscript');
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
      if (el.classList.contains('math') || el.hasAttribute('data-tex') || el.classList.contains('katex')) state.math = true;
      if (tag === 'MARK') state.highlight = true;
      if (tag === 'KBD') state.kbd = true;
      if (tag === 'SUB') state.subscript = true;
      if (tag === 'SUP') state.superscript = true;
      if (tag === 'BLOCKQUOTE' && !el.classList.contains('markdown-alert')) state.blockquote = true;
      if (tag === 'PRE') state.codeBlock = true;

      // Color and Glow
      if (el.style.color) {
        state.color = el.style.color;
      }
      if (el.style.textShadow) {
        if (el.style.textShadow.includes('12px') || el.style.textShadow.includes('20px')) {
          state.glow = 'neon';
        } else if (el.style.textShadow !== 'none') {
          state.glow = 'soft';
        }
      }

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

      // Check for GitHub Alerts
      if (el.classList.contains('markdown-alert')) {
        if (el.classList.contains('markdown-alert-note')) state.alertType = 'NOTE';
        else if (el.classList.contains('markdown-alert-tip')) state.alertType = 'TIP';
        else if (el.classList.contains('markdown-alert-important')) state.alertType = 'IMPORTANT';
        else if (el.classList.contains('markdown-alert-warning')) state.alertType = 'WARNING';
        else if (el.classList.contains('markdown-alert-caution')) state.alertType = 'CAUTION';
      }

      // Check for alignment
      const alignAttr = el.getAttribute('align');
      const textAlign = el.style.textAlign;
      if (alignAttr === 'center' || textAlign === 'center') state.alignment = 'center';
      else if (alignAttr === 'right' || textAlign === 'right') state.alignment = 'right';
      else if (alignAttr === 'left' || textAlign === 'left') state.alignment = 'left';
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
 * Returns the active math element under cursor/selection if present.
 */
export function getCurrentMathNode(canvas: HTMLElement): { el: HTMLElement; tex: string; isDisplay: boolean } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('math') || el.hasAttribute('data-tex') || el.classList.contains('katex') || el.classList.contains('katex-display')) {
        const mathContainer = (el.closest('[data-tex], .math') as HTMLElement) || el;
        const tex = mathContainer.getAttribute('data-tex') || mathContainer.textContent || '';
        const isDisplay = mathContainer.classList.contains('math-display') || mathContainer.classList.contains('katex-display') || mathContainer.tagName.toUpperCase() === 'DIV';
        return { el: mathContainer, tex, isDisplay };
      }
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Applies, updates, or removes a LaTeX mathematical formula at the active selection.
 */
export function applyMath(tex: string | null, isDisplay: boolean = false, canvas?: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const currentMath = canvas ? getCurrentMathNode(canvas) : null;

  // Case 1: Removing Math
  if (!tex || tex.trim() === '') {
    if (currentMath) {
      const textNode = document.createTextNode(currentMath.tex);
      currentMath.el.parentNode?.replaceChild(textNode, currentMath.el);
    }
    return;
  }

  const cleanTex = tex.trim();

  // Case 2: Updating existing math element
  if (currentMath) {
    currentMath.el.setAttribute('data-tex', cleanTex);
    currentMath.el.className = `math ${isDisplay ? 'math-display' : 'math-inline'}`;
    const winKatex = (window as unknown as { katex?: { render: (t: string, e: HTMLElement, opt?: unknown) => void } }).katex;
    if (winKatex) {
      try {
        winKatex.render(cleanTex, currentMath.el, { displayMode: isDisplay, throwOnError: false });
      } catch {
        currentMath.el.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
      }
    } else {
      currentMath.el.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
    }
    return;
  }

  // Case 3: Inserting new math formula at selection
  const range = selection.getRangeAt(0);
  range.deleteContents();

  const mathEl = document.createElement(isDisplay ? 'div' : 'span');
  mathEl.className = `math ${isDisplay ? 'math-display' : 'math-inline'}`;
  mathEl.setAttribute('data-tex', cleanTex);

  const winKatex = (window as unknown as { katex?: { render: (t: string, e: HTMLElement, opt?: unknown) => void } }).katex;
  if (winKatex) {
    try {
      winKatex.render(cleanTex, mathEl, { displayMode: isDisplay, throwOnError: false });
    } catch {
      mathEl.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
    }
  } else {
    mathEl.textContent = isDisplay ? `$$${cleanTex}$$` : `$${cleanTex}$`;
  }

  range.insertNode(mathEl);

  // Position cursor immediately after the math element
  const afterRange = document.createRange();
  afterRange.setStartAfter(mathEl);
  afterRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(afterRange);
}

/**
 * Applies custom text color and optional neon glow intensity.
 */
export function applyTextColorAndGlow(
  color: string | null,
  glowLevel: 'none' | 'soft' | 'neon' = 'none',
  canvas?: HTMLElement
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // Check if selection is already inside a colored span
  let spanEl: HTMLElement | null = null;
  if (canvas) {
    let node: Node | null = selection.anchorNode;
    while (node && node !== canvas) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'SPAN') {
        const el = node as HTMLElement;
        if (el.style.color || el.style.textShadow || el.classList.contains('colored-text')) {
          spanEl = el;
          break;
        }
      }
      node = node.parentNode;
    }
  }

  // Case 1: Resetting Color / Glow
  if (!color) {
    if (spanEl) {
      spanEl.style.color = '';
      spanEl.style.textShadow = '';
      spanEl.classList.remove('colored-text');
      if (!spanEl.getAttribute('style')?.trim()) {
        const parent = spanEl.parentNode;
        if (parent) {
          while (spanEl.firstChild) {
            parent.insertBefore(spanEl.firstChild, spanEl);
          }
          parent.removeChild(spanEl);
        }
      }
    }
    return;
  }

  // Calculate text-shadow glow
  let shadow = 'none';
  if (glowLevel === 'soft') {
    shadow = `0 0 8px ${color}99`;
  } else if (glowLevel === 'neon') {
    shadow = `0 0 12px ${color}, 0 0 22px ${color}88`;
  }

  if (spanEl) {
    spanEl.style.color = color;
    spanEl.style.textShadow = shadow;
    spanEl.classList.add('colored-text');
  } else if (!range.collapsed) {
    const selectedContent = range.extractContents();
    const span = document.createElement('span');
    span.className = 'colored-text';
    span.style.color = color;
    span.style.textShadow = shadow;
    span.appendChild(selectedContent);
    range.insertNode(span);

    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

/**
 * Applies a translucent marker highlight (`<mark>`) to the selected text.
 */
export function applyHighlight(color: string | null, canvas?: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // Check if selection is already inside a mark tag
  let markEl: HTMLElement | null = null;
  if (canvas) {
    let node: Node | null = selection.anchorNode;
    while (node && node !== canvas) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'MARK') {
        markEl = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }
  }

  if (!color) {
    // Remove mark
    if (markEl) {
      const parent = markEl.parentNode;
      if (parent) {
        while (markEl.firstChild) {
          parent.insertBefore(markEl.firstChild, markEl);
        }
        parent.removeChild(markEl);
      }
    }
    return;
  }

  if (markEl) {
    markEl.style.backgroundColor = color;
  } else if (!range.collapsed) {
    const selectedContent = range.extractContents();
    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.appendChild(selectedContent);
    range.insertNode(mark);

    const newRange = document.createRange();
    newRange.selectNodeContents(mark);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

/**
 * Toggles a keycap badge (`<kbd>...</kbd>`) on selection.
 */
export function toggleKbd(canvas: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  let kbdEl: HTMLElement | null = null;
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'KBD') {
      kbdEl = node as HTMLElement;
      break;
    }
    node = node.parentNode;
  }

  if (kbdEl) {
    const parent = kbdEl.parentNode;
    if (parent) {
      while (kbdEl.firstChild) {
        parent.insertBefore(kbdEl.firstChild, kbdEl);
      }
      parent.removeChild(kbdEl);
    }
  } else if (!range.collapsed) {
    const selectedContent = range.extractContents();
    const kbd = document.createElement('kbd');
    kbd.appendChild(selectedContent);
    range.insertNode(kbd);

    const newRange = document.createRange();
    newRange.selectNodeContents(kbd);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

/**
 * Toggles subscript formatting (`<sub>...</sub>`).
 */
export function toggleSubscript(): void {
  document.execCommand('subscript', false);
}

/**
 * Toggles superscript formatting (`<sup>...</sup>`).
 */
export function toggleSuperscript(): void {
  document.execCommand('superscript', false);
}

/**
 * Applies or toggles a GitHub Alert callout box (`[!NOTE]`, `[!WARNING]`, etc.).
 */
export function applyGitHubAlert(
  alertType: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION' | null,
  canvas: HTMLElement
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // Find nearest block container
  let blockEl: HTMLElement | null = null;
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === 'P' || tag === 'BLOCKQUOTE' || el.classList.contains('markdown-alert') || /^H[1-6]$/.test(tag)) {
        blockEl = el;
        break;
      }
    }
    node = node.parentNode;
  }

  if (!blockEl) return;

  // If removing alert
  if (!alertType) {
    if (blockEl.classList.contains('markdown-alert')) {
      const titleEl = blockEl.querySelector('.markdown-alert-title');
      titleEl?.remove();
      const p = document.createElement('p');
      p.innerHTML = blockEl.innerHTML;
      blockEl.parentNode?.replaceChild(p, blockEl);
    }
    return;
  }

  const typeLower = alertType.toLowerCase();
  const alertTitle = alertType.charAt(0) + alertType.slice(1).toLowerCase();

  // If already an alert, change its type
  if (blockEl.classList.contains('markdown-alert')) {
    blockEl.className = `markdown-alert markdown-alert-${typeLower}`;
    const titleEl = blockEl.querySelector('.markdown-alert-title');
    if (titleEl) {
      titleEl.textContent = alertTitle;
    }
    return;
  }

  // Create new alert container
  const alertContainer = document.createElement('div');
  alertContainer.className = `markdown-alert markdown-alert-${typeLower}`;

  const titlePara = document.createElement('p');
  titlePara.className = 'markdown-alert-title';
  titlePara.textContent = alertTitle;

  const contentPara = document.createElement('p');
  contentPara.innerHTML = blockEl.innerHTML;

  alertContainer.appendChild(titlePara);
  alertContainer.appendChild(contentPara);

  blockEl.parentNode?.replaceChild(alertContainer, blockEl);
}

/**
 * Inserts an interactive collapsible details / spoiler accordion (`<details><summary>`).
 */
export function insertDetailsSpoiler(title: string = 'Click to expand'): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.extractContents();

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = title;

  const bodyPara = document.createElement('p');
  if (selectedText.textContent?.trim()) {
    bodyPara.appendChild(selectedText);
  } else {
    bodyPara.textContent = 'Hidden details content goes here...';
  }

  details.appendChild(summary);
  details.appendChild(bodyPara);

  range.insertNode(details);

  // Position cursor inside bodyPara
  const afterRange = document.createRange();
  afterRange.selectNodeContents(bodyPara);
  afterRange.collapse(false);
  selection.removeAllRanges();
  selection.addRange(afterRange);
}

/**
 * Applies horizontal text alignment (`left`, `center`, `right`).
 */
export function applyAlignment(align: 'left' | 'center' | 'right', canvas: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  let blockEl: HTMLElement | null = null;
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === 'P' || tag === 'DIV' || /^H[1-6]$/.test(tag) || tag === 'BLOCKQUOTE') {
        blockEl = el;
        break;
      }
    }
    node = node.parentNode;
  }

  if (blockEl) {
    if (align === 'left') {
      blockEl.style.textAlign = '';
      blockEl.removeAttribute('align');
    } else {
      blockEl.style.textAlign = align;
      blockEl.setAttribute('align', align);
    }
  }
}

/**
 * Removes all inline formatting (bold, italic, strike, code, link, color, glow, highlight, kbd) from selection.
 */
export function clearFormatting(): void {
  document.execCommand('removeFormat', false);
  document.execCommand('unlink', false);

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  // Also remove code, mark, kbd, sub, sup, colored spans within range
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const elements = container.nodeType === Node.ELEMENT_NODE
    ? (container as HTMLElement).querySelectorAll('code, mark, s, del, kbd, sub, sup, span.colored-text, span[style]')
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

  const state = getActiveFormatState(canvas);
  if (state.taskList) {
    document.execCommand('insertUnorderedList', false);
    return;
  }

  // Convert to unordered list first
  document.execCommand('insertUnorderedList', false);

  // Find the list and add tasklist classes + checkbox
  let node: Node | null = selection.anchorNode;
  while (node && node !== canvas) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'UL') {
      const ul = node as HTMLUListElement;
      ul.classList.add('contains-task-list');

      const lis = ul.querySelectorAll('li');
      lis.forEach((li) => {
        if (!li.querySelector('input[type="checkbox"]')) {
          li.classList.add('task-list-item');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'task-list-item-checkbox';
          cb.addEventListener('change', () => {
            if (cb.checked) {
              cb.setAttribute('checked', 'checked');
            } else {
              cb.removeAttribute('checked');
            }
            canvas.dispatchEvent(new Event('input', { bubbles: true }));
          });
          li.insertBefore(cb, li.firstChild);
        }
      });
      break;
    }
    node = node.parentNode;
  }
}

/**
 * Toggles a blockquote wrapper for the current block.
 */
export function toggleBlockquote(canvas: HTMLElement): void {
  const state = getActiveFormatState(canvas);
  if (state.blockquote) {
    document.execCommand('formatBlock', false, '<p>');
  } else {
    document.execCommand('formatBlock', false, '<blockquote>');
  }
}

/**
 * Inserts a fenced code block (`<pre><code>...</code></pre>`).
 */
export function insertCodeBlock(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.extractContents().textContent || 'code';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = selectedText;
  pre.appendChild(code);

  range.insertNode(pre);

  // Place selection inside code block
  const newRange = document.createRange();
  newRange.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(newRange);
}

/**
 * Inserts a horizontal thematic divider (`<hr>`).
 */
export function insertHorizontalRule(): void {
  document.execCommand('insertHorizontalRule', false);
}

export interface MediaInsertOptions {
  src: string;
  mediaType?: 'image' | 'video' | 'audio' | undefined;
  alt?: string | undefined;
  caption?: string | undefined;
  width?: string | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
}

/**
 * Inserts a structured HTML5 media container (`<figure class="media-wrapper">...<figcaption>...</figcaption></figure>`)
 * into the WYSIWYG canvas at the active selection or cursor position.
 *
 * @param options - Media source URI, type (image/video/audio), caption, width, and alignment.
 * @param canvas - The contenteditable canvas root element.
 * @returns The newly created and inserted figure HTMLElement.
 */
export function insertMediaNode(options: MediaInsertOptions, canvas: HTMLElement): HTMLElement {
  const selection = window.getSelection();
  let range: Range | null = null;

  if (selection && selection.rangeCount > 0) {
    const r = selection.getRangeAt(0);
    if (canvas.contains(r.commonAncestorContainer)) {
      range = r;
    }
  }

  // Fallback: If no valid selection inside canvas, append at the end of canvas
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(canvas);
    range.collapse(false);
  }

  // Determine media category if not explicitly provided
  let mediaType = options.mediaType;
  if (!mediaType) {
    const cleanSrc = options.src.toLowerCase();
    if (cleanSrc.startsWith('data:video/') || /\.(mp4|webm|mov|mkv|avi)(\?.*)?$/i.test(cleanSrc)) {
      mediaType = 'video';
    } else if (cleanSrc.startsWith('data:audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)(\?.*)?$/i.test(cleanSrc)) {
      mediaType = 'audio';
    } else {
      mediaType = 'image';
    }
  }

  // 1. Create outer figure container
  const figure = document.createElement('figure');
  figure.className = 'media-wrapper';
  figure.setAttribute('contenteditable', 'false');

  const align = options.align || 'center';
  figure.setAttribute('align', align);

  // 2. Create the inner HTML5 media element
  let mediaEl: HTMLElement;
  const width = options.width || '100%';

  if (mediaType === 'video') {
    const video = document.createElement('video');
    video.src = options.src;
    video.controls = true;
    video.style.width = width;
    mediaEl = video;
  } else if (mediaType === 'audio') {
    const audio = document.createElement('audio');
    audio.src = options.src;
    audio.controls = true;
    audio.style.width = width;
    mediaEl = audio;
  } else {
    // Image / GIF / SVG
    const img = document.createElement('img');
    img.src = options.src;
    img.alt = options.alt || options.caption || '';
    img.style.width = width;
    mediaEl = img;
  }

  figure.appendChild(mediaEl);

  // 3. Create optional or placeholder caption
  if (options.caption !== undefined) {
    const captionEl = document.createElement('figcaption');
    captionEl.setAttribute('contenteditable', 'true');
    captionEl.textContent = options.caption;
    figure.appendChild(captionEl);
  }

  // 4. Insert into the DOM
  range.deleteContents();
  range.insertNode(figure);

  // 5. Ensure an editable empty paragraph follows the media so the writer can keep typing
  let nextEl = figure.nextSibling;
  if (!nextEl || (nextEl.nodeType === Node.ELEMENT_NODE && (nextEl as HTMLElement).tagName.toUpperCase() === 'FIGURE')) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    figure.parentNode?.insertBefore(p, figure.nextSibling);
    nextEl = p;
  }

  // Move cursor into the following paragraph
  const newRange = document.createRange();
  newRange.setStart(nextEl, 0);
  newRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(newRange);

  // Notify canvas of document modification
  canvas.dispatchEvent(new Event('input', { bubbles: true }));

  return figure;
}

/**
 * Updates properties (width, alignment, caption) of an existing media element (figure, img, video, audio).
 */
export function updateMediaNode(
  el: HTMLElement,
  updates: { width?: string; align?: 'left' | 'center' | 'right'; caption?: string }
): void {
  const isFigure = el.tagName.toUpperCase() === 'FIGURE';
  const mediaEl = isFigure ? el.querySelector<HTMLElement>('img, video, audio') : el;

  if (updates.width && mediaEl) {
    let widthVal = updates.width.trim();
    if (widthVal.toLowerCase() === 'auto') {
      mediaEl.style.width = '';
      mediaEl.removeAttribute('width');
      if (isFigure) {
        el.style.width = '';
      }
    } else {
      if (/^\d+$/.test(widthVal)) {
        widthVal = `${widthVal}%`;
      }
      mediaEl.style.width = widthVal;
      if (isFigure) {
        el.style.width = widthVal;
      }
      if (mediaEl.tagName.toUpperCase() === 'IMG') {
        if (widthVal.endsWith('px')) {
          mediaEl.setAttribute('width', widthVal.replace('px', ''));
        } else {
          mediaEl.setAttribute('width', widthVal);
        }
      }
    }
  }

  if (updates.align) {
    if (isFigure) {
      el.setAttribute('align', updates.align);
      el.style.textAlign = updates.align;
    } else {
      // Find the closest block container (<p> or <div>) so the entire row aligns accurately
      const blockContainer = el.closest('p, div, figure') as HTMLElement | null;
      if (blockContainer) {
        blockContainer.setAttribute('align', updates.align);
        blockContainer.style.textAlign = updates.align;
      } else {
        el.setAttribute('align', updates.align);
      }
    }
  }

  if (updates.caption !== undefined && isFigure) {
    let captionEl = el.querySelector<HTMLElement>('figcaption');
    if (!captionEl) {
      captionEl = document.createElement('figcaption');
      captionEl.setAttribute('contenteditable', 'true');
      el.appendChild(captionEl);
    }
    captionEl.textContent = updates.caption;
  }
}


/**
 * Removes a media container or element from the canvas DOM.
 */
export function removeMediaNode(el: HTMLElement): void {
  const parent = el.parentNode;
  if (parent) {
    parent.removeChild(el);
  }
}

