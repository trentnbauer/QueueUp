import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@squadqueue/shared';
import { authApi } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  steamLinked: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [steamLinked, setSteamLinked] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    const { user, steamLinked } = await authApi.me();
    setUser(user);
    setSteamLinked(steamLinked);
  };

  useEffect(() => {
    refetch().finally(() => setLoading(false));
  }, []);

  return <AuthContext.Provider value={{ user, steamLinked, loading, refetch }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
