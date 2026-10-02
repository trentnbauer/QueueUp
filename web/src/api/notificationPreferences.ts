import { apiGet, apiPut } from './client';
import type { NotificationPreferencesResponse, SetNotificationPreferenceRequest } from '@queueup/shared';

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const;

export const notificationPreferencesApi = {
  get: () => apiGet<NotificationPreferencesResponse>('/api/me/notification-preferences'),
  set: (body: SetNotificationPreferenceRequest) => apiPut<{ ok: true }>('/api/me/notification-preferences', body),
};
