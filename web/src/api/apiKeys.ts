import { apiDelete, apiGet, apiPost } from './client';
import type { ApiKeySummary, CreateApiKeyResponse } from '@queueup/shared';

export const apiKeysApi = {
  list: () => apiGet<{ keys: ApiKeySummary[] }>('/api/me/api-keys'),
  create: (label: string) => apiPost<CreateApiKeyResponse>('/api/me/api-keys', { label }),
  revoke: (id: string) => apiDelete(`/api/me/api-keys/${id}`),
};
