// Custom interactive modal dialog for creating new Markdown (.md) or Dybuk Vault (.dybuk) documents

import { createDocumentIpc, getDefaultDocumentsDirIpc } from './ipc.js';
import { DocumentType, RecentDoc } from './types.js';

export async function showCreateDocumentDialog(type: DocumentType): Promise<RecentDoc | null> {
  return new Promise(async (resolve) => {
    const isDybuk = type === 'dybuk';
    const defaultDir = await getDefaultDocumentsDirIpc();
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
              <input id="input-doc-dir" class="form-input" type="text" value="${defaultDir}" placeholder="Folder path" required />
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
      let rawName = nameInput?.value.trim() || '';
      const rawDir = dirInput?.value.trim() || '';

      if (!rawName) {
        if (errorBox) errorBox.textContent = 'File name cannot be empty.';
        nameInput?.classList.add('error');
        return;
      }

      if (!rawDir) {
        if (errorBox) errorBox.textContent = 'Saving location cannot be empty.';
        dirInput?.classList.add('error');
        return;
      }

      // Ensure appropriate extension
      if (!rawName.toLowerCase().endsWith(defaultExt)) {
        rawName += defaultExt;
      }

      // Normalize combined path
      const separator = rawDir.includes('/') ? '/' : '\\';
      const fullPath = rawDir.endsWith('/') || rawDir.endsWith('\\')
        ? `${rawDir}${rawName}`
        : `${rawDir}${separator}${rawName}`;

      let password: string | undefined = undefined;
      if (isDybuk) {
        const pass = passInput?.value || '';
        const confirmPass = confirmPassInput?.value || '';

        if (!pass) {
          if (errorBox) errorBox.textContent = 'Password is required for encrypted vaults.';
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

