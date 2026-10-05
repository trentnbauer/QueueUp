import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { ConnectPsnRequest, LibrarySyncProgress, PlayniteImportStarted, PsnStatusResponse } from '@queueup/shared';

export const PSN_STATUS_QUERY_KEY = ['psn', 'status'] as const;

export const psnApi = {
  status: () => apiGet<PsnStatusResponse>('/api/me/psn'),
  connect: (npsso: string) => apiPut<PsnStatusResponse>('/api/me/psn', { npsso } satisfies ConnectPsnRequest),
  disconnect: () => apiDelete('/api/me/psn'),
  sync: () => apiPost<PlayniteImportStarted>('/api/me/psn/sync', {}),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/psn/sync/progress'),
};
