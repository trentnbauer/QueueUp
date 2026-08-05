import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RoomPlatform, User } from '@queueup/shared';
import { authApi } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  steamLinked: boolean;
  /** The systems the user has ticked as "owned" on their Personal Shelf. Empty means no opt-in
   * yet, i.e. the add-game flow there shows everything (server enforces this too - this is just
   * the display copy of the same preference). */
  ownedPlatforms: RoomPlatform[];
  /** Whether the /u/:id public profile page (issue #511) is currently reachable for this account -
   * off by default. Display copy of the same server-side preference (User.publicProfileEnabled). */
  publicProfileEnabled: boolean;
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
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [steamLinked, setSteamLinked] = useState(false);
  const [ownedPlatforms, setOwnedPlatforms] = useState<RoomPlatform[]>([]);
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(false);
  const [primaryProvider, setPrimaryProvider] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    const { user, steamLinked, ownedPlatforms, publicProfileEnabled, primaryProvider, linkedProviders, isNewAccount } = await authApi.me();
    setUser(user);
    setSteamLinked(steamLinked);
    setOwnedPlatforms(ownedPlatforms ?? []);
    setPublicProfileEnabled(publicProfileEnabled);
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
        steamLinked,
        ownedPlatforms,
        publicProfileEnabled,
        primaryProvider,
        linkedProviders,
        isNewAccount,
        consumeIsNewAccount: () => setIsNewAccount(false),
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
