import { apiGet, apiPost } from './client';
import type { BadgesResponse, RefreshBadgesResponse } from '@queueup/shared';

export const badgesApi = {
  list: () => apiGet<BadgesResponse>('/api/me/badges'),
  refresh: () => apiPost<RefreshBadgesResponse>('/api/me/badges/refresh'),
};
