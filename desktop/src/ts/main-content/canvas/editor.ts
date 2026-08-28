// Document editor WYSIWYG canvas, disk watcher subscriber, and topbar controller for Dybuk
// Manages pulldown-cmark compilation on open, real-time hot-reloading on disk changes,
// floating toolbar lifecycle, and clean GFM serialization on save

import { invokeIpc, listenIpcEvent } from '../../shared/ipc.js';
import { appState } from '../../shared/state.js';
import { lockVaultIpc, readDocumentIpc, saveDocumentIpc } from '../ipc.js';
import { showUnlockVaultDialog } from '../unlock-dialog.js';
import { FloatingToolbar } from './floating-toolbar.js';
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

  // Handle paste events to preserve clean semantic structure
  canvas.addEventListener('paste', () => {
    setTimeout(() => {
      updateStats();
      const doc = appState.getCurrentDoc();
      if (!doc.isDirty) {
        appState.setCurrentDoc({ isDirty: true });
      }
    }, 10);
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
      await markdownToDom(payload.content, canvas);
      updateStats();
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
 * Automatically starts watching the target file on disk for external hot-reloads.
 */
export async function openDocument(path: string, name: string, isDybuk: boolean): Promise<boolean> {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return false;

  if (isDybuk) {
    // Attempt reading with session key or prompt password
    let content = '';
    let password = activePassword;

    try {
      const payload = await readDocumentIpc(path, password || undefined);
      content = payload.content;
    } catch {
      // Vault is locked -> Prompt user for passphrase
      const unlockResult = await showUnlockVaultDialog(path, name);
      if (!unlockResult) {
        return false;
      }
      content = unlockResult.payload.content;
      activePassword = unlockResult.password;
    }

    // Compile Markdown to semantic HTML in canvas
    await markdownToDom(content, canvas);

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
    try {
      const payload = await readDocumentIpc(path);
      await markdownToDom(payload.content, canvas);

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
    } catch (err) {
      console.error('Failed to read markdown document:', err);
      alert(`Could not open document: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
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
