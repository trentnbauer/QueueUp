import { apiDelete, apiGet, apiPost } from './client';
import type { AdminUserReport, BlockedUser, ReportUserRequest } from '@queueup/shared';

export const moderationApi = {
  blocks: () => apiGet<{ blocks: BlockedUser[] }>('/api/blocks'),
  block: (userId: string) => apiPost<{ ok: true }>('/api/blocks', { userId }),
  unblock: (userId: string) => apiDelete(`/api/blocks/${encodeURIComponent(userId)}`),
  report: (body: ReportUserRequest) => apiPost<{ ok: true }>('/api/reports', body),
  adminReports: () => apiGet<{ reports: AdminUserReport[] }>('/api/admin/reports'),
  resolveReport: (id: string) => apiPost<{ ok: true }>(`/api/admin/reports/${id}/resolve`, {}),
};
