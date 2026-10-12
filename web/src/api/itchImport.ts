import { apiGet, apiPost } from './client';
import type { ItchImportRequest, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';

export const itchImportApi = {
  start: (apiKey: string) => apiPost<PlayniteImportStarted>('/api/me/import/itch', { apiKey } satisfies ItchImportRequest),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/import/itch/progress'),
};
