import { apiGet } from './client';
import type { PlayniteImportProgress } from '@queueup/shared';

export const PLAYNITE_IMPORT_PROGRESS_QUERY_KEY = ['library', 'playnite-import-progress'] as const;

export const playniteImportApi = {
  progress: () => apiGet<{ progress: PlayniteImportProgress | null }>('/api/library/import-playnite/progress'),
};
