import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { AdminAiResponse, AiSettingsResponse, AiTestResponse, SetAdminAiRequest, SetUserAiSettingsRequest, UserAiSettings } from '@queueup/shared';

export const AI_SETTINGS_QUERY_KEY = ['ai-settings'] as const;
export const ADMIN_AI_QUERY_KEY = ['admin-ai'] as const;

export const aiApi = {
  mine: () => apiGet<AiSettingsResponse>('/api/me/ai'),
  save: (body: SetUserAiSettingsRequest) => apiPut<{ user: UserAiSettings }>('/api/me/ai', body),
  clear: () => apiDelete('/api/me/ai'),
  /** `index` tests just that saved provider (0 is the first, then the backups). */
  test: (index?: number) => apiPost<AiTestResponse>('/api/me/ai/test', index === undefined ? undefined : { index }),
  admin: () => apiGet<AdminAiResponse>('/api/admin/ai'),
  saveAdmin: (body: SetAdminAiRequest) => apiPut<AdminAiResponse>('/api/admin/ai', body),
  testAdmin: (index?: number) => apiPost<AiTestResponse>('/api/admin/ai/test', index === undefined ? undefined : { index }),
};
