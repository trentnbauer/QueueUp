import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { AdminIntegrationStatus, AdminRoomSummary, AdminUserSummary, IntegrationConfigKey } from '@queueup/shared';

export const adminApi = {
  overview: () => apiGet<{ status: AdminIntegrationStatus }>('/api/admin/overview'),
  users: () => apiGet<{ users: AdminUserSummary[] }>('/api/admin/users'),
  setUserAdmin: (id: string, isAdmin: boolean) =>
    apiPatch<{ user: AdminUserSummary }>(`/api/admin/users/${id}/admin`, { isAdmin }),
  deleteUser: (id: string) => apiDelete(`/api/admin/users/${id}`),
  rooms: () => apiGet<{ rooms: AdminRoomSummary[] }>('/api/admin/rooms'),
  deleteRoom: (id: string) => apiDelete(`/api/admin/rooms/${id}`),
  setIntegrationConfig: (key: IntegrationConfigKey, value: string) =>
    apiPatch<{ ok: true }>('/api/admin/integrations', { key, value }),
  clearIntegrationConfig: (key: IntegrationConfigKey) => apiDelete(`/api/admin/integrations/${key}`),
};
