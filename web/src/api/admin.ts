import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import { getBasePath } from '../utils/basePath';
import type { AdminBackupInfo, AdminBackupsResponse, AdminBackupSettings, RestoreBackupResponse, UpdateBackupSettingsRequest, AdminIntegrationStatus, AdminRoomSummary, AdminUserSummary, IntegrationConfigKey, TunnelStatus } from '@queueup/shared';

/** Sends a backup file as the raw request body (not JSON), so it can't go through the JSON helpers. */
async function importBackup(file: File): Promise<RestoreBackupResponse> {
  const response = await fetch(`${getBasePath()}/api/admin/backups/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/gzip' },
    body: file,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Import failed: ${response.status}`);
  }
  return response.json() as Promise<RestoreBackupResponse>;
}

export const adminApi = {
  backups: () => apiGet<AdminBackupsResponse>('/api/admin/backups'),
  updateBackupSettings: (body: UpdateBackupSettingsRequest) => apiPatch<{ settings: AdminBackupSettings }>('/api/admin/backups/settings', body),
  createBackup: () => apiPost<{ backup: AdminBackupInfo }>('/api/admin/backups'),
  deleteBackup: (name: string) => apiDelete(`/api/admin/backups/${encodeURIComponent(name)}`),
  restoreBackup: (name: string) => apiPost<RestoreBackupResponse>(`/api/admin/backups/${encodeURIComponent(name)}/restore`),
  importBackup,
  overview: () => apiGet<{ status: AdminIntegrationStatus; tunnel: TunnelStatus }>('/api/admin/overview'),
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
