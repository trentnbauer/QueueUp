import { apiGet } from './client';

export const LIBRARY_LIMITS_QUERY_KEY = ['library-limits'] as const;

/** Library sources that are rate limiting QueueUp right now, each with the ISO time it is limited
 * until (null when it isn't). Exophase and RetroAchievements today. */
export const libraryLimitsApi = {
  get: () => apiGet<{ limits: Record<string, string | null> }>('/api/me/library-limits'),
};
