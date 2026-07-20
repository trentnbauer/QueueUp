import { apiDelete, apiGet, apiPatch } from './client';
import type { RoomPlatform, User } from '@queueup/shared';

export const authApi = {
  me: () =>
    apiGet<{
      user: User | null;
      steamLinked: boolean;
      ownedPlatforms: RoomPlatform[];
      primaryProvider: string | null;
      linkedProviders: string[];
    }>('/api/me'),
  providers: () => apiGet<{ providers: string[] }>('/api/auth/providers'),
  updateOwnedPlatforms: (platforms: RoomPlatform[]) =>
    apiPatch<{ ownedPlatforms: RoomPlatform[] }>('/api/me/owned-platforms', { platforms }),
  loginUrl: (provider: string) => `/auth/${provider}/login`,
  linkUrl: (provider: string) => `/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logoutUrl: '/auth/logout',
};
