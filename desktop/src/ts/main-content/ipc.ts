// Main content IPC communication wrappers for reading, saving, and locking documents

import { invokeIpc } from '../shared/ipc.js';
import { DocumentPayload } from './types.js';

export async function readDocumentIpc(
  path: string,
  password?: string
): Promise<DocumentPayload> {
  const result = await invokeIpc<DocumentPayload>('read_document', {
    path,
    password: password || null,
  });

  if (!result) {
    throw new Error('Failed to read document from disk');
  }

  return result;
}

export async function saveDocumentIpc(
  path: string,
  content: string,
  password?: string
): Promise<void> {
  await invokeIpc('save_document', {
    path,
    content,
    password: password || null,
  });
}

export async function lockVaultIpc(path: string): Promise<void> {
  await invokeIpc('lock_vault', { path });
}

