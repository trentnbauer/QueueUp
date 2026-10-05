import { apiDelete, apiGet, apiPost } from './client';
import type { AiClassifyPendingResponse, AiMatchPendingResponse, AiPendingChunkRequest, DismissPendingLibraryImportsRequest, PendingLibraryImportDto, ResolvePendingLibraryImportBundleRequest, ResolvePendingLibraryImportRequest } from '@queueup/shared';

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
  aiMatch: (after?: string | null) => apiPost<AiMatchPendingResponse>('/api/library/pending-imports/ai-match', { after: after ?? null } satisfies AiPendingChunkRequest),
  aiClassify: (after?: string | null) => apiPost<AiClassifyPendingResponse>('/api/library/pending-imports/ai-classify', { after: after ?? null } satisfies AiPendingChunkRequest),
  dismissMany: (ids: string[]) =>
    apiPost<{ dismissed: number }>('/api/library/pending-imports/dismiss-many', { ids } satisfies DismissPendingLibraryImportsRequest),
  dismiss: (id: string) => apiDelete(`/api/library/pending-imports/${id}`),
};
