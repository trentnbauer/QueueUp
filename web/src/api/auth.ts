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
      /** True exactly once, on the very first /api/me call after this account was created (issue
       * #359) - the server clears its session flag on read, so a page refresh or later session
       * never sees it true again. Drives auto-opening the Import Library modal for a new account. */
      isNewAccount: boolean;
    }>('/api/me'),
  providers: () => apiGet<{ providers: string[] }>('/api/auth/providers'),
  updateOwnedPlatforms: (platforms: RoomPlatform[]) =>
    apiPatch<{ ownedPlatforms: RoomPlatform[] }>('/api/me/owned-platforms', { platforms }),
  loginUrl: (provider: string) => `/auth/${provider}/login`,
  linkUrl: (provider: string) => `/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logoutUrl: '/auth/logout',
  deleteAccount: () => apiDelete('/api/me'),
};
