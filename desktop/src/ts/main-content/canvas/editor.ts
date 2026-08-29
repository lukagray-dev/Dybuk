// Document editor WYSIWYG canvas, disk watcher subscriber, and topbar controller for Dybuk
// Manages pulldown-cmark compilation on open, real-time hot-reloading on disk changes,
// floating toolbar lifecycle, and clean GFM serialization on save

import { invokeIpc, listenIpcEvent } from '../../shared/ipc.js';
import { appState } from '../../shared/state.js';
import { lockVaultIpc, readDocumentIpc, saveDocumentIpc } from '../ipc.js';
import { showUnlockVaultDialog } from '../unlock-dialog.js';
import { FloatingToolbar } from './floating-toolbar.js';
import { insertMediaNode } from './formatter.js';
import { domToMarkdown, markdownToDom } from './serializer.js';

interface ExternalChangePayload {
  path: string;
  content: string;
  is_dybuk: boolean;
}

let activePassword = '';
let floatingToolbar: FloatingToolbar | null = null;

export function initEditor(): void {
  const canvas = document.getElementById('editor-canvas');
  if (canvas) {
    floatingToolbar = new FloatingToolbar(canvas);
  }

  setupEditorInputs();
  setupEditorActions();
  setupKeyboardShortcuts();
  setupAppStateSubscriber();
  setupDiskWatcherSubscriber();
  setupMediaDragDropAndPaste();
  setupCanvasMediaInteraction();
}

/**
 * Initializes canvas input listeners, dirty tracking, and stats.
 */
function setupEditorInputs(): void {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;

  canvas.addEventListener('input', () => {
    // Mark active document as dirty (has unsaved modifications)
    const doc = appState.getCurrentDoc();
    if (!doc.isDirty) {
      appState.setCurrentDoc({ isDirty: true });
    }

    updateStats();
  });
}

/**
 * Configures clipboard paste (Ctrl+V) and direct drag & drop for media files.
 */
function setupMediaDragDropAndPaste(): void {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;

  // 1. Clipboard Paste (Ctrl+V) for screenshots, copied images, and media files
  canvas.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && (item.type.startsWith('image/') || item.type.startsWith('video/') || item.type.startsWith('audio/'))) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processMediaFileInsertion(file, canvas);
        }
        return;
      }
    }

    // For standard text paste, update stats
    setTimeout(() => {
      updateStats();
      const doc = appState.getCurrentDoc();
      if (!doc.isDirty) {
        appState.setCurrentDoc({ isDirty: true });
      }
    }, 10);
  });

  // 2. Drag & Drop directly onto the editor canvas
  canvas.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
  });

  canvas.addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    let hasMedia = false;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        file &&
        (file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/') ||
          /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|avif|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac)$/i.test(file.name))
      ) {
        hasMedia = true;
        break;
      }
    }

    if (!hasMedia) return;

    e.preventDefault();

    // Position insertion caret at drop coordinates
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) {
        processMediaFileInsertion(file, canvas);
      }
    }
  });
}

/**
 * Reads and validates a dropped or pasted media file (enforcing the 50 MB threshold)
 * and inserts it into the canvas as a Base64 data node.
 */
function processMediaFileInsertion(file: File, canvas: HTMLElement): void {
  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    alert(`Media file "${file.name}" exceeds the 50 MB safety threshold.`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    let mediaType: 'image' | 'video' | 'audio' = 'image';
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name)) {
      mediaType = 'video';
    } else if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(file.name)) {
      mediaType = 'audio';
    }

    insertMediaNode(
      {
        src: dataUrl,
        mediaType,
        alt: file.name,
        width: '100%',
        align: 'center',
      },
      canvas
    );

    const doc = appState.getCurrentDoc();
    if (!doc.isDirty) {
      appState.setCurrentDoc({ isDirty: true });
    }
    updateStats();
  };
  reader.readAsDataURL(file);
}

/**
 * Sets up in-canvas clicking on media and diagram elements to display
 * their respective contextual floating toolbars.
 */
function setupCanvasMediaInteraction(): void {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Check for Mermaid diagram card click
    const diagramCard = target.closest('.mermaid-diagram-card') as HTMLElement | null;
    if (diagramCard && canvas.contains(diagramCard)) {
      floatingToolbar?.showCanvasDiagramToolbar(diagramCard);
      floatingToolbar?.hideCanvasMediaToolbar();
      return;
    } else if (!target.closest('#canvas-diagram-toolbar') && !target.closest('#diagram-edit-modal')) {
      floatingToolbar?.hideCanvasDiagramToolbar();
    }

    // Check for media element click
    const mediaEl = target.closest('img, video, audio, figure.media-wrapper') as HTMLElement | null;
    if (mediaEl && canvas.contains(mediaEl)) {
      floatingToolbar?.showCanvasMediaToolbar(mediaEl);
    } else if (!target.closest('#canvas-media-toolbar')) {
      floatingToolbar?.hideCanvasMediaToolbar();
    }
  });
}




/**
 * Sets up topbar action buttons (e.g. Lock vault).
 */
function setupEditorActions(): void {
  const btnLock = document.getElementById('topbar-btn-lock');

  btnLock?.addEventListener('click', async () => {
    await lockActiveDocument();
  });
}

/**
 * Sets up global editor keyboard shortcuts (Ctrl+S for save, Ctrl+L for lock).
 */
function setupKeyboardShortcuts(): void {
  window.addEventListener('keydown', async (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        await saveActiveDocument();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        await lockActiveDocument();
      }
    }
  });
}

/**
 * Subscribes to appState changes to synchronize the topbar UI elements.
 */
function setupAppStateSubscriber(): void {
  const titleEl = document.getElementById('topbar-doc-title');
  const typeBadge = document.getElementById('topbar-type-badge');
  const dirtyDot = document.getElementById('topbar-dirty-indicator');
  const btnLock = document.getElementById('topbar-btn-lock');
  const emptyState = document.getElementById('editor-empty-state');
  const scrollPane = document.getElementById('editor-scroll-pane');

  appState.subscribe(() => {
    const doc = appState.getCurrentDoc();

    if (titleEl) titleEl.textContent = doc.name;

    if (typeBadge) {
      typeBadge.textContent = doc.isDybuk ? 'Encrypted Vault' : 'Markdown';
      typeBadge.className = `topbar-type-badge ${doc.isDybuk ? 'dybuk' : ''}`;
    }

    if (dirtyDot) {
      dirtyDot.classList.toggle('visible', doc.isDirty);
    }

    if (btnLock) {
      btnLock.style.display = doc.isDybuk && doc.path ? 'inline-flex' : 'none';
    }

    const mainTopbar = document.getElementById('main-content-topbar');
    if (mainTopbar) {
      mainTopbar.style.display = doc.path ? 'flex' : 'none';
    }

    if (emptyState && scrollPane) {
      if (doc.path) {
        emptyState.style.display = 'none';
        scrollPane.style.display = 'flex';
      } else {
        emptyState.style.display = 'flex';
        scrollPane.style.display = 'none';
      }
    }
  });
}

/**
 * Shows the animated loading overlay spinner in the main content area.
 */
export function showDocumentLoading(text: string = 'Opening document...'): void {
  const overlay = document.getElementById('editor-loading-overlay');
  if (!overlay) return;
  const textEl = overlay.querySelector('.loading-overlay-text');
  if (textEl) {
    textEl.textContent = text;
  }
  overlay.style.display = 'flex';
}

/**
 * Hides the document loading overlay.
 */
export function hideDocumentLoading(): void {
  const overlay = document.getElementById('editor-loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Subscribes to Tauri filesystem events when the currently active document is modified on disk.
 * Automatically hot-reloads clean documents into the canvas without requiring manual reload.
 */
function setupDiskWatcherSubscriber(): void {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;

  listenIpcEvent<ExternalChangePayload>('active-document-changed-on-disk', async (payload) => {
    const doc = appState.getCurrentDoc();
    if (!doc.path) return;

    // Normalize paths to compare accurately across slash conventions
    const currentNorm = doc.path.replace(/\\/g, '/').toLowerCase();
    const payloadNorm = payload.path.replace(/\\/g, '/').toLowerCase();

    if (currentNorm !== payloadNorm && !currentNorm.endsWith(payloadNorm) && !payloadNorm.endsWith(currentNorm)) {
      return;
    }

    // If local document has no unsaved edits, hot-reload immediately
    if (!doc.isDirty) {
      console.debug(`[HotReload] Active file "${doc.name}" changed on disk. Re-rendering canvas.`);
      showDocumentLoading('Reloading document...');
      try {
        await markdownToDom(payload.content, canvas, doc.path);
        updateStats();
      } finally {
        hideDocumentLoading();
      }
    } else {
      console.warn(`[HotReload] Active file "${doc.name}" changed on disk, but local editor has unsaved changes. Preserving local edits.`);
      const dirtyDot = document.getElementById('topbar-dirty-indicator');
      if (dirtyDot) {
        dirtyDot.title = 'Document has unsaved local edits and changed on disk';
      }
    }
  }).catch((err) => {
    console.error('Failed to register disk watcher event listener:', err);
  });
}

/**
 * Opens a document into the WYSIWYG canvas.
 * Compiles raw markdown into semantic HTML using the Rust pulldown-cmark backend.
 * Shows an animated loading spinner overlay during heavy media and decryption processing.
 * Automatically starts watching the target file on disk for external hot-reloads.
 */
export async function openDocument(path: string, name: string, isDybuk: boolean): Promise<boolean> {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return false;

  showDocumentLoading(isDybuk ? 'Decrypting & loading vault...' : 'Loading document & media...');

  try {
    if (isDybuk) {
      // Attempt reading with session key or prompt password
      let content = '';
      let password = activePassword;

      try {
        const payload = await readDocumentIpc(path, password || undefined);
        content = payload.content;
      } catch {
        hideDocumentLoading();
        // Vault is locked -> Prompt user for passphrase
        const unlockResult = await showUnlockVaultDialog(path, name);
        if (!unlockResult) {
          return false;
        }
        showDocumentLoading('Decrypting & loading vault...');
        content = unlockResult.payload.content;
        activePassword = unlockResult.password;
      }

      // Compile Markdown to semantic HTML in canvas
      await markdownToDom(content, canvas, path);

      appState.setCurrentDoc({
        path,
        name,
        isDybuk: true,
        isDirty: false,
        isUnlocked: true,
      });

      // Start watching active file on disk
      try {
        await invokeIpc('watch_active_document', { path });
      } catch (watchErr) {
        console.warn('[Watcher] Failed to attach file watcher:', watchErr);
      }

      updateStats();
      canvas.focus();
      return true;
    } else {
      // Plain markdown document
      const payload = await readDocumentIpc(path);
      await markdownToDom(payload.content, canvas, path);

      activePassword = '';
      appState.setCurrentDoc({
        path,
        name,
        isDybuk: false,
        isDirty: false,
        isUnlocked: true,
      });

      // Start watching active file on disk
      try {
        await invokeIpc('watch_active_document', { path });
      } catch (watchErr) {
        console.warn('[Watcher] Failed to attach file watcher:', watchErr);
      }

      updateStats();
      canvas.focus();
      return true;
    }
  } catch (err) {
    console.error('Failed to read document:', err);
    alert(`Could not open document: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    hideDocumentLoading();
  }
}


/**
 * Saves the current active document to disk.
 * Serializes the formatted WYSIWYG canvas DOM back into clean GFM Markdown.
 */
export async function saveActiveDocument(): Promise<void> {
  const doc = appState.getCurrentDoc();
  const canvas = document.getElementById('editor-canvas');
  if (!doc.path || !canvas) return;

  try {
    // Serialize WYSIWYG DOM back to clean Markdown
    const markdown = domToMarkdown(canvas);
    await saveDocumentIpc(doc.path, markdown, doc.isDybuk ? activePassword : undefined);
    appState.setCurrentDoc({ isDirty: false });
  } catch (err) {
    console.error('Failed to save document:', err);
    alert(`Failed to save document: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Locks the current active vault, clears session key, unmounts watcher, and resets editor state.
 */
export async function lockActiveDocument(): Promise<void> {
  const doc = appState.getCurrentDoc();
  const canvas = document.getElementById('editor-canvas');
  if (!doc.path || !doc.isDybuk) return;

  try {
    // Stop file watcher
    await invokeIpc('unwatch_active_document');

    await lockVaultIpc(doc.path);
    activePassword = '';
    if (canvas) canvas.innerHTML = '';

    appState.setCurrentDoc({
      path: null,
      name: 'Untitled',
      isDybuk: false,
      isDirty: false,
      isUnlocked: false,
    });

    floatingToolbar?.hideAll();
  } catch (err) {
    console.error('Failed to lock vault:', err);
  }
}

/**
 * Calculates and updates word and character statistics in the topbar.
 */
function updateStats(): void {
  const canvas = document.getElementById('editor-canvas');
  const statsPill = document.getElementById('topbar-word-count');
  if (!canvas || !statsPill) return;

  const text = (canvas.innerText || canvas.textContent || '').trim();
  const charCount = text.length;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  statsPill.textContent = `${wordCount} words  •  ${charCount} chars`;
}
