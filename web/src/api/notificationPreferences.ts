import { apiGet, apiPost, apiPut } from './client';
import type { AlertEmailResponse, NotificationPreferencesResponse, SetAlertEmailRequest, SetAlertEmailResponse, SetNotificationPreferenceRequest } from '@queueup/shared';

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const;

export const notificationPreferencesApi = {
  get: () => apiGet<NotificationPreferencesResponse>('/api/me/notification-preferences'),
  set: (body: SetNotificationPreferenceRequest) => apiPut<{ ok: true }>('/api/me/notification-preferences', body),
};

export const ALERT_EMAIL_QUERY_KEY = ['alert-email'] as const;

export const alertEmailApi = {
  get: () => apiGet<AlertEmailResponse>('/api/me/alert-email'),
  set: (body: SetAlertEmailRequest) => apiPut<SetAlertEmailResponse>('/api/me/alert-email', body),
  confirm: (token: string) => apiPost<{ email: string }>('/api/email/confirm', { token }),
};
