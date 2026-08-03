import { apiGet } from './client';
import type { BadgesResponse } from '@queueup/shared';

export const badgesApi = {
  list: () => apiGet<BadgesResponse>('/api/me/badges'),
};
