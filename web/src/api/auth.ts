import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';
import { getBasePath } from '../utils/basePath';
import type { AvatarChoice, AvatarSettings, AutoHideAdultResponse, BannedInfo, AccountEventPage, ActivityVisibilityResponse, ComputerSpecs, ProfileVisibility, RoomPlatform, User } from '@queueup/shared';

export const authApi = {
  me: () =>
    apiGet<{
      user: User | null;
      /** Set when an administrator has banned this account: the app shows only the ban notice. */
      banned?: BannedInfo | null;
      /** An administrator made them give up their display name: they must choose a new one. */
      mustChangeName?: boolean;
      /** Set while the operator requires the terms to be accepted and the current version has not been (#1097). */
      termsRequired?: { version: string } | null;
      /** Can also do the destructive administrator things (#1102). */
      isSuperAdmin?: boolean;
      /** Set while an administrator is viewing the app as this user (#1102): until when, and who is looking. */
      viewingAs?: { until: string; viewer: User } | null;
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
  acceptTerms: (version: string) => apiPost<{ ok: true }>('/api/me/accept-terms', { version }),
  completeOnboarding: () => apiPost<{ ok: true }>('/api/me/onboarding-complete'),
  /** Sign-in methods, plus the Turnstile site key when the sign-in captcha is on (issue #665). */
  providers: () => apiGet<{ providers: string[]; turnstileSiteKey: string | null; signupMode?: 'open' | 'invite' }>('/api/auth/providers'),
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
  avatarSettings: () => apiGet<AvatarSettings>('/api/me/avatar'),
  setAvatarChoice: (choice: AvatarChoice) => apiPut<{ choice: AvatarChoice; avatarUrl: string | null }>('/api/me/avatar', { choice }),
  setShelfColor: (colour: string | null) => apiPatch<{ shelfColor: string | null }>('/api/me/shelf-colour', { colour }),
  setProfileSlug: (slug: string | null) => apiPatch<{ profileSlug: string | null }>('/api/me/profile-slug', { slug }),
  /** `invite` is carried through the provider round trip for invite-only servers (#1096). */
  loginUrl: (provider: string, captcha?: string | null, invite?: string | null) => {
    const params = new URLSearchParams();
    if (captcha) params.set('captcha', captcha);
    if (invite) params.set('invite', invite);
    const qs = params.toString();
    return `${getBasePath()}/auth/${provider}/login${qs ? `?${qs}` : ''}`;
  },
  linkUrl: (provider: string) => `${getBasePath()}/auth/${provider}/link`,
  unlink: (provider: string) => apiDelete(`/auth/${provider}/unlink`),
  logout: () => apiPost<void>('/auth/logout'),
  deleteAccount: () => apiDelete('/api/me'),
};
