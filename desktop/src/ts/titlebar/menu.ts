// Native Titlebar Dropdown Menus and Action Dispatcher for Dybuk
// Manages File, View, Window, Help menus, and state-aware item activation

import { showCreateDocumentDialog } from '../left-sidebar/dialog.js';
import { refreshDocuments } from '../left-sidebar/sidebar.js';
import { lockActiveDocument, openDocument, saveActiveDocument } from '../main-content/canvas/editor.js';
import { invokeIpc } from '../shared/ipc.js';
import { appState } from '../shared/state.js';

export function setupMenus(): void {
  const menuTriggers = document.querySelectorAll<HTMLButtonElement>('.menu-trigger');
  const dropdownMenus = document.querySelectorAll<HTMLElement>('.dropdown-menu');

  // Open/toggle dropdown when menu trigger is clicked
  menuTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuName = trigger.dataset.menu || null;
      const current = appState.getActiveMenu();
      appState.setActiveMenu(current === menuName ? null : menuName);
    });

    // Hover-switch when a menu is already open
    trigger.addEventListener('mouseenter', () => {
      const current = appState.getActiveMenu();
      if (current && trigger.dataset.menu) {
        appState.setActiveMenu(trigger.dataset.menu);
      }
    });
  });

  // Sync active menu state & item enablement with DOM classes
  appState.subscribe(() => {
    const active = appState.getActiveMenu();
    const doc = appState.getCurrentDoc();

    menuTriggers.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.menu === active);
    });

    dropdownMenus.forEach((menu) => {
      menu.classList.toggle('open', menu.dataset.menu === active);
    });

    // Save is enabled only when an active document has unsaved modifications
    const saveItem = document.getElementById('menu-item-save');
    if (saveItem) {
      saveItem.classList.toggle('disabled', !doc.path || !doc.isDirty);
    }

    // Lock Vault is enabled only when an encrypted .dybuk vault is currently open and unlocked
    const lockItem = document.getElementById('menu-item-lock');
    if (lockItem) {
      lockItem.classList.toggle('disabled', !doc.path || !doc.isDybuk || !doc.isUnlocked);
    }
  });

  // Dismiss menus on outside click
  window.addEventListener('click', () => {
    if (appState.getActiveMenu()) {
      appState.setActiveMenu(null);
    }
  });

  // Wire specific menu actions
  setupFilesMenuActions();
  setupViewMenuActions();
  setupWindowMenuActions();
  setupHelpMenuActions();
}

/**
 * Configures File menu actions (New Document sub-options, Open Document, Save, Lock Vault).
 */
function setupFilesMenuActions(): void {
  // New Standard Markdown Document (.md)
  document.getElementById('menu-item-new-markdown')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    appState.setActiveMenu(null);
    const created = await showCreateDocumentDialog('md');
    if (created) {
      await refreshDocuments();
      await openDocument(created.path, created.name, created.is_dybuk);
    }
  });

  // New Encrypted Dybuk Vault (.dybuk)
  document.getElementById('menu-item-new-dybuk')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    appState.setActiveMenu(null);
    const created = await showCreateDocumentDialog('dybuk');
    if (created) {
      await refreshDocuments();
      await openDocument(created.path, created.name, created.is_dybuk);
    }
  });

  // Open Document (via native file picker dialog)
  document.getElementById('menu-item-open-doc')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    try {
      const filePath = await invokeIpc<string | null>('open_file_dialog');
      if (filePath) {
        const isDybuk = filePath.toLowerCase().endsWith('.dybuk');
        const fileName = filePath.split(/[\\/]/).pop() || 'Untitled';
        const success = await openDocument(filePath, fileName, isDybuk);
        if (success) {
          await refreshDocuments();
        }
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  });

  // Save Document
  document.getElementById('menu-item-save')?.addEventListener('click', async () => {
    const doc = appState.getCurrentDoc();
    if (!doc.path || !doc.isDirty) return;
    appState.setActiveMenu(null);
    await saveActiveDocument();
  });

  // Lock Vault
  document.getElementById('menu-item-lock')?.addEventListener('click', async () => {
    const doc = appState.getCurrentDoc();
    if (!doc.path || !doc.isDybuk || !doc.isUnlocked) return;
    appState.setActiveMenu(null);
    await lockActiveDocument();
  });

  // Settings
  document.getElementById('menu-item-settings')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    alert('Settings panel will be implemented in the next phase.');
  });
}

/**
 * Configures View menu actions.
 */
function setupViewMenuActions(): void {
  document.getElementById('menu-item-toggle-recents')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    appState.toggleSidebar();
  });
}

/**
 * Configures Window menu actions.
 */
function setupWindowMenuActions(): void {
  document.getElementById('menu-item-close-window')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('close_window');
  });

  document.getElementById('menu-item-exit')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('exit_application');
  });
}

/**
 * Configures Help menu external links.
 */
function setupHelpMenuActions(): void {
  document.getElementById('menu-item-documentation')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_documentation');
  });

  document.getElementById('menu-item-report-bug')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_report_bug');
  });

  document.getElementById('menu-item-follow-creator')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_follow_creator');
  });

  document.getElementById('menu-item-see-repo')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_repository');
  });
}
