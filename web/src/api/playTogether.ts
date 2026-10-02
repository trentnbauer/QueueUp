import { apiGet, apiPost } from './client';
import type { AcceptPlayTogetherRequest, AcceptPlayTogetherResponse, PlayTogetherRoomsResponse } from '@queueup/shared';

export const playTogetherApi = {
  ask: (userId: string, igdbId: number) => apiPost<{ sent: true }>('/api/play-together', { userId, igdbId }),
  rooms: (notificationId: string) => apiGet<PlayTogetherRoomsResponse>(`/api/play-together/${notificationId}/rooms`),
  accept: (notificationId: string, body: AcceptPlayTogetherRequest) =>
    apiPost<AcceptPlayTogetherResponse>(`/api/play-together/${notificationId}/accept`, body),
};
