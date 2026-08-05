import { apiDelete, apiGet, apiPatch } from './client';
import { getBasePath } from '../utils/basePath';
import type { RoomPlatform, User } from '@queueup/shared';

export const authApi = {
  me: () =>
    apiGet<{
      user: User | null;
      steamLinked: boolean;
      ownedPlatforms: RoomPlatform[];
      /** Whether the /u/:id public profile page (issue #511) is currently reachable for this
       * account - off by default, see User.publicProfileEnabled's schema doc. */
      publicProfileEnabled: boolean;
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
  updatePublicProfile: (enabled: boolean) =>
    apiPatch<{ publicProfileEnabled: boolean }>('/api/me/public-profile', { enabled }),
  loginUrl: (provider: string) => `${getBasePath()}/auth/${provider}/login`,
  linkUrl: (provider: string) => `${getBasePath()}/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logoutUrl: `${getBasePath()}/auth/logout`,
  deleteAccount: () => apiDelete('/api/me'),
};
