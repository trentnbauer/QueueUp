import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProfileVisibility, RoomPlatform, User } from '@queueup/shared';
import { authApi } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  /** A Super administrator (#1102): an administrator who can also do the destructive things. */
  isSuperAdmin: boolean;
  /** Set while an administrator is viewing the app as `user` (#1102), read-only. */
  viewingAs: { until: string; viewer: User } | null;
  steamLinked: boolean;
  /** The systems the user has ticked as "owned" on their Personal Shelf. Empty means no opt-in
   * yet, i.e. the add-game flow there shows everything (server enforces this too - this is just
   * the display copy of the same preference). */
  ownedPlatforms: RoomPlatform[];
  /** Who can open this account's /u/:id profile page. Display copy of User.profileVisibility. */
  profileVisibility: ProfileVisibility;
  /** Vanity name for the public profile URL (/u/<slug>), or null to use the user id. */
  profileSlug: string | null;
  /** The colour that tints the Personal Shelf (#rrggbb), or null for the default look. */
  shelfColor: string | null;
  /** The provider this account originally signed up with - always linked, and the only one the
   * "Linked accounts" UI won't offer to unlink. */
  primaryProvider: string | null;
  /** Every provider this account can currently sign in with, primaryProvider included. */
  linkedProviders: string[];
  /** True exactly once, right after this account's very first sign-in (issue #359) - see
   * authApi.me's doc comment. Consumed (reset to false) by whoever reacts to it, so a re-render
   * doesn't keep re-triggering whatever "welcome, new account" behavior it drives. */
  isNewAccount: boolean;
  /** Clears isNewAccount once its one-time reaction has fired (currently: auto-opening the Import
   * Library modal in Header). Calling refetch() again would also naturally clear it (the server
   * only ever sends true once per account), but this lets the frontend clear it immediately
   * without a round trip. */
  consumeIsNewAccount: () => void;
  /** True until this account has finished or skipped the welcome walkthrough on any device. */
  onboardingPending: boolean;
  /** Records the walkthrough as done on the account, so a new browser or device doesn't repeat it. */
  completeOnboarding: () => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [viewingAs, setViewingAs] = useState<AuthContextValue['viewingAs']>(null);
  const [steamLinked, setSteamLinked] = useState(false);
  const [ownedPlatforms, setOwnedPlatforms] = useState<RoomPlatform[]>([]);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('public');
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [shelfColor, setShelfColor] = useState<string | null>(null);
  const [primaryProvider, setPrimaryProvider] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const completeOnboarding = () => {
    setOnboardingPending(false);
    // Best effort: if this fails the walkthrough simply shows once more on the next load.
    void authApi.completeOnboarding().catch(() => {});
  };

  const refetch = async () => {
    const { user, isSuperAdmin, viewingAs, steamLinked, ownedPlatforms, profileVisibility, profileSlug, shelfColor, primaryProvider, linkedProviders, isNewAccount, onboardingPending } = await authApi.me();
    setOnboardingPending(!!onboardingPending);
    setUser(user);
    setIsSuperAdmin(!!isSuperAdmin);
    setViewingAs(viewingAs ?? null);
    setSteamLinked(steamLinked);
    setOwnedPlatforms(ownedPlatforms ?? []);
    setProfileVisibility(profileVisibility ?? 'public');
    setProfileSlug(profileSlug ?? null);
    setShelfColor(shelfColor ?? null);
    setPrimaryProvider(primaryProvider);
    setLinkedProviders(linkedProviders ?? []);
    if (isNewAccount) setIsNewAccount(true);
  };

  useEffect(() => {
    refetch().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isSuperAdmin,
        viewingAs,
        steamLinked,
        ownedPlatforms,
        profileVisibility,
        profileSlug,
        shelfColor,
        primaryProvider,
        linkedProviders,
        isNewAccount,
        consumeIsNewAccount: () => setIsNewAccount(false),
        onboardingPending,
        completeOnboarding,
        loading,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
