import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import { getBasePath } from '../utils/basePath';
import type { AdminBackupInfo, AdminBackupsResponse, AdminBackupSettings, RestoreBackupResponse, RestoreSessionKeyCode, UpdateBackupSettingsRequest, AdminIntegrationStatus, AdminRoomDetail, AdminRoomSummary, AdminUserSummary, AdminEmailLogEntry, IntegrationConfigKey, TunnelStatus } from '@queueup/shared';

/** Options for a restore or import whose backup holds encrypted keys made with another session key. */
export interface RestoreOptions {
  sessionKey?: string;
  skipEncrypted?: boolean;
}

/** A failed restore/import. `code` is set when the backup's encrypted keys need the old session key. */
export class RestoreError extends Error {
  constructor(
    message: string,
    readonly code?: RestoreSessionKeyCode,
  ) {
    super(message);
  }
}

/** Restore and import send their options as headers (an import's body is the raw backup file, not
 * JSON), so neither can go through the JSON helpers. */
async function sendRestore(path: string, opts: RestoreOptions, file?: File): Promise<RestoreBackupResponse> {
  const headers: Record<string, string> = {};
  if (file) headers['Content-Type'] = 'application/gzip';
  // URI-encoded: header values must be ASCII, and a session key can be anything.
  if (opts.sessionKey) headers['X-Backup-Session-Key'] = encodeURIComponent(opts.sessionKey);
  if (opts.skipEncrypted) headers['X-Backup-Skip-Encrypted'] = '1';
  const response = await fetch(`${getBasePath()}${path}`, { method: 'POST', credentials: 'include', headers, body: file });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    const code = body.code === 'session_key_required' || body.code === 'session_key_wrong' ? body.code : undefined;
    throw new RestoreError(body.error ?? `Restore failed: ${response.status}`, code);
  }
  return response.json() as Promise<RestoreBackupResponse>;
}

export const adminApi = {
  backups: () => apiGet<AdminBackupsResponse>('/api/admin/backups'),
  updateBackupSettings: (body: UpdateBackupSettingsRequest) => apiPatch<{ settings: AdminBackupSettings }>('/api/admin/backups/settings', body),
  createBackup: () => apiPost<{ backup: AdminBackupInfo }>('/api/admin/backups'),
  deleteBackup: (name: string) => apiDelete(`/api/admin/backups/${encodeURIComponent(name)}`),
  restoreBackup: (name: string, opts: RestoreOptions = {}) => sendRestore(`/api/admin/backups/${encodeURIComponent(name)}/restore`, opts),
  importBackup: (file: File, opts: RestoreOptions = {}) => sendRestore('/api/admin/backups/import', opts, file),
  overview: () => apiGet<{ status: AdminIntegrationStatus; tunnel: TunnelStatus }>('/api/admin/overview'),
  emailLog: () => apiGet<{ entries: AdminEmailLogEntry[] }>('/api/admin/email-log'),
  users: () => apiGet<{ users: AdminUserSummary[] }>('/api/admin/users'),
  setUserAdmin: (id: string, isAdmin: boolean) =>
    apiPatch<{ user: AdminUserSummary }>(`/api/admin/users/${id}/admin`, { isAdmin }),
  setUserAiAccess: (id: string, aiEntitled: boolean) =>
    apiPatch<{ user: AdminUserSummary }>(`/api/admin/users/${id}/ai-access`, { aiEntitled }),
  deleteUser: (id: string) => apiDelete(`/api/admin/users/${id}`),
  rooms: () => apiGet<{ rooms: AdminRoomSummary[] }>('/api/admin/rooms'),
  deleteRoom: (id: string) => apiDelete(`/api/admin/rooms/${id}`),
  /** A read-only look at a room (#792). */
  room: (id: string) => apiGet<AdminRoomDetail>(`/api/admin/rooms/${id}`),
  /** "Manage as Room Master" for an hour (#792). */
  manageRoom: (id: string) => apiPost<{ managingUntil: string | null }>(`/api/admin/rooms/${id}/manage`),
  stopManagingRoom: (id: string) => apiDelete(`/api/admin/rooms/${id}/manage`),
  setIntegrationConfig: (key: IntegrationConfigKey, value: string) =>
    apiPatch<{ ok: true }>('/api/admin/integrations', { key, value }),
  clearIntegrationConfig: (key: IntegrationConfigKey) => apiDelete(`/api/admin/integrations/${key}`),
  sendTestEmail: () => apiPost<{ ok: true; sentTo: string }>('/api/admin/smtp/test'),
};
