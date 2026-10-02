import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';
import { getBasePath } from '../utils/basePath';
import type { ActivityVisibilityResponse, RoomPlatform, User } from '@queueup/shared';

export const authApi = {
  me: () =>
    apiGet<{
      user: User | null;
      steamLinked: boolean;
      ownedPlatforms: RoomPlatform[];
      /** Whether the /u/:id public profile page (issue #511) is currently reachable for this
       * account - off by default, see User.publicProfileEnabled's schema doc. */
      publicProfileEnabled: boolean;
      /** Vanity name for the public profile URL, if the user set one. */
      profileSlug: string | null;
      primaryProvider: string | null;
      linkedProviders: string[];
      /** True exactly once, on the very first /api/me call after this account was created (issue
       * #359) - the server clears its session flag on read, so a page refresh or later session
       * never sees it true again. Drives auto-opening the Import Library modal for a new account. */
      isNewAccount: boolean;
    }>('/api/me'),
  /** Sign-in methods, plus the Turnstile site key when the sign-in captcha is on (issue #665). */
  providers: () => apiGet<{ providers: string[]; turnstileSiteKey: string | null }>('/api/auth/providers'),
  updateOwnedPlatforms: (platforms: RoomPlatform[]) =>
    apiPatch<{ ownedPlatforms: RoomPlatform[] }>('/api/me/owned-platforms', { platforms }),
  updatePublicProfile: (enabled: boolean) =>
    apiPatch<{ publicProfileEnabled: boolean }>('/api/me/public-profile', { enabled }),
  activityVisibility: () => apiGet<ActivityVisibilityResponse>('/api/me/activity-visibility'),
  setActivityVisibility: (hidden: boolean) => apiPut<ActivityVisibilityResponse>('/api/me/activity-visibility', { hidden }),
  setDisplayName: (displayName: string) => apiPatch<{ displayName: string }>('/api/me/display-name', { displayName }),
  setProfileSlug: (slug: string | null) => apiPatch<{ profileSlug: string | null }>('/api/me/profile-slug', { slug }),
  loginUrl: (provider: string, captcha?: string | null) =>
    `${getBasePath()}/auth/${provider}/login${captcha ? `?captcha=${encodeURIComponent(captcha)}` : ''}`,
  linkUrl: (provider: string) => `${getBasePath()}/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logout: () => apiPost<void>('/auth/logout'),
  deleteAccount: () => apiDelete('/api/me'),
};
