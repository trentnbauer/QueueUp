import { apiGet } from './client';

export const versionApi = {
  get: () => apiGet<{ version: string; sha: string | null }>('/api/version'),
};
