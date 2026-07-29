import { apiDelete, apiGet, apiPost } from './client';
import type { PendingLibraryImportDto, ResolvePendingLibraryImportRequest } from '@queueup/shared';

export const PENDING_IMPORTS_QUERY_KEY = ['pending-library-imports'] as const;

export const pendingImportsApi = {
  list: () => apiGet<{ pending: PendingLibraryImportDto[] }>('/api/library/pending-imports'),
  resolve: (id: string, igdbId: number) =>
    apiPost<void>(`/api/library/pending-imports/${id}/resolve`, { igdbId } satisfies ResolvePendingLibraryImportRequest),
  dismiss: (id: string) => apiDelete(`/api/library/pending-imports/${id}`),
};
