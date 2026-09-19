// Floating context menu manager for sidebar items
//
// Hey friend! This module controls the popup menu that appears when you click
// the three dots (...) button next to any file in the sidebar.
// It handles:
// 1. Calculating the exact on-screen position next to the clicked button.
// 2. Ensuring the menu stays within viewport bounds (never cut off at the edge).
// 3. Executing actions like Copy Path, Reveal in Explorer, Delete File, or Remove from Recents.
// 4. Dismissing cleanly whenever the user clicks outside or presses Escape.

import { appState } from '../shared/state.js';
import { showConfirmDialog } from './dialog.js';
import { deleteFileFromDiskIpc, removeRecentDocIpc, revealInExplorerIpc } from './ipc.js';
import { ProjectEntry, ProjectFileEntry, RecentDoc } from './types.js';

/** Keeps track of the currently open floating context menu DOM element */
let activeContextMenuEl: HTMLElement | null = null;
let activeAnchorBtn: HTMLElement | null = null;

// Set up window-level event listeners once to handle dismissal
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    // If the click happened outside the active menu, dismiss it
    if (activeContextMenuEl && !activeContextMenuEl.contains(e.target as Node)) {
      dismissContextMenu();
    }
  });

  window.addEventListener('keydown', (e) => {
    // Pressing Escape closes any open context menu
    if (e.key === 'Escape') {
      dismissContextMenu();
    }
  });

  window.addEventListener('resize', () => {
    // Window resized -> dismiss menu so coordinates don't desync
    dismissContextMenu();
  });
}

/**
 * Closes and removes the currently open context menu from the DOM.
 */
export function dismissContextMenu(): void {
  if (activeContextMenuEl) {
    activeContextMenuEl.remove();
    activeContextMenuEl = null;
  }
  if (activeAnchorBtn) {
    activeAnchorBtn.classList.remove('active');
    activeAnchorBtn = null;
  }
}

/**
 * Represents an individual clickable action item in the context menu.
 */
export interface ContextMenuItem {
  label: string;
  iconClass: string;
  isDanger?: boolean;
  onClick: () => Promise<void> | void;
}

/**
 * Renders and positions a floating context menu next to an anchor button.
 */
export function renderContextMenu(
  anchorEl: HTMLElement,
  items: (ContextMenuItem | 'separator')[]
): void {
  // Dismiss any existing open menu first
  dismissContextMenu();

  activeAnchorBtn = anchorEl;
  anchorEl.classList.add('active');

  const menu = document.createElement('div');
  menu.className = 'session-context-menu';

  // Build the list of menu items
  items.forEach((item) => {
    if (item === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `context-menu-item ${item.isDanger ? 'danger' : ''}`;
      btn.innerHTML = `
        <span class="ui-icon ${item.iconClass}"></span>
        <span>${escapeHtml(item.label)}</span>
      `;

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        dismissContextMenu();
        try {
          await item.onClick();
        } catch (err) {
          console.error(`Error executing context menu action "${item.label}":`, err);
        }
      });

      menu.appendChild(btn);
    }
  });

  document.body.appendChild(menu);
  activeContextMenuEl = menu;

  // Calculate coordinates to align menu nicely adjacent to the trigger button
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = 180;
  const menuHeight = menu.offsetHeight || 140;

  // Horizontal positioning: align to right of anchor or clamp inside window
  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }

  // Vertical positioning: place directly below anchor, or flip above if close to bottom
  let top = rect.bottom + 4;
  if (top + menuHeight > window.innerHeight - 10) {
    top = Math.max(10, rect.top - menuHeight - 4);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/**
 * Displays the options context menu for a file located inside a project folder.
 *
 * Options provided:
 * - Copy Full Path
 * - Copy Relative Path
 * - Reveal in File Explorer
 * - Delete File (with confirmation dialog)
 */
export function showProjectItemContextMenu(
  anchorEl: HTMLElement,
  file: ProjectFileEntry,
  _project: ProjectEntry,
  onRefresh: () => Promise<void>
): void {
  renderContextMenu(anchorEl, [
    {
      label: 'Copy Full Path',
      iconClass: 'icon-sidebar-copy',
      onClick: async () => {
        await copyToClipboard(file.path);
      },
    },
    {
      label: 'Copy Relative Path',
      iconClass: 'icon-sidebar-copy',
      onClick: async () => {
        await copyToClipboard(file.relative_path);
      },
    },
    {
      label: 'Reveal in File Explorer',
      iconClass: 'icon-sidebar-folder',
      onClick: async () => {
        await revealInExplorerIpc(file.path);
      },
    },
    'separator',
    {
      label: 'Delete File',
      iconClass: 'icon-sidebar-trash',
      isDanger: true,
      onClick: async () => {
        const confirmed = await showConfirmDialog({
          title: 'Delete File',
          message: `Are you sure you want to permanently delete "${file.name}" from your hard drive? This cannot be undone.`,
          confirmText: 'Delete File',
          cancelText: 'Cancel',
          isDanger: true,
          icon: 'trash',
        });

        if (confirmed) {
          // If the file currently open in the canvas is the one being deleted, reset editor to empty state
          const currentDoc = appState.getCurrentDoc();
          if (
            currentDoc.path &&
            currentDoc.path.toLowerCase() === file.path.toLowerCase()
          ) {
            appState.setCurrentDoc({
              path: null,
              name: 'Untitled',
              isDybuk: false,
              isDirty: false,
              isUnlocked: true,
            });
          }

          // Delete from disk and refresh project files
          await deleteFileFromDiskIpc(file.path);
          await onRefresh();
        }
      },
    },
  ]);
}

/**
 * Displays the options context menu for a recent document (Markdown or Dybuk vault).
 *
 * Options provided:
 * - Copy Path
 * - Reveal in File Explorer
 * - Remove from Recents
 */
export function showRecentItemContextMenu(
  anchorEl: HTMLElement,
  doc: RecentDoc,
  onRefresh: () => Promise<void>
): void {
  renderContextMenu(anchorEl, [
    {
      label: 'Copy Path',
      iconClass: 'icon-sidebar-copy',
      onClick: async () => {
        await copyToClipboard(doc.path);
      },
    },
    {
      label: 'Reveal in File Explorer',
      iconClass: 'icon-sidebar-folder',
      onClick: async () => {
        await revealInExplorerIpc(doc.path);
      },
    },
    'separator',
    {
      label: 'Remove from Recents',
      iconClass: 'icon-sidebar-trash',
      isDanger: true,
      onClick: async () => {
        await removeRecentDocIpc(doc.path);
        await onRefresh();
      },
    },
  ]);
}

/**
 * Helper to safely copy text to the system clipboard.
 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  } catch (err) {
    console.warn('Failed to copy to clipboard:', err);
  }
}

/**
 * Escapes characters that have special meaning in HTML.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

