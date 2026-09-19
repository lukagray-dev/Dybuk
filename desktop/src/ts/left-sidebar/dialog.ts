// Custom interactive modal dialog for creating new Markdown (.md) or Dybuk Vault (.dybuk) documents,
// and prompt confirmation modals for dangerous actions (like deleting files).
//
// Hey friend! This file manages nice, polished modal popups in Dybuk.
// Whether you're creating a file or confirming a file deletion, everything
// looks cohesive, accessible, and native to the app!

import { createDocumentIpc, getDefaultDocumentsDirIpc } from './ipc.js';
import { DocumentType, RecentDoc } from './types.js';

/**
 * Options configuring a confirmation modal dialog.
 */
export interface ConfirmDialogOptions {
  /** Main header title of the modal (e.g., "Delete File") */
  title: string;
  /** Detailed explanatory message or warning for the user */
  message: string;
  /** Label for the confirm button (defaults to "Delete" if isDanger, else "Confirm") */
  confirmText?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelText?: string;
  /** If true, the confirm button is styled with an alarming danger-red theme */
  isDanger?: boolean;
  /** Icon to show in the badge (e.g., 'trash' or 'info') */
  icon?: 'trash' | 'info';
}

/**
 * Displays an interactive modal dialog for creating a new document or vault.
 *
 * @param type 'md' for standard markdown, 'dybuk' for encrypted vault.
 * @param targetDir Optional specific folder to save the document in (e.g., a project root).
 *                  If omitted, defaults to the user's standard Documents directory.
 */
export async function showCreateDocumentDialog(
  type: DocumentType,
  targetDir?: string
): Promise<RecentDoc | null> {
  return new Promise(async (resolve) => {
    const isDybuk = type === 'dybuk';
    // Use targetDir if provided (e.g. from project header), otherwise default Documents folder
    const defaultDir = targetDir || (await getDefaultDocumentsDirIpc());
    const defaultExt = isDybuk ? '.dybuk' : '.md';
    const defaultName = isDybuk ? `vault${defaultExt}` : `document${defaultExt}`;

    // Create modal overlay element
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    overlay.innerHTML = `
      <div class="dialog-card" style="max-width: 440px;">
        <div class="dialog-body">
          <div class="dialog-header">
            <div class="dialog-icon-badge ${isDybuk ? 'primary' : 'info'}">
              <span class="ui-icon ${isDybuk ? 'icon-doc-dybuk' : 'icon-doc-markdown'}"></span>
            </div>
            <div class="dialog-text-content">
              <h3 class="dialog-title">${isDybuk ? 'Create Encrypted Vault' : 'Create Markdown Document'}</h3>
              <p class="dialog-message">${
                isDybuk
                  ? 'Initialize a new AES-256-GCM encrypted vault file protected by password.'
                  : 'Initialize a standard plain text markdown document.'
              }</p>
            </div>
          </div>

          <form id="create-doc-form" style="display: flex; flex-direction: column; gap: 10px; margin-top: 6px;">
            <div class="form-group">
              <label class="form-label" for="input-doc-name">File Name</label>
              <input id="input-doc-name" class="form-input" type="text" value="${defaultName}" placeholder="e.g. diary${defaultExt}" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-doc-dir">Saving Location</label>
              <input id="input-doc-dir" class="form-input" type="text" value="${escapeHtml(defaultDir)}" placeholder="Folder path" required />
            </div>

            ${
              isDybuk
                ? `
            <div class="form-group">
              <label class="form-label" for="input-doc-pass">Master Passphrase</label>
              <input id="input-doc-pass" class="form-input" type="password" placeholder="Enter strong password" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="input-doc-confirm-pass">Confirm Passphrase</label>
              <input id="input-doc-confirm-pass" class="form-input" type="password" placeholder="Re-enter password" required />
            </div>
            `
                : ''
            }

            <div id="dialog-error-box" class="form-error-msg"></div>
          </form>
        </div>

        <div class="dialog-footer">
          <button id="btn-dialog-cancel" type="button" class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button id="btn-dialog-submit" type="button" class="dialog-btn dialog-btn-confirm">${
            isDybuk ? 'Create & Encrypt' : 'Create File'
          }</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector<HTMLInputElement>('#input-doc-name');
    const dirInput = overlay.querySelector<HTMLInputElement>('#input-doc-dir');
    const passInput = overlay.querySelector<HTMLInputElement>('#input-doc-pass');
    const confirmPassInput = overlay.querySelector<HTMLInputElement>('#input-doc-confirm-pass');
    const errorBox = overlay.querySelector<HTMLElement>('#dialog-error-box');
    const cancelBtn = overlay.querySelector<HTMLButtonElement>('#btn-dialog-cancel');
    const submitBtn = overlay.querySelector<HTMLButtonElement>('#btn-dialog-submit');

    // Auto-focus the file name input
    nameInput?.focus();
    nameInput?.select();

    const cleanup = () => {
      overlay.remove();
    };

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    const handleSubmit = async () => {
      if (!nameInput || !dirInput) return;

      let name = nameInput.value.trim();
      const dir = dirInput.value.trim();

      if (!name) {
        if (errorBox) errorBox.textContent = 'Please provide a file name.';
        nameInput.classList.add('error');
        return;
      }

      if (!dir) {
        if (errorBox) errorBox.textContent = 'Please provide a destination folder.';
        dirInput.classList.add('error');
        return;
      }

      // Automatically append proper file extension if omitted by user
      if (!name.toLowerCase().endsWith(defaultExt)) {
        name += defaultExt;
      }

      // Build target path using appropriate separator
      const separator = dir.includes('\\') ? '\\' : '/';
      const cleanDir = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
      const fullPath = `${cleanDir}${separator}${name}`;

      let password: string | undefined = undefined;

      if (isDybuk) {
        const pass = passInput?.value || '';
        const confirmPass = confirmPassInput?.value || '';

        if (!pass) {
          if (errorBox) errorBox.textContent = 'Master passphrase cannot be blank.';
          passInput?.classList.add('error');
          return;
        }

        if (pass !== confirmPass) {
          if (errorBox) errorBox.textContent = 'Passwords do not match. Please re-enter.';
          confirmPassInput?.classList.add('error');
          return;
        }

        password = pass;
      }

      if (errorBox) errorBox.textContent = 'Creating document...';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const createdDoc = await createDocumentIpc(fullPath, isDybuk, password);
        cleanup();
        resolve(createdDoc);
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err instanceof Error ? err.message : String(err);
        }
        if (submitBtn) submitBtn.disabled = false;
      }
    };

    submitBtn?.addEventListener('click', handleSubmit);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * Displays a clean confirmation dialog prompt to the user.
 * Returns true if confirmed, false if cancelled or dismissed.
 */
export async function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const isDanger = options.isDanger ?? false;
    const confirmText = options.confirmText || (isDanger ? 'Delete' : 'Confirm');
    const cancelText = options.cancelText || 'Cancel';
    const iconType = options.icon || (isDanger ? 'trash' : 'info');

    const iconBadgeClass = isDanger ? 'danger' : 'info';
    const iconClass = iconType === 'trash' ? 'icon-sidebar-trash' : 'icon-sidebar-folder';

    overlay.innerHTML = `
      <div class="dialog-card" style="max-width: 400px;">
        <div class="dialog-body">
          <div class="dialog-header">
            <div class="dialog-icon-badge ${iconBadgeClass}">
              <span class="ui-icon ${iconClass}"></span>
            </div>
            <div class="dialog-text-content">
              <h3 class="dialog-title">${escapeHtml(options.title)}</h3>
              <p class="dialog-message">${escapeHtml(options.message)}</p>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button id="btn-confirm-cancel" type="button" class="dialog-btn dialog-btn-cancel">${escapeHtml(cancelText)}</button>
          <button id="btn-confirm-ok" type="button" class="dialog-btn dialog-btn-confirm ${isDanger ? 'danger' : ''}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();

    overlay.querySelector('#btn-confirm-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    overlay.querySelector('#btn-confirm-ok')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup();
        resolve(true);
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    });

    // Focus cancel button by default for danger dialogs to avoid accidental triggers
    const defaultFocusBtn = isDanger
      ? overlay.querySelector<HTMLButtonElement>('#btn-confirm-cancel')
      : overlay.querySelector<HTMLButtonElement>('#btn-confirm-ok');
    defaultFocusBtn?.focus();
  });
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
