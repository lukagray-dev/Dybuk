// Types for sidebar document history, creation, and project workspaces
//
// Hey friend! Here are the type definitions used throughout the left sidebar.
// They describe what a recent document looks like, as well as the structure of
// project folders that users open from disk!

/**
 * Describes a document in the recent files history list.
 */
export interface RecentDoc {
  /** Full path on disk (e.g. C:\Users\Alice\Notes\intro.md) */
  path: string;
  /** Display file name (e.g. intro.md) */
  name: string;
  /** ISO timestamp when the document was last opened or saved */
  last_opened: string;
  /** True if the document is an encrypted .dybuk container, false if plain markdown */
  is_dybuk: boolean;
}

/**
 * The two types of new documents you can create in Dybuk:
 * - 'md': Plain text GitHub-flavored markdown file
 * - 'dybuk': Military-grade AES-256-GCM encrypted vault
 */
export type DocumentType = 'md' | 'dybuk';

/**
 * Describes an individual Markdown or Dybuk vault file discovered inside an open project folder.
 */
export interface ProjectFileEntry {
  /** Full absolute path to the file on disk */
  path: string;
  /** Just the file name with extension (e.g. "README.md") */
  name: string;
  /** Path relative to the project root with clean forward slashes (e.g. "docs/architecture.md") */
  relative_path: string;
  /** True if this file is an encrypted vault, false if plain markdown */
  is_dybuk: boolean;
}

/**
 * Describes an entire project folder opened in the sidebar.
 * A project contains its root folder metadata and all discovered markdown/dybuk files.
 */
export interface ProjectEntry {
  /** Full absolute directory path on disk */
  path: string;
  /** Display name of the project folder (e.g. "Dybuk" or "MyPersonalNotes") */
  name: string;
  /** List of all indexed markdown and dybuk vault files inside this project */
  files: ProjectFileEntry[];
}
