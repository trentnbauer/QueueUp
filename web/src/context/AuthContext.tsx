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
  /** The provider this account originally signed up with - always linked, and the only one the
   * "Linked accounts" UI won't offer to unlink. */
  primaryProvider: string | null;
  /** Every provider this account can currently sign in with, primaryProvider included. */
  linkedProviders: string[];
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [steamLinked, setSteamLinked] = useState(false);
  const [ownedPlatforms, setOwnedPlatforms] = useState<RoomPlatform[]>([]);
  const [primaryProvider, setPrimaryProvider] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    const { user, steamLinked, ownedPlatforms, primaryProvider, linkedProviders } = await authApi.me();
    setUser(user);
    setSteamLinked(steamLinked);
    setOwnedPlatforms(ownedPlatforms ?? []);
    setPrimaryProvider(primaryProvider);
    setLinkedProviders(linkedProviders ?? []);
  };

  useEffect(() => {
    refetch().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, steamLinked, ownedPlatforms, primaryProvider, linkedProviders, loading, refetch }}
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
