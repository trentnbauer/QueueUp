import { apiDelete, apiGet, apiPost } from './client';
import type { AdminBan, AdminUnbanRequest, AdminUserReport, BlockedUser, ReportUserRequest } from '@queueup/shared';

export const moderationApi = {
  blocks: () => apiGet<{ blocks: BlockedUser[] }>('/api/blocks'),
  block: (userId: string) => apiPost<{ ok: true }>('/api/blocks', { userId }),
  unblock: (userId: string) => apiDelete(`/api/blocks/${encodeURIComponent(userId)}`),
  report: (body: ReportUserRequest) => apiPost<{ ok: true }>('/api/reports', body),
  adminReports: () => apiGet<{ reports: AdminUserReport[] }>('/api/admin/reports'),
  adminBans: () => apiGet<{ bans: AdminBan[]; unbanRequests: AdminUnbanRequest[] }>('/api/admin/bans'),
  ban: (userId: string, reason: string) => apiPost<{ ok: true }>(`/api/admin/users/${userId}/ban`, { reason }),
  unban: (userId: string) => apiPost<{ ok: true }>(`/api/admin/users/${userId}/unban`, {}),
  declineUnban: (requestId: string) => apiPost<{ ok: true }>(`/api/admin/unban-requests/${requestId}/decline`, {}),
  /** A banned person asking to be unbanned. */
  requestUnban: (message: string) => apiPost<{ ok: true }>('/api/me/unban-request', { message }),
  forceNameChange: (reportId: string) => apiPost<{ ok: true }>(`/api/admin/reports/${reportId}/force-name-change`, {}),
  resetAvatar: (reportId: string) => apiPost<{ ok: true }>(`/api/admin/reports/${reportId}/reset-avatar`, {}),
  resolveReport: (id: string) => apiPost<{ ok: true }>(`/api/admin/reports/${id}/resolve`, {}),
};
