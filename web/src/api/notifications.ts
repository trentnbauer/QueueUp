import { apiGet, apiPost } from './client';
import type { Notification, NotificationSummary } from '@squadqueue/shared';

export const notificationsApi = {
  feed: () => apiGet<{ notifications: Notification[] }>('/api/notifications'),
  summary: () => apiGet<NotificationSummary>('/api/notifications/summary'),
  markAllRead: () => apiPost<void>('/api/notifications/read-all'),
  markRoomRead: (roomId: string) => apiPost<void>(`/api/rooms/${roomId}/notifications/read`),
};
