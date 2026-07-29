import { apiDelete, apiGet, apiPost } from './client';
import type { ApiKeySummary, CreateApiKeyResponse } from '@queueup/shared';

// Shared React Query key (issue #441) - ApiKeysSection's list and PlayniteImportSection's own
// key-creation both need to invalidate the same cache entry, so a Playnite setup code shows up
// in the API keys list right away instead of only after a manual page reload.
export const API_KEYS_QUERY_KEY = ['api-keys'] as const;

export const apiKeysApi = {
  list: () => apiGet<{ keys: ApiKeySummary[] }>('/api/me/api-keys'),
  create: (label: string) => apiPost<CreateApiKeyResponse>('/api/me/api-keys', { label }),
  revoke: (id: string) => apiDelete(`/api/me/api-keys/${id}`),
};
