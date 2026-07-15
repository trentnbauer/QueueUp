import { apiGet, apiPatch } from './client';
import type { RoomPlatform, User } from '@squadqueue/shared';

export const authApi = {
  me: () => apiGet<{ user: User | null; steamLinked: boolean; ownedPlatforms: RoomPlatform[] }>('/api/me'),
  providers: () => apiGet<{ providers: string[] }>('/api/auth/providers'),
  updateOwnedPlatforms: (platforms: RoomPlatform[]) =>
    apiPatch<{ ownedPlatforms: RoomPlatform[] }>('/api/me/owned-platforms', { platforms }),
  loginUrl: (provider: string) => `/auth/${provider}/login`,
  logoutUrl: '/auth/logout',
};
