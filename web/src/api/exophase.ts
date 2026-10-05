import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { ConnectExophaseRequest, ExophaseStatusResponse, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';

export const EXOPHASE_STATUS_QUERY_KEY = ['exophase', 'status'] as const;

export const exophaseApi = {
  status: () => apiGet<ExophaseStatusResponse>('/api/me/exophase'),
  connect: (profile: string) => apiPut<ExophaseStatusResponse>('/api/me/exophase', { profile } satisfies ConnectExophaseRequest),
  disconnect: () => apiDelete('/api/me/exophase'),
  sync: () => apiPost<PlayniteImportStarted>('/api/me/exophase/sync', {}),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/exophase/sync/progress'),
};
