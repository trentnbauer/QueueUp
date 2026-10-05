import { apiDelete, apiGet, apiPost } from './client';
import type { LibrarySyncProgress, PlayniteImportStarted, XboxConnectPollResponse, XboxConnectStartResponse, XboxStatusResponse } from '@queueup/shared';

export const XBOX_STATUS_QUERY_KEY = ['xbox', 'status'] as const;

export const xboxApi = {
  status: () => apiGet<XboxStatusResponse>('/api/me/xbox'),
  connect: () => apiPost<XboxConnectStartResponse>('/api/me/xbox/connect', {}),
  poll: () => apiPost<XboxConnectPollResponse>('/api/me/xbox/connect/poll', {}),
  disconnect: () => apiDelete('/api/me/xbox'),
  sync: () => apiPost<PlayniteImportStarted>('/api/me/xbox/sync', {}),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/xbox/sync/progress'),
};
