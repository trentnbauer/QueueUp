import { apiDelete, apiGet, apiPost } from './client';
import type { PendingLibraryImportDto, ResolvePendingLibraryImportBundleRequest, ResolvePendingLibraryImportRequest } from '@queueup/shared';

export const PENDING_IMPORTS_QUERY_KEY = ['pending-library-imports'] as const;

export const DISMISSED_IMPORTS_QUERY_KEY = ['pending-library-imports', 'dismissed'] as const;

export const pendingImportsApi = {
  listDismissed: () => apiGet<{ pending: PendingLibraryImportDto[] }>('/api/library/pending-imports/dismissed'),
  restore: (id: string) => apiPost<void>(`/api/library/pending-imports/${id}/restore`),
  list: () => apiGet<{ pending: PendingLibraryImportDto[] }>('/api/library/pending-imports'),
  count: () => apiGet<{ count: number }>('/api/library/pending-imports/count'),
  resolve: (id: string, igdbId: number) =>
    apiPost<void>(`/api/library/pending-imports/${id}/resolve`, { igdbId } satisfies ResolvePendingLibraryImportRequest),
  resolveBundle: (id: string, igdbIds: number[]) =>
    apiPost<void>(`/api/library/pending-imports/${id}/resolve-bundle`, { igdbIds } satisfies ResolvePendingLibraryImportBundleRequest),
  dismiss: (id: string) => apiDelete(`/api/library/pending-imports/${id}`),
};
