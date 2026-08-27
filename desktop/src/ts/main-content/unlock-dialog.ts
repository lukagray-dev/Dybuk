// Password prompt modal dialog for unlocking .dybuk vault files

import { readDocumentIpc } from './ipc.js';
import { DocumentPayload } from './types.js';

export async function showUnlockVaultDialog(
  path: string,
  fileName: string
): Promise<{ payload: DocumentPayload; password: string } | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    overlay.innerHTML = `
      <div class="dialog-card" style="max-width: 400px;">
        <div class="dialog-body">
          <div class="dialog-header">
            <div class="dialog-icon-badge primary">
              <span class="ui-icon icon-doc-dybuk"></span>
            </div>
            <div class="dialog-text-content">
              <h3 class="dialog-title">Unlock Encrypted Vault</h3>
              <p class="dialog-message">Enter passphrase to decrypt <strong>${escapeHtml(fileName)}</strong>.</p>
            </div>
          </div>

          <form id="unlock-vault-form" style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
            <div class="form-group">
              <label class="form-label" for="input-vault-pass">Master Passphrase</label>
              <input id="input-vault-pass" class="form-input" type="password" placeholder="Enter password" autocomplete="current-password" required />
            </div>

            <div id="unlock-error-box" class="form-error-msg"></div>
          </form>
        </div>

        <div class="dialog-footer">
          <button id="btn-unlock-cancel" type="button" class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button id="btn-unlock-submit" type="button" class="dialog-btn dialog-btn-confirm">Unlock & Open</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const passInput = overlay.querySelector<HTMLInputElement>('#input-vault-pass');
    const errorBox = overlay.querySelector<HTMLElement>('#unlock-error-box');
    const cancelBtn = overlay.querySelector<HTMLButtonElement>('#btn-unlock-cancel');
    const submitBtn = overlay.querySelector<HTMLButtonElement>('#btn-unlock-submit');

    passInput?.focus();

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

    const handleUnlock = async () => {
      const password = passInput?.value || '';

      if (!password) {
        if (errorBox) errorBox.textContent = 'Please enter your password.';
        passInput?.classList.add('error');
        return;
      }

      if (errorBox) errorBox.textContent = 'Decrypting vault...';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = await readDocumentIpc(path, password);
        cleanup();
        resolve({ payload, password });
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = 'Incorrect passphrase or corrupted vault.';
        }
        passInput?.classList.add('error');
        passInput?.select();
        if (submitBtn) submitBtn.disabled = false;
      }
    };

    submitBtn?.addEventListener('click', handleUnlock);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });
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

