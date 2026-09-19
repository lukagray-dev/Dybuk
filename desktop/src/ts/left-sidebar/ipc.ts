// Sidebar IPC communication wrappers
//
// Hey friend! These helper functions make it effortless to call Tauri commands
// running in our Rust backend. Whenever the user clicks "Open project" or
// removes a project from the sidebar, these asynchronous IPC functions do the heavy lifting!

import { invokeIpc } from '../shared/ipc.js';
import { ProjectEntry, RecentDoc } from './types.js';

/**
 * Asks the Rust backend for all recently opened documents.
 * Returns an array of recent document items.
 */
export async function listDocumentsIpc(): Promise<RecentDoc[]> {
  const result = await invokeIpc<RecentDoc[]>('list_documents');
  return result || [];
}

/**
 * Calls the Rust backend to create a brand new Markdown file or encrypted Dybuk vault.
 */
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

/**
 * Asks the OS for the user's default Documents folder.
 */
export async function getDefaultDocumentsDirIpc(): Promise<string> {
  const dir = await invokeIpc<string>('get_default_documents_dir');
  return dir || '.';
}

/**
 * Removes a file path from the recents store in `recents.json`.
 */
export async function removeRecentDocIpc(path: string): Promise<void> {
  await invokeIpc('remove_recent_cmd', { path });
}

/**
 * Opens the native desktop folder picker dialog.
 * If the user chooses a folder, the backend saves it to `projects.json`,
 * scans all its .md and .dybuk files, and returns the project entry.
 * If the user cancels the dialog, it safely resolves to null.
 */
export async function openProjectPickerIpc(): Promise<ProjectEntry | null> {
  return await invokeIpc<ProjectEntry | null>('open_project_picker');
}

/**
 * Fetches all saved projects from `projects.json` and rescans their files on disk.
 */
export async function listProjectsIpc(): Promise<ProjectEntry[]> {
  const result = await invokeIpc<ProjectEntry[]>('list_projects');
  return result || [];
}

/**
 * Adds a project directory path directly and indexes its files.
 */
export async function addProjectIpc(path: string): Promise<ProjectEntry | null> {
  return await invokeIpc<ProjectEntry>('add_project', { path });
}

/**
 * Removes a project directory from `projects.json` so it won't show in the sidebar anymore.
 * Remember: this does NOT delete any files from disk!
 */
export async function removeProjectIpc(path: string): Promise<void> {
  await invokeIpc('remove_project', { path });
}

/**
 * Tells the OS file manager (Windows Explorer, macOS Finder, Linux) to open and
 * highlight this file on your desktop.
 */
export async function revealInExplorerIpc(path: string): Promise<void> {
  await invokeIpc('reveal_in_explorer', { path });
}

/**
 * Permanently deletes a file from the hard drive and prunes it from recents.
 */
export async function deleteFileFromDiskIpc(path: string): Promise<void> {
  await invokeIpc('delete_file_from_disk', { path });
}
