// Floating toolbar controller for Dybuk Two-Row WYSIWYG Editor
// Manages mini trigger, double-row bubble menu, popovers (Link, Math, Color, Glow, Highlight), and submenus

import {
  applyAlignment,
  applyGitHubAlert,
  applyHeading,
  applyHighlight,
  applyLink,
  applyMath,
  applyTextColorAndGlow,
  clearFormatting,
  getActiveFormatState,
  getCurrentMathNode,
  insertCodeBlock,
  insertDetailsSpoiler,
  insertHorizontalRule,
  insertMediaNode,
  removeMediaNode,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleKbd,
  toggleNumberedList,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
  toggleTaskList,
  updateMediaNode,
} from './formatter.js';
import { invokeIpc } from '../../shared/ipc.js';

export class FloatingToolbar {
  private canvas: HTMLElement;
  private triggerEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;

  // Submenus and Popovers
  private headingMenuEl: HTMLElement | null = null;
  private alertMenuEl: HTMLElement | null = null;
  private alignMenuEl: HTMLElement | null = null;
  private linkPopoverEl: HTMLElement | null = null;
  private linkInputEl: HTMLInputElement | null = null;
  private mathPopoverEl: HTMLElement | null = null;
  private mathInputEl: HTMLInputElement | null = null;
  private mathPreviewEl: HTMLElement | null = null;
  private mathDisplayToggleEl: HTMLElement | null = null;
  private colorPopoverEl: HTMLElement | null = null;
  private highlightPopoverEl: HTMLElement | null = null;
  private mediaPopoverEl: HTMLElement | null = null;
  private mediaTabLocalBtn: HTMLElement | null = null;
  private mediaTabUrlBtn: HTMLElement | null = null;
  private mediaPaneLocalEl: HTMLElement | null = null;
  private mediaPaneUrlEl: HTMLElement | null = null;
  private mediaDropzoneEl: HTMLElement | null = null;
  private mediaBrowseBtn: HTMLElement | null = null;
  private mediaFileStatusEl: HTMLElement | null = null;
  private mediaUrlInputEl: HTMLInputElement | null = null;
  private mediaCaptionInputEl: HTMLInputElement | null = null;
  private canvasMediaToolbarEl: HTMLElement | null = null;
  private activeMediaFigure: HTMLElement | null = null;

  // State
  private isToolbarExpanded = false;
  private isMathDisplayMode = false;
  private selectedColor: string | null = null;
  private selectedGlow: 'none' | 'soft' | 'neon' = 'none';
  private selectedMediaTab: 'local' | 'url' = 'local';
  private selectedMediaSize: string = '100%';
  private selectedMediaAlign: 'left' | 'center' | 'right' = 'center';
  private selectedLocalMediaPayload: { data_url: string; is_video: boolean; is_audio: boolean; file_name: string } | null = null;
  private savedRange: Range | null = null;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    this.initElements();
    this.setupListeners();
  }

  /**
   * Initializes references to floating trigger, toolbar, submenus, and popovers.
   */
  private initElements(): void {
    this.triggerEl = document.getElementById('floating-trigger');
    this.toolbarEl = document.getElementById('floating-toolbar');

    this.headingMenuEl = document.getElementById('toolbar-heading-menu');
    this.alertMenuEl = document.getElementById('toolbar-alert-menu');
    this.alignMenuEl = document.getElementById('toolbar-align-menu');

    this.linkPopoverEl = document.getElementById('toolbar-link-popover');
    this.linkInputEl = document.getElementById('toolbar-link-input') as HTMLInputElement | null;

    this.mathPopoverEl = document.getElementById('toolbar-math-popover');
    this.mathInputEl = document.getElementById('toolbar-math-input') as HTMLInputElement | null;
    this.mathPreviewEl = document.getElementById('toolbar-math-preview');
    this.mathDisplayToggleEl = document.getElementById('tb-math-display-toggle');

    this.colorPopoverEl = document.getElementById('toolbar-color-popover');
    this.highlightPopoverEl = document.getElementById('toolbar-highlight-popover');

    this.mediaPopoverEl = document.getElementById('toolbar-media-popover');
    this.mediaTabLocalBtn = document.getElementById('tb-media-tab-local');
    this.mediaTabUrlBtn = document.getElementById('tb-media-tab-url');
    this.mediaPaneLocalEl = document.getElementById('tb-media-pane-local');
    this.mediaPaneUrlEl = document.getElementById('tb-media-pane-url');
    this.mediaDropzoneEl = document.getElementById('tb-media-dropzone');
    this.mediaBrowseBtn = document.getElementById('tb-media-browse-btn');
    this.mediaFileStatusEl = document.getElementById('tb-media-file-status');
    this.mediaUrlInputEl = document.getElementById('toolbar-media-url-input') as HTMLInputElement | null;
    this.mediaCaptionInputEl = document.getElementById('toolbar-media-caption-input') as HTMLInputElement | null;
    this.canvasMediaToolbarEl = document.getElementById('canvas-media-toolbar');
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

    // Clicking on math formula in canvas opens math popover for instant editing
    this.canvas.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const mathEl = target.closest('.math, [data-tex]') as HTMLElement | null;
      if (mathEl && this.canvas.contains(mathEl)) {
        const range = document.createRange();
        range.selectNode(mathEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        this.savedRange = range.cloneRange();
        this.expandToolbar();
        this.openMathPopover();
      }
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

    // Wire individual formatting action buttons & popovers
    this.setupActionButtons();
    this.setupHeadingSubmenu();
    this.setupAlertSubmenu();
    this.setupAlignSubmenu();
    this.setupLinkPopover();
    this.setupMediaPopover();
    this.setupMathPopover();
    this.setupColorPopover();
    this.setupHighlightPopover();
    this.setupCanvasMediaToolbar();
    this.setupCanvasKeyShortcuts();
  }

  /**
   * Evaluates selection state and shows/hides mini trigger or full toolbar.
   */
  private handleSelectionChange(): void {
    const selection = window.getSelection();

    // If focus is inside input popover, don't close toolbar
    if (
      document.activeElement === this.linkInputEl ||
      document.activeElement === this.mathInputEl ||
      document.activeElement === this.mediaUrlInputEl ||
      document.activeElement === this.mediaCaptionInputEl
    ) {
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

    const triggerWidth = 32;
    const triggerHeight = 28;
    let left = rect.right - 10;
    let top = rect.top - triggerHeight - 8;

    // Viewport clamping
    left = Math.max(10, Math.min(window.innerWidth - triggerWidth - 10, left));
    if (top < 40) {
      top = rect.bottom + 8;
    }

    this.triggerEl.style.left = `${left}px`;
    this.triggerEl.style.top = `${top}px`;
    this.triggerEl.classList.add('visible');
  }

  /**
   * Expands the full double-row floating formatting toolbar.
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

    const toolbarWidth = toolbarRect.width || 440;
    const toolbarHeight = toolbarRect.height || 74;

    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    let top = rect.top - toolbarHeight - 12;

    // Viewport clamping
    left = Math.max(12, Math.min(window.innerWidth - toolbarWidth - 12, left));
    if (top < 45) {
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

    // Row 1: Inline
    this.setBtnActive('tb-btn-bold', state.bold);
    this.setBtnActive('tb-btn-italic', state.italic);
    this.setBtnActive('tb-btn-strike', state.strikethrough);
    this.setBtnActive('tb-btn-code', state.code);
    this.setBtnActive('tb-btn-link', state.link);
    this.setBtnActive('tb-btn-math', state.math);
    this.setBtnActive('tb-btn-color', state.color !== null || state.glow !== 'none');
    this.setBtnActive('tb-btn-highlight', state.highlight);
    this.setBtnActive('tb-btn-kbd', state.kbd);
    this.setBtnActive('tb-btn-sub', state.subscript);
    this.setBtnActive('tb-btn-sup', state.superscript);

    // Row 2: Blocks & Structure
    this.setBtnActive('tb-btn-bullet', state.bulletList);
    this.setBtnActive('tb-btn-numbered', state.numberedList);
    this.setBtnActive('tb-btn-task', state.taskList);
    this.setBtnActive('tb-btn-quote', state.blockquote);
    this.setBtnActive('tb-btn-alert', state.alertType !== null);
    this.setBtnActive('tb-btn-codeblock', state.codeBlock);
    this.setBtnActive('tb-btn-align', state.alignment !== null);

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
    // Row 1: Inline Actions
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

    document.getElementById('tb-btn-kbd')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleKbd(this.canvas);
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-sub')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleSubscript();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-sup')?.addEventListener('click', () => {
      this.restoreSelection();
      toggleSuperscript();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-clear')?.addEventListener('click', () => {
      this.restoreSelection();
      clearFormatting();
      this.syncActiveStates();
    });

    // Row 2: Block Actions
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
      insertCodeBlock();
      this.syncActiveStates();
    });

    document.getElementById('tb-btn-media')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.mediaPopoverEl);
      if (this.mediaPopoverEl?.classList.contains('open')) {
        this.mediaPopoverEl.classList.remove('open');
      } else {
        this.openMediaPopover();
      }
    });

    document.getElementById('tb-btn-details')?.addEventListener('click', () => {
      this.restoreSelection();
      insertDetailsSpoiler();
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
      this.closeAllSubmenus(this.headingMenuEl);
      this.headingMenuEl?.classList.toggle('open');
    });

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
   * Configures GitHub Alert Callout Dropdown.
   */
  private setupAlertSubmenu(): void {
    const alertBtn = document.getElementById('tb-btn-alert');
    if (!alertBtn || !this.alertMenuEl) return;

    alertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.alertMenuEl);
      this.alertMenuEl?.classList.toggle('open');
    });

    document.querySelectorAll<HTMLElement>('.tb-alert-option').forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const alertType = option.dataset.alert as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION' | undefined;
        this.alertMenuEl?.classList.remove('open');
        this.restoreSelection();
        if (alertType) {
          applyGitHubAlert(alertType, this.canvas);
        }
        this.syncActiveStates();
      });
    });
  }

  /**
   * Configures Text Alignment Dropdown.
   */
  private setupAlignSubmenu(): void {
    const alignBtn = document.getElementById('tb-btn-align');
    if (!alignBtn || !this.alignMenuEl) return;

    alignBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.alignMenuEl);
      this.alignMenuEl?.classList.toggle('open');
    });

    document.querySelectorAll<HTMLElement>('.tb-align-option').forEach((option) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const align = option.dataset.align as 'left' | 'center' | 'right' | undefined;
        this.alignMenuEl?.classList.remove('open');
        this.restoreSelection();
        if (align) {
          applyAlignment(align, this.canvas);
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
      this.closeAllSubmenus(this.linkPopoverEl);

      if (this.linkPopoverEl?.classList.contains('open')) {
        this.linkPopoverEl.classList.remove('open');
      } else {
        this.openLinkPopover();
      }
    });

    applyBtn?.addEventListener('click', () => {
      const url = this.linkInputEl?.value.trim() || '';
      this.restoreSelection();
      applyLink(url);
      this.linkPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });

    removeBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyLink(null);
      this.linkPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });

    this.linkInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyBtn?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.linkPopoverEl?.classList.remove('open');
      }
    });
  }

  private openLinkPopover(): void {
    if (!this.linkPopoverEl) return;
    this.closeAllSubmenus(this.linkPopoverEl);
    this.linkPopoverEl.classList.add('open');

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

  /**
   * Configures LaTeX Math Popover with live KaTeX preview.
   */
  private setupMathPopover(): void {
    const mathBtn = document.getElementById('tb-btn-math');
    const applyBtn = document.getElementById('tb-math-apply');
    const removeBtn = document.getElementById('tb-math-remove');

    mathBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.mathPopoverEl);

      if (this.mathPopoverEl?.classList.contains('open')) {
        this.mathPopoverEl.classList.remove('open');
      } else {
        this.openMathPopover();
      }
    });

    const updatePreview = () => {
      const formula = this.mathInputEl?.value.trim() || '';
      if (!this.mathPreviewEl) return;

      if (!formula) {
        this.mathPreviewEl.innerHTML = '';
        return;
      }

      const winKatex = (window as unknown as { katex?: { render: (t: string, e: HTMLElement, opt?: unknown) => void } }).katex;
      if (winKatex) {
        try {
          winKatex.render(formula, this.mathPreviewEl, { displayMode: this.isMathDisplayMode, throwOnError: false });
        } catch {
          this.mathPreviewEl.textContent = formula;
        }
      } else {
        this.mathPreviewEl.textContent = formula;
      }
    };

    this.mathInputEl?.addEventListener('input', updatePreview);

    this.mathDisplayToggleEl?.addEventListener('click', () => {
      this.isMathDisplayMode = !this.isMathDisplayMode;
      this.mathDisplayToggleEl?.classList.toggle('active', this.isMathDisplayMode);
      updatePreview();
    });

    applyBtn?.addEventListener('click', () => {
      const formula = this.mathInputEl?.value.trim() || '';
      this.restoreSelection();
      applyMath(formula, this.isMathDisplayMode, this.canvas);
      this.mathPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });

    removeBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyMath(null, false, this.canvas);
      this.mathPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });

    this.mathInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyBtn?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.mathPopoverEl?.classList.remove('open');
      }
    });
  }

  private openMathPopover(): void {
    if (!this.mathPopoverEl) return;
    this.closeAllSubmenus(this.mathPopoverEl);
    this.mathPopoverEl.classList.add('open');

    const mathNode = getCurrentMathNode(this.canvas);
    let formula = '';
    if (mathNode) {
      formula = mathNode.tex;
      this.isMathDisplayMode = mathNode.isDisplay;
    } else {
      const selection = window.getSelection();
      if (selection) {
        formula = selection.toString().trim();
      }
    }

    this.mathDisplayToggleEl?.classList.toggle('active', this.isMathDisplayMode);
    if (this.mathInputEl) {
      this.mathInputEl.value = formula;
      setTimeout(() => this.mathInputEl?.focus(), 50);
    }

    if (this.mathPreviewEl && formula) {
      const winKatex = (window as unknown as { katex?: { render: (t: string, e: HTMLElement, opt?: unknown) => void } }).katex;
      if (winKatex) {
        try {
          winKatex.render(formula, this.mathPreviewEl, { displayMode: this.isMathDisplayMode, throwOnError: false });
        } catch {
          this.mathPreviewEl.textContent = formula;
        }
      } else {
        this.mathPreviewEl.textContent = formula;
      }
    } else if (this.mathPreviewEl) {
      this.mathPreviewEl.innerHTML = '';
    }
  }

  /**
   * Configures Text Color & Neon Glow Popover.
   */
  private setupColorPopover(): void {
    const colorBtn = document.getElementById('tb-btn-color');
    const applyBtn = document.getElementById('tb-color-apply');
    const resetBtn = document.getElementById('tb-color-reset');

    colorBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.colorPopoverEl);
      this.colorPopoverEl?.classList.toggle('open');
    });

    // Swatch selection
    document.querySelectorAll<HTMLElement>('.color-swatch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedColor = btn.dataset.color || null;
      });
    });

    // Glow selection
    document.querySelectorAll<HTMLElement>('.glow-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.glow-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedGlow = (btn.dataset.glow as 'none' | 'soft' | 'neon') || 'none';
      });
    });

    applyBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyTextColorAndGlow(this.selectedColor, this.selectedGlow, this.canvas);
      this.colorPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });

    resetBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyTextColorAndGlow(null, 'none', this.canvas);
      this.colorPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });
  }

  /**
   * Configures Highlighter Marker Popover.
   */
  private setupHighlightPopover(): void {
    const hlBtn = document.getElementById('tb-btn-highlight');
    const resetBtn = document.getElementById('tb-highlight-reset');

    hlBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAllSubmenus(this.highlightPopoverEl);
      this.highlightPopoverEl?.classList.toggle('open');
    });

    document.querySelectorAll<HTMLElement>('.highlight-chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        const color = chip.dataset.highlight || null;
        this.restoreSelection();
        applyHighlight(color, this.canvas);
        this.highlightPopoverEl?.classList.remove('open');
        this.syncActiveStates();
      });
    });

    resetBtn?.addEventListener('click', () => {
      this.restoreSelection();
      applyHighlight(null, this.canvas);
      this.highlightPopoverEl?.classList.remove('open');
      this.syncActiveStates();
    });
  }

  /**
   * Configures Media Insertion Popover (Local File, Web URL, Dragzone, Size, Alignment).
   */
  private setupMediaPopover(): void {
    if (!this.mediaPopoverEl) return;

    // 1. Tab switching: Local File vs Web URL
    this.mediaTabLocalBtn?.addEventListener('click', () => {
      this.selectedMediaTab = 'local';
      this.mediaTabLocalBtn?.classList.add('active');
      this.mediaTabUrlBtn?.classList.remove('active');
      if (this.mediaPaneLocalEl) this.mediaPaneLocalEl.style.display = 'flex';
      if (this.mediaPaneUrlEl) this.mediaPaneUrlEl.style.display = 'none';
    });

    this.mediaTabUrlBtn?.addEventListener('click', () => {
      this.selectedMediaTab = 'url';
      this.mediaTabUrlBtn?.classList.add('active');
      this.mediaTabLocalBtn?.classList.remove('active');
      if (this.mediaPaneUrlEl) this.mediaPaneUrlEl.style.display = 'flex';
      if (this.mediaPaneLocalEl) this.mediaPaneLocalEl.style.display = 'none';
      setTimeout(() => this.mediaUrlInputEl?.focus(), 50);
    });

    // 2. Browse Computer button -> Triggers Tauri native file dialog
    this.mediaBrowseBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const filePath = await invokeIpc<string | null>('select_media_dialog');
        if (filePath) {
          const payload = await invokeIpc<{
            data_url: string;
            mime_type: string;
            file_name: string;
            size_bytes: number;
            is_video: boolean;
            is_audio: boolean;
          }>('read_media_file_base64', { path: filePath });

          if (payload) {
            this.selectedLocalMediaPayload = payload;
            if (this.mediaFileStatusEl) {
              const sizeMb = (payload.size_bytes / (1024 * 1024)).toFixed(1);
              this.mediaFileStatusEl.textContent = `Selected: ${payload.file_name} (${sizeMb} MB)`;
              this.mediaFileStatusEl.style.display = 'block';
            }
          }
        }
      } catch (err) {
        console.error('Failed to select/read media file:', err);
        alert(`Failed to load media file: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // 3. Dropzone inside popover
    this.mediaDropzoneEl?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mediaDropzoneEl?.classList.add('dragover');
    });

    this.mediaDropzoneEl?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mediaDropzoneEl?.classList.remove('dragover');
    });

    this.mediaDropzoneEl?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mediaDropzoneEl?.classList.remove('dragover');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file) {
          this.processDroppedFileInPopover(file);
        }
      }
    });

    // 4. Width size selector pills
    document.querySelectorAll<HTMLElement>('.media-size-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.media-size-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMediaSize = btn.dataset.size || '100%';
      });
    });

    // 5. Alignment selector pills
    document.querySelectorAll<HTMLElement>('.media-align-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.media-align-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMediaAlign = (btn.dataset.align as 'left' | 'center' | 'right') || 'center';
      });
    });

    // 6. Insert Media button action
    document.getElementById('tb-media-apply')?.addEventListener('click', () => {
      let src = '';
      let isVideo = false;
      let isAudio = false;

      if (this.selectedMediaTab === 'local') {
        if (!this.selectedLocalMediaPayload) {
          alert('Please choose or drop a media file first.');
          return;
        }
        src = this.selectedLocalMediaPayload.data_url;
        isVideo = this.selectedLocalMediaPayload.is_video;
        isAudio = this.selectedLocalMediaPayload.is_audio;
      } else {
        src = this.mediaUrlInputEl?.value.trim() || '';
        if (!src) {
          alert('Please enter a valid media URL.');
          return;
        }
      }

      const caption = this.mediaCaptionInputEl?.value.trim();
      this.restoreSelection();

      let mediaType: 'image' | 'video' | 'audio' = 'image';
      if (isVideo) mediaType = 'video';
      else if (isAudio) mediaType = 'audio';

      insertMediaNode(
        {
          src,
          mediaType,
          caption: caption || undefined,
          alt: caption || undefined,
          width: this.selectedMediaSize,
          align: this.selectedMediaAlign,
        },
        this.canvas
      );

      this.mediaPopoverEl?.classList.remove('open');
      this.hideAll();
    });

    // 7. Cancel button action
    document.getElementById('tb-media-cancel')?.addEventListener('click', () => {
      this.mediaPopoverEl?.classList.remove('open');
    });
  }

  private processDroppedFileInPopover(file: File): void {
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(`File "${file.name}" exceeds the 50 MB safety threshold.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');

      this.selectedLocalMediaPayload = {
        data_url: dataUrl,
        file_name: file.name,
        is_video: isVideo,
        is_audio: isAudio,
      };

      if (this.mediaFileStatusEl) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        this.mediaFileStatusEl.textContent = `Selected: ${file.name} (${sizeMb} MB)`;
        this.mediaFileStatusEl.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }

  private openMediaPopover(): void {
    if (!this.mediaPopoverEl) return;
    this.closeAllSubmenus(this.mediaPopoverEl);
    this.mediaPopoverEl.classList.add('open');

    // Reset fields
    this.selectedLocalMediaPayload = null;
    if (this.mediaFileStatusEl) {
      this.mediaFileStatusEl.style.display = 'none';
      this.mediaFileStatusEl.textContent = '';
    }
    if (this.mediaUrlInputEl) this.mediaUrlInputEl.value = '';
    if (this.mediaCaptionInputEl) this.mediaCaptionInputEl.value = '';
  }

  /**
   * Configures in-canvas contextual media bubble toolbar (Resizing, Alignment, Delete).
   */
  private setupCanvasMediaToolbar(): void {
    if (!this.canvasMediaToolbarEl) return;

    // Prevent mousedown on media toolbar from collapsing canvas selection
    this.canvasMediaToolbarEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    // Size and Align button actions
    this.canvasMediaToolbarEl.querySelectorAll<HTMLElement>('.media-tb-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.activeMediaFigure) return;

        const action = btn.dataset.action;
        const val = btn.dataset.value;

        if (action === 'size' && val) {
          updateMediaNode(this.activeMediaFigure, { width: val });
          this.syncCanvasMediaToolbarActiveStates(this.activeMediaFigure);
          this.canvas.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (action === 'align' && (val === 'left' || val === 'center' || val === 'right')) {
          updateMediaNode(this.activeMediaFigure, { align: val });
          this.syncCanvasMediaToolbarActiveStates(this.activeMediaFigure);
          this.canvas.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Delete button
    document.getElementById('media-tb-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.activeMediaFigure) {
        removeMediaNode(this.activeMediaFigure);
        this.hideCanvasMediaToolbar();
        this.canvas.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Reposition on scroll / resize
    const scrollPane = document.getElementById('editor-scroll-pane');
    scrollPane?.addEventListener('scroll', () => {
      if (this.activeMediaFigure) {
        this.updateCanvasMediaToolbarPosition(this.activeMediaFigure);
      }
    });
  }

  /**
   * Shows the in-canvas floating media toolbar above a selected media figure.
   */
  public showCanvasMediaToolbar(figure: HTMLElement): void {
    this.activeMediaFigure = figure;

    // Remove selection outline from other media
    this.canvas.querySelectorAll('.media-wrapper').forEach((f) => f.classList.remove('selected'));
    figure.classList.add('selected');

    if (this.canvasMediaToolbarEl) {
      this.canvasMediaToolbarEl.classList.add('visible');
      this.updateCanvasMediaToolbarPosition(figure);
      this.syncCanvasMediaToolbarActiveStates(figure);
    }
  }

  /**
   * Hides the in-canvas floating media toolbar.
   */
  public hideCanvasMediaToolbar(): void {
    if (this.activeMediaFigure) {
      this.activeMediaFigure.classList.remove('selected');
      this.activeMediaFigure = null;
    }
    this.canvasMediaToolbarEl?.classList.remove('visible');
  }

  private updateCanvasMediaToolbarPosition(figure: HTMLElement): void {
    if (!this.canvasMediaToolbarEl) return;

    const rect = figure.getBoundingClientRect();
    const tbRect = this.canvasMediaToolbarEl.getBoundingClientRect();
    const tbWidth = tbRect.width || 280;
    const tbHeight = tbRect.height || 36;

    let left = rect.left + rect.width / 2 - tbWidth / 2;
    let top = rect.top - tbHeight - 8;

    left = Math.max(10, Math.min(window.innerWidth - tbWidth - 10, left));
    if (top < 45) {
      top = rect.bottom + 8;
    }

    this.canvasMediaToolbarEl.style.left = `${left}px`;
    this.canvasMediaToolbarEl.style.top = `${top}px`;
  }

  private syncCanvasMediaToolbarActiveStates(figure: HTMLElement): void {
    if (!this.canvasMediaToolbarEl) return;

    const mediaEl = figure.querySelector<HTMLElement>('img, video, audio');
    const currentWidth = mediaEl?.style.width || '100%';
    const currentAlign = figure.getAttribute('align') || 'center';

    this.canvasMediaToolbarEl.querySelectorAll<HTMLElement>('.media-tb-btn').forEach((btn) => {
      const action = btn.dataset.action;
      const val = btn.dataset.value;

      if (action === 'size') {
        btn.classList.toggle('active', val === currentWidth);
      } else if (action === 'align') {
        btn.classList.toggle('active', val === currentAlign);
      }
    });
  }

  private closeAllSubmenus(except?: HTMLElement | null): void {
    const menus = [
      this.headingMenuEl,
      this.alertMenuEl,
      this.alignMenuEl,
      this.linkPopoverEl,
      this.mediaPopoverEl,
      this.mathPopoverEl,
      this.colorPopoverEl,
      this.highlightPopoverEl,
    ];

    menus.forEach((menu) => {
      if (menu && menu !== except) {
        menu.classList.remove('open');
      }
    });
  }

  /**
   * Handles keyboard shortcuts inside the editor canvas.
   */
  private setupCanvasKeyShortcuts(): void {
    this.canvas.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b' || e.key === 'B') {
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
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.expandToolbar();
          this.openMathPopover();
        } else if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
          e.preventDefault();
          this.expandToolbar();
          this.closeAllSubmenus(this.colorPopoverEl);
          this.colorPopoverEl?.classList.toggle('open');
        } else if (e.shiftKey && (e.key === 'h' || e.key === 'H')) {
          e.preventDefault();
          this.expandToolbar();
          this.closeAllSubmenus(this.highlightPopoverEl);
          this.highlightPopoverEl?.classList.toggle('open');
        } else if (e.key === ',') {
          e.preventDefault();
          toggleSubscript();
          this.syncActiveStates();
        } else if (e.key === '.') {
          e.preventDefault();
          toggleSuperscript();
          this.syncActiveStates();
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
    this.closeAllSubmenus();
    this.hideCanvasMediaToolbar();
  }
}

