import { apiDelete, apiGet, apiPost } from './client';
import type {
  FriendActivityPage,
  FriendProfile,
  FriendsResponse,
  FriendUser,
  SendFriendRequestRequest,
  SetFeedReactionRequest,
} from '@queueup/shared';

export const friendsApi = {
  list: () => apiGet<FriendsResponse>('/api/friends'),
  incomingCount: () => apiGet<{ count: number }>('/api/friends/incoming-count'),
  sendRequest: (body: SendFriendRequestRequest) =>
    apiPost<{ accepted: boolean; user: FriendUser }>('/api/friends/requests', body),
  accept: (requestId: string) => apiPost<{ ok: true }>(`/api/friends/requests/${requestId}/accept`),
  /** Decline (as the addressee) and cancel (as the requester) are the same call. */
  removeRequest: (requestId: string) => apiDelete(`/api/friends/requests/${requestId}`),
  unfriend: (userId: string) => apiDelete(`/api/friends/${userId}`),
  activity: (before?: string) =>
    apiGet<FriendActivityPage>(`/api/friends/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  react: (body: SetFeedReactionRequest) => apiPost<{ ok: true }>('/api/feed-reactions', body),
  profile: (userId: string) => apiGet<FriendProfile>(`/api/friends/${userId}/profile`),
};
