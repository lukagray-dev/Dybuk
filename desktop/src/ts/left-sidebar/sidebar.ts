// Left Sidebar management, document categorization, search filtering, and creation

import { openDocument } from '../main-content/canvas/editor.js';
import { appState } from '../shared/state.js';
import { showCreateDocumentDialog } from './dialog.js';
import { listDocumentsIpc, removeRecentDocIpc } from './ipc.js';
import { DocumentType, RecentDoc } from './types.js';

let allDocuments: RecentDoc[] = [];
let searchQuery = '';

export function initSidebar(): void {
  setupSidebarCollapse();
  setupNewDocumentDropdown();
  setupSidebarSearch();
  setupSectionToggles();
  setupSettingsButton();
  setupSidebarResize();

  // Initial load of documents from history
  refreshDocuments();
}

/**
 * Syncs the sidebar DOM with appState's sidebarOpen property.
 */
function setupSidebarCollapse(): void {
  const sidebar = document.getElementById('left-sidebar');
  if (!sidebar) return;

  const update = () => {
    const isOpen = appState.getSidebarOpen();
    sidebar.classList.toggle('collapsed', !isOpen);
  };

  update();
  appState.subscribe(update);
}

/**
 * Handles New Document button click and dropdown menu.
 */
function setupNewDocumentDropdown(): void {
  const btnNewDoc = document.getElementById('btn-new-doc');
  const dropdown = document.getElementById('new-doc-dropdown');

  btnNewDoc?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open');
  });

  // Close dropdown on outside click
  window.addEventListener('click', () => {
    dropdown?.classList.remove('open');
  });

  // Wire dropdown options
  document.querySelectorAll<HTMLElement>('.new-doc-option').forEach((option) => {
    option.addEventListener('click', async (e) => {
      e.stopPropagation();
      dropdown?.classList.remove('open');

      const type = option.dataset.type as DocumentType;
      if (type) {
        const created = await showCreateDocumentDialog(type);
        if (created) {
          await refreshDocuments();
          await selectDocument(created);
        }
      }
    });
  });
}

/**
 * Handles search bar input and clear button.
 */
function setupSidebarSearch(): void {
  const searchInput = document.getElementById('sidebar-search-input') as HTMLInputElement | null;
  const clearBtn = document.getElementById('btn-search-clear');

  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn?.classList.toggle('visible', searchQuery.length > 0);
    renderDocuments();
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.classList.remove('visible');
      renderDocuments();
      searchInput.focus();
    }
  });
}

/**
 * Handles collapsible section headers.
 */
function setupSectionToggles(): void {
  document.querySelectorAll<HTMLElement>('.sidebar-section .section-header').forEach((header) => {
    header.addEventListener('click', (e) => {
      // Ignore clicks on action buttons inside header
      if ((e.target as HTMLElement).closest('.section-action-btn')) return;

      const section = header.closest('.sidebar-section');
      section?.classList.toggle('collapsed');
    });
  });
}

/**
 * Handles dummy settings button.
 */
function setupSettingsButton(): void {
  document.getElementById('btn-sidebar-settings')?.addEventListener('click', () => {
    alert('Settings panel will be implemented in the next phase.');
  });
}

/**
 * Fetches recent documents from the Rust core and re-renders the list.
 */
export async function refreshDocuments(): Promise<void> {
  try {
    allDocuments = await listDocumentsIpc();
    renderDocuments();
  } catch (err) {
    console.error('Failed to load recent documents:', err);
  }
}

/**
 * Renders documents into Markdown (.md) and Dybuk (.dybuk) categories with live filtering.
 */
function renderDocuments(): void {
  const mdContainer = document.getElementById('markdown-items-container');
  const dybukContainer = document.getElementById('dybuk-items-container');
  const mdBadge = document.getElementById('markdown-count-badge');
  const dybukBadge = document.getElementById('dybuk-count-badge');

  if (!mdContainer || !dybukContainer) return;

  const currentDoc = appState.getCurrentDoc();

  // Filter documents by search term
  const filtered = allDocuments.filter((doc) => {
    if (!searchQuery) return true;
    return doc.name.toLowerCase().includes(searchQuery) || doc.path.toLowerCase().includes(searchQuery);
  });

  const mdDocs = filtered.filter((d) => !d.is_dybuk);
  const dybukDocs = filtered.filter((d) => d.is_dybuk);

  // Update count badges
  if (mdBadge) mdBadge.textContent = String(mdDocs.length);
  if (dybukBadge) dybukBadge.textContent = String(dybukDocs.length);

  // Render Markdown section
  mdContainer.innerHTML = '';
  if (mdDocs.length === 0) {
    mdContainer.innerHTML = `<div class="empty-section-msg">${searchQuery ? 'No matching markdown files' : 'No markdown files yet'}</div>`;
  } else {
    mdDocs.forEach((doc) => {
      const item = createDocElement(doc, currentDoc.path === doc.path);
      mdContainer.appendChild(item);
    });
  }

  // Render Dybuk Vault section
  dybukContainer.innerHTML = '';
  if (dybukDocs.length === 0) {
    dybukContainer.innerHTML = `<div class="empty-section-msg">${searchQuery ? 'No matching vaults' : 'No encrypted vaults yet'}</div>`;
  } else {
    dybukDocs.forEach((doc) => {
      const item = createDocElement(doc, currentDoc.path === doc.path);
      dybukContainer.appendChild(item);
    });
  }
}

/**
 * Creates a single document DOM item.
 */
function createDocElement(doc: RecentDoc, isActive: boolean): HTMLElement {
  const div = document.createElement('div');
  div.className = `doc-item ${isActive ? 'active' : ''}`;
  div.title = doc.path;

  div.innerHTML = `
    <div class="doc-item-left">
      <span class="ui-icon ${doc.is_dybuk ? 'icon-doc-dybuk' : 'icon-doc-markdown'}"></span>
      <span class="doc-title-text">${escapeHtml(doc.name)}</span>
    </div>
    <div class="doc-item-actions">
      <button class="item-action-btn delete" title="Remove from recent files">
        <span class="ui-icon icon-sidebar-trash"></span>
      </button>
    </div>
  `;

  // Select document on click
  div.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('.item-action-btn')) return;
    await selectDocument(doc);
  });

  // Delete / Remove from history button
  const deleteBtn = div.querySelector('.item-action-btn.delete');
  deleteBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await removeRecentDocIpc(doc.path);
      await refreshDocuments();
    } catch (err) {
      console.error('Failed to remove recent file:', err);
    }
  });

  return div;
}

/**
 * Selects a document and opens it in the editor canvas.
 */
async function selectDocument(doc: RecentDoc): Promise<void> {
  const success = await openDocument(doc.path, doc.name, doc.is_dybuk);
  if (success) {
    renderDocuments();
  }
}

/**
 * Resizing support for the left sidebar.
 */
function setupSidebarResize(): void {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('left-sidebar');
  if (!handle || !sidebar) return;

  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, 200), 450);
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
