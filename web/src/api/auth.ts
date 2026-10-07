import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';
import { getBasePath } from '../utils/basePath';
import type { AutoHideAdultResponse, AccountEventPage, ActivityVisibilityResponse, ComputerSpecs, ProfileVisibility, RoomPlatform, User } from '@queueup/shared';

export const authApi = {
  me: () =>
    apiGet<{
      user: User | null;
      steamLinked: boolean;
      ownedPlatforms: RoomPlatform[];
      /** Who can open this account's /u/:id profile page: anyone, friends, or only them. */
      profileVisibility: ProfileVisibility;
      /** Vanity name for the public profile URL, if the user set one. */
      profileSlug: string | null;
      /** The colour set for the Personal Shelf (#rrggbb), or null. */
      shelfColor: string | null;
      primaryProvider: string | null;
      linkedProviders: string[];
      /** True exactly once, on the very first /api/me call after this account was created (issue
       * #359) - the server clears its session flag on read, so a page refresh or later session
       * never sees it true again. Drives auto-opening the Import Library modal for a new account. */
      isNewAccount: boolean;
      /** True until the welcome walkthrough is finished or skipped once on any device. */
      onboardingPending: boolean;
    }>('/api/me'),
  completeOnboarding: () => apiPost<{ ok: true }>('/api/me/onboarding-complete'),
  /** Sign-in methods, plus the Turnstile site key when the sign-in captcha is on (issue #665). */
  providers: () => apiGet<{ providers: string[]; turnstileSiteKey: string | null }>('/api/auth/providers'),
  updateOwnedPlatforms: (platforms: RoomPlatform[]) =>
    apiPatch<{ ownedPlatforms: RoomPlatform[] }>('/api/me/owned-platforms', { platforms }),
  setProfileVisibility: (visibility: ProfileVisibility) =>
    apiPatch<{ profileVisibility: ProfileVisibility }>('/api/me/profile-visibility', { visibility }),
  accountEvents: (before?: string) => apiGet<AccountEventPage>(`/api/me/events${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  computerSpecs: () => apiGet<ComputerSpecs>('/api/me/computer-specs'),
  setComputerSpecs: (body: ComputerSpecs) => apiPut<ComputerSpecs>('/api/me/computer-specs', body),
  adultScan: () => apiPost<{ started: boolean }>('/api/me/adult-scan', {}),
  autoHideAdult: () => apiGet<AutoHideAdultResponse>('/api/me/auto-hide-adult'),
  setAutoHideAdult: (enabled: boolean) => apiPut<AutoHideAdultResponse>('/api/me/auto-hide-adult', { enabled }),
  activityVisibility: () => apiGet<ActivityVisibilityResponse>('/api/me/activity-visibility'),
  setActivityVisibility: (hidden: boolean) => apiPut<ActivityVisibilityResponse>('/api/me/activity-visibility', { hidden }),
  setDisplayName: (displayName: string) => apiPatch<{ displayName: string }>('/api/me/display-name', { displayName }),
  setShelfColor: (colour: string | null) => apiPatch<{ shelfColor: string | null }>('/api/me/shelf-colour', { colour }),
  setProfileSlug: (slug: string | null) => apiPatch<{ profileSlug: string | null }>('/api/me/profile-slug', { slug }),
  loginUrl: (provider: string, captcha?: string | null) =>
    `${getBasePath()}/auth/${provider}/login${captcha ? `?captcha=${encodeURIComponent(captcha)}` : ''}`,
  linkUrl: (provider: string) => `${getBasePath()}/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logout: () => apiPost<void>('/auth/logout'),
  deleteAccount: () => apiDelete('/api/me'),
};
