// Floating toolbar and mini trigger controller for WYSIWYG Canvas
// Provides interactive two-stage bubble toolbar (••• -> expanded menu)

import {
  applyHeading,
  applyLink,
  clearFormatting,
  getActiveFormatState,
  insertCodeBlock,
  insertHorizontalRule,
  toggleBlockquote,
  toggleBold,
  toggleItalic,
  toggleBulletList,
  toggleInlineCode,
  toggleNumberedList,
  toggleStrikethrough,
  toggleTaskList,
} from './formatter.js';

export class FloatingToolbar {
  private canvas: HTMLElement;
  private triggerEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private headingMenuEl: HTMLElement | null = null;
  private linkPopoverEl: HTMLElement | null = null;
  private linkInputEl: HTMLInputElement | null = null;

  private isToolbarExpanded = false;
  private savedRange: Range | null = null;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    this.initElements();
    this.setupListeners();
  }

  /**
   * Initializes references to floating trigger, toolbar, and submenus.
   */
  private initElements(): void {
    this.triggerEl = document.getElementById('floating-trigger');
    this.toolbarEl = document.getElementById('floating-toolbar');
    this.headingMenuEl = document.getElementById('toolbar-heading-menu');
    this.linkPopoverEl = document.getElementById('toolbar-link-popover');
    this.linkInputEl = document.getElementById('toolbar-link-input') as HTMLInputElement | null;
  }

  /**
   * Wires selection, mouse, and keyboard listeners for toolbar positioning and actions.
   */
  private setupListeners(): void {
    // Selection change tracking inside canvas
    document.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });

    // Dismiss or adjust on window resize / scroll
    window.addEventListener('resize', () => {
      if (this.isToolbarExpanded) {
        this.updateToolbarPosition();
      } else {
        this.updateTriggerPosition();
      }
    });

    const scrollPane = document.getElementById('editor-scroll-pane');
    scrollPane?.addEventListener('scroll', () => {
      if (this.isToolbarExpanded) {
        this.updateToolbarPosition();
      } else {
        this.updateTriggerPosition();
      }
    });

    // Mini trigger button click -> Expand to full toolbar
    this.triggerEl?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.expandToolbar();
    });

    // Prevent mousedown on toolbar buttons from deselecting text in canvas
    [this.triggerEl, this.toolbarEl].forEach((el) => {
      el?.addEventListener('mousedown', (e) => {
        // If clicking inside input element, allow standard focus
        if ((e.target as HTMLElement).tagName.toUpperCase() === 'INPUT') {
          return;
        }
        e.preventDefault();
      });
    });

    // Wire individual formatting action buttons
    this.setupActionButtons();
    this.setupHeadingSubmenu();
    this.setupLinkPopover();
    this.setupCanvasKeyShortcuts();
  }

  /**
   * Evaluates selection state and shows/hides mini trigger or full toolbar.
   */
  private handleSelectionChange(): void {
    const selection = window.getSelection();

    // If focus is inside the link input popover, don't close the toolbar
    if (document.activeElement === this.linkInputEl) {
      return;
    }

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      // No active text selection -> hide floating elements
      this.hideAll();
      return;
    }

    const range = selection.getRangeAt(0);

    // Ensure selection is strictly inside the editor canvas
    if (!this.canvas.contains(range.commonAncestorContainer)) {
      this.hideAll();
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      this.hideAll();
      return;
    }

    // Cache the active range
    this.savedRange = range.cloneRange();

    if (this.isToolbarExpanded) {
      this.updateToolbarPosition();
      this.syncActiveStates();
    } else {
      this.showTrigger();
    }
  }

  /**
   * Shows and positions the mini floating trigger button (•••) near the selection.
   */
  private showTrigger(): void {
    if (!this.triggerEl || !this.savedRange) return;

    const rect = this.savedRange.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.hideAll();
      return;
    }

    // Position trigger slightly above and centered/to the right of the selection
    const triggerWidth = 32;
    const triggerHeight = 28;
    let left = rect.right - 10;
    let top = rect.top - triggerHeight - 8;

    // Viewport clamping
    left = Math.max(10, Math.min(window.innerWidth - triggerWidth - 10, left));
    if (top < 40) {
      // If too close to top bar, place below selection
      top = rect.bottom + 8;
    }

    this.triggerEl.style.left = `${left}px`;
    this.triggerEl.style.top = `${top}px`;
    this.triggerEl.classList.add('visible');
  }

  /**
   * Expands the full floating formatting toolbar.
   */
  public expandToolbar(): void {
    this.isToolbarExpanded = true;
    if (this.triggerEl) {
      this.triggerEl.classList.remove('visible');
    }

    if (this.toolbarEl) {
      this.toolbarEl.classList.add('visible');
      this.updateToolbarPosition();
      this.syncActiveStates();
    }
  }

  /**
   * Positions the full floating toolbar centered above the selection.
   */
  private updateToolbarPosition(): void {
    if (!this.toolbarEl || !this.savedRange) return;

    const rect = this.savedRange.getBoundingClientRect();
    const toolbarRect = this.toolbarEl.getBoundingClientRect();

    const toolbarWidth = toolbarRect.width || 420;
    const toolbarHeight = toolbarRect.height || 40;

    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    let top = rect.top - toolbarHeight - 12;

    // Viewport clamping
    left = Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, left));
    if (top < 45) {
      // Place below selection if top is clipped by header
      top = rect.bottom + 12;
    }

    this.toolbarEl.style.left = `${left}px`;
    this.toolbarEl.style.top = `${top}px`;
  }

  private updateTriggerPosition(): void {
    if (this.triggerEl?.classList.contains('visible')) {
      this.showTrigger();
    }
  }

  /**
   * Synchronizes active state badges and button highlights with the DOM under cursor.
   */
  public syncActiveStates(): void {
    const state = getActiveFormatState(this.canvas);

    this.setBtnActive('tb-btn-bold', state.bold);
    this.setBtnActive('tb-btn-italic', state.italic);
    this.setBtnActive('tb-btn-strike', state.strikethrough);
    this.setBtnActive('tb-btn-code', state.code);
    this.setBtnActive('tb-btn-link', state.link);
    this.setBtnActive('tb-btn-bullet', state.bulletList);
    this.setBtnActive('tb-btn-numbered', state.numberedList);
    this.setBtnActive('tb-btn-task', state.taskList);
    this.setBtnActive('tb-btn-quote', state.blockquote);
    this.setBtnActive('tb-btn-codeblock', state.codeBlock);

    // Update Heading Dropdown label
    const headingBtn = document.getElementById('tb-btn-heading');
    const headingLabel = document.getElementById('tb-heading-label');
    if (headingLabel) {
      headingLabel.textContent = state.heading ? `H${state.heading}` : 'Text';
    }
    if (headingBtn) {
      headingBtn.classList.toggle('active', state.heading !== null);
    }
  }

  private setBtnActive(btnId: string, isActive: boolean): void {
    const btn = document.getElementById(btnId);
    btn?.classList.toggle('active', isActive);
  }

  /**
   * Restores text selection range in canvas before executing commands.
   */
  private restoreSelection(): void {
    if (!this.savedRange) return;
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(this.savedRange);
    }
  }

  /**
   * Wires individual formatting button click actions.
   */
  private setupActionButtons(): void {
    // Inline Styles
    document.getElementById('tb-btn-bold')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleBold();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-italic')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleItalic();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-strike')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleStrikethrough();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-code')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleInlineCode(this.canvas);
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-clear')?.addEventListener('click', () => {
      this.restoreSelection();
      clearFormatting(this.canvas);
      this.syncActiveStates();
    });

    // Block Styles
    document.getElementById('tb-btn-bullet')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleBulletList();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-numbered')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleNumberedList();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-task')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleTaskList(this.canvas);
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-quote')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleBlockquote(this.canvas);
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-codeblock')?.addEventListener('click', () => {
      this.restoreSelection();
      insertCodeBlock(this.canvas);
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-hr')?.addEventListener('click', () => {
      this.restoreSelection();
      insertHorizontalRule();
      this.syncActiveStates();
    });
  }

  /**
   * Configures H1 to H6 dropdown selection menu.
   */
  private setupHeadingSubmenu(): void {
    const headingBtn = document.getElementById('tb-btn-heading');
    if (!headingBtn || !this.headingMenuEl) return;

    headingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeLinkPopover();
      this.headingMenuEl?.classList.toggle('open');
    });

    // Wire dropdown options
    document.querySelectorAll<HTMLElement>('.tb-heading-option').forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const levelStr = option.dataset.level;
        this.headingMenuEl?.classList.remove('open');
        this.restoreSelection();

        if (levelStr === '0' || !levelStr) {
          document.execCommand('formatBlock', false, '<p>');
        } else {
          const level = parseInt(levelStr, 10) as 1 | 2 | 3 | 4 | 5 | 6;
          applyHeading(level, this.canvas);
        }

        this.syncActiveStates();
      });
    });
  }

  /**
   * Configures Link URL Popover.
   */
  private setupLinkPopover(): void {
    const linkBtn = document.getElementById('tb-btn-link');
    const applyBtn = document.getElementById('tb-link-apply');
    const removeBtn = document.getElementById('tb-link-remove');

    linkBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.headingMenuEl?.classList.remove('open');

      if (this.linkPopoverEl?.classList.contains('open')) {
        this.closeLinkPopover();
      } else {
        this.openLinkPopover();
      }
    });

    applyBtn?.addEventListener('click', () => {
      const url = this.linkInputEl?.value.trim() || '';
      this.restoreSelection();
      applyLink(url);
      this.closeLinkPopover();
      this.syncActiveStates();
    });

    removeBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyLink(null);
      this.closeLinkPopover();
      this.syncActiveStates();
    });

    this.linkInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyBtn?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeLinkPopover();
      }
    });
  }

  private openLinkPopover(): void {
    if (!this.linkPopoverEl) return;
    this.linkPopoverEl.classList.add('open');

    // Pre-populate URL if selection is already a link
    let existingUrl = '';
    const selection = window.getSelection();
    if (selection && selection.anchorNode) {
      let el: HTMLElement | null = selection.anchorNode.parentElement;
      while (el && el !== this.canvas) {
        if (el.tagName.toUpperCase() === 'A') {
          existingUrl = el.getAttribute('href') || '';
          break;
        }
        el = el.parentElement;
      }
    }

    if (this.linkInputEl) {
      this.linkInputEl.value = existingUrl;
      setTimeout(() => this.linkInputEl?.focus(), 50);
    }
  }

  private closeLinkPopover(): void {
    this.linkPopoverEl?.classList.remove('open');
  }

  /**
   * Handles keyboard shortcuts inside the editor canvas.
   */
  private setupCanvasKeyShortcuts(): void {
    this.canvas.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b' || e.key === 'B') {
          // Native bold handled by browser or intercepted
          setTimeout(() => this.syncActiveStates(), 10);
        } else if (e.key === 'i' || e.key === 'I') {
          setTimeout(() => this.syncActiveStates(), 10);
        } else if (e.shiftKey && (e.key === 'x' || e.key === 'X')) {
          e.preventDefault();
          toggleStrikethrough();
          this.syncActiveStates();
        } else if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          this.expandToolbar();
          this.openLinkPopover();
        } else if (e.key === '`') {
          e.preventDefault();
          toggleInlineCode(this.canvas);
          this.syncActiveStates();
        }
      } else if (e.key === 'Escape') {
        this.hideAll();
      }
    });
  }

  /**
   * Hides trigger, toolbar, and all submenus.
   */
  public hideAll(): void {
    this.isToolbarExpanded = false;
    this.triggerEl?.classList.remove('visible');
    this.toolbarEl?.classList.remove('visible');
    this.headingMenuEl?.classList.remove('open');
    this.closeLinkPopover();
  }
}
