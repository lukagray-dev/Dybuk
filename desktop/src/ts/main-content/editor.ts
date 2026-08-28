// Document editor canvas and topbar controller for Dybuk

import { appState } from '../shared/state.js';
import { lockVaultIpc, readDocumentIpc, saveDocumentIpc } from './ipc.js';
import { showUnlockVaultDialog } from './unlock-dialog.js';

let activePassword = '';

export function initEditor(): void {
  setupEditorInputs();
  setupEditorActions();
  setupKeyboardShortcuts();
  setupAppStateSubscriber();
}

/**
 * Initializes textarea input listeners and word/character count stats.
 */
function setupEditorInputs(): void {
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    // Mark document as dirty (unsaved changes)
    const doc = appState.getCurrentDoc();
    if (!doc.isDirty) {
      appState.setCurrentDoc({ isDirty: true });
    }

    updateStats();
    autoResizeTextarea();
  });
}

/**
 * Sets up the Lock button in the topbar.
 */
function setupEditorActions(): void {
  const btnLock = document.getElementById('topbar-btn-lock');

  btnLock?.addEventListener('click', async () => {
    await lockActiveDocument();
  });
}

/**
 * Sets up global keyboard shortcuts (Ctrl+S for save, Ctrl+L for lock).
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
 * Subscribes to appState changes to update the topbar UI.
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
 * Opens a document into the editor. If .dybuk and locked, prompts for password.
 */
export async function openDocument(path: string, name: string, isDybuk: boolean): Promise<boolean> {
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;

  if (isDybuk) {
    // Attempt reading or prompt password
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

    if (textarea) {
      textarea.value = content;
      autoResizeTextarea();
    }

    appState.setCurrentDoc({
      path,
      name,
      isDybuk: true,
      isDirty: false,
      isUnlocked: true,
    });

    updateStats();
    textarea?.focus();
    return true;
  } else {
    // Plain markdown document
    try {
      const payload = await readDocumentIpc(path);
      if (textarea) {
        textarea.value = payload.content;
        autoResizeTextarea();
      }

      activePassword = '';
      appState.setCurrentDoc({
        path,
        name,
        isDybuk: false,
        isDirty: false,
        isUnlocked: true,
      });

      updateStats();
      textarea?.focus();
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
 */
export async function saveActiveDocument(): Promise<void> {
  const doc = appState.getCurrentDoc();
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;
  if (!doc.path || !textarea) return;

  try {
    const content = textarea.value;
    await saveDocumentIpc(doc.path, content, doc.isDybuk ? activePassword : undefined);
    appState.setCurrentDoc({ isDirty: false });
  } catch (err) {
    console.error('Failed to save document:', err);
    alert(`Failed to save document: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Locks the current active vault, wipes key from session store, and closes document.
 */
export async function lockActiveDocument(): Promise<void> {
  const doc = appState.getCurrentDoc();
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;
  if (!doc.path || !doc.isDybuk) return;

  try {
    await lockVaultIpc(doc.path);
    activePassword = '';
    if (textarea) textarea.value = '';

    appState.setCurrentDoc({
      path: null,
      name: 'Untitled',
      isDybuk: false,
      isDirty: false,
      isUnlocked: false,
    });
  } catch (err) {
    console.error('Failed to lock vault:', err);
  }
}

/**
 * Calculates and updates word and character statistics in the topbar.
 */
function updateStats(): void {
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;
  const statsPill = document.getElementById('topbar-word-count');
  if (!textarea || !statsPill) return;

  const text = textarea.value.trim();
  const charCount = textarea.value.length;
  const wordCount = text ? text.split(/\s+/).length : 0;

  statsPill.textContent = `${wordCount} words  •  ${charCount} chars`;
}

/**
 * Automatically adjusts textarea height so document expands naturally.
 */
function autoResizeTextarea(): void {
  const textarea = document.getElementById('editor-textarea') as HTMLTextAreaElement | null;
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(textarea.scrollHeight, 400)}px`;
}

