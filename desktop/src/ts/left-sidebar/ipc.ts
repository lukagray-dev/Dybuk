// Sidebar IPC communication wrappers

import { invokeIpc } from '../shared/ipc.js';
import { RecentDoc } from './types.js';

export async function listDocumentsIpc(): Promise<RecentDoc[]> {
  const result = await invokeIpc<RecentDoc[]>('list_documents');
  return result || [];
}

export async function createDocumentIpc(
  path: string,
  isDybuk: boolean,
  password?: string
): Promise<RecentDoc | null> {
  return await invokeIpc<RecentDoc>('create_document_cmd', {
    path,
    isDybuk,
    password: password || null,
  });
}

export async function getDefaultDocumentsDirIpc(): Promise<string> {
  const dir = await invokeIpc<string>('get_default_documents_dir');
  return dir || '.';
}

export async function removeRecentDocIpc(path: string): Promise<void> {
  await invokeIpc('remove_recent_cmd', { path });
}

