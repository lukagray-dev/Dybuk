// Types for sidebar document history and creation

export interface RecentDoc {
  path: string;
  name: string;
  last_opened: string;
  is_dybuk: boolean;
}

export type DocumentType = 'md' | 'dybuk';

