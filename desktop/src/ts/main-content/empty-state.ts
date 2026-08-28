// Empty State / Welcome Screen controller for Dybuk WYSIWYG Editor
// Manages New Document dropdown and Open Document file picker actions

import { showCreateDocumentDialog } from '../left-sidebar/dialog.js';
import { refreshDocuments } from '../left-sidebar/sidebar.js';
import { DocumentType } from '../left-sidebar/types.js';
import { invokeIpc } from '../shared/ipc.js';
import { openDocument } from './canvas/editor.js';

export function initEmptyState(): void {
  setupEmptyStateNewDoc();
  setupEmptyStateOpenDoc();
}

/**
 * Configures New Document dropdown button on the empty state screen.
 */
function setupEmptyStateNewDoc(): void {
  const btnNewDoc = document.getElementById('empty-btn-new-doc');
  const dropdown = document.getElementById('empty-new-doc-dropdown');

  btnNewDoc?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open');
  });

  // Close dropdown on outside click
  window.addEventListener('click', () => {
    dropdown?.classList.remove('open');
  });

  // Handle dropdown option clicks
  document.querySelectorAll<HTMLElement>('.empty-dropdown-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      dropdown?.classList.remove('open');

      const type = item.dataset.type as DocumentType;
      if (type) {
        const created = await showCreateDocumentDialog(type);
        if (created) {
          await refreshDocuments();
          await openDocument(created.path, created.name, created.is_dybuk);
        }
      }
    });
  });
}

/**
 * Configures Open Document button on the empty state screen.
 */
function setupEmptyStateOpenDoc(): void {
  const btnOpenDoc = document.getElementById('empty-btn-open-doc');

  btnOpenDoc?.addEventListener('click', async () => {
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
      console.error('Failed to open document from empty state:', err);
    }
  });
}

