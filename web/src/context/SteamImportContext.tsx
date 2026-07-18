import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useGames } from '../hooks/useGames';
import { useSteamImport } from '../hooks/useSteamImport';

type SteamImportContextValue = ReturnType<typeof useSteamImport>;

const SteamImportContext = createContext<SteamImportContextValue | undefined>(undefined);

/** One shared useSteamImport instance for the whole app, not one per caller. The Personal Shelf's
 * Steam import can be triggered from two places at once - the Header's re-sync button and the
 * SteamImportCard tile at the end of the shelf grid - and each used to hold its own independent
 * `busy` state, so one being mid-import didn't disable the other: a user could fire two concurrent
 * /api/games/import-steam-library requests, each snapshotting "already owned" games at its own
 * start, risking duplicate shelf rows for a game the first request was still mid-way through
 * creating. Sharing one instance here means both consumers see the same in-flight state. */
export function SteamImportProvider({ children }: { children: ReactNode }) {
  const { steamLinked } = useAuth();
  const { invalidate } = useGames(null);
  const steamImport = useSteamImport(steamLinked, invalidate);
  return <SteamImportContext.Provider value={steamImport}>{children}</SteamImportContext.Provider>;
}

export function useSteamImportContext(): SteamImportContextValue {
  const ctx = useContext(SteamImportContext);
  if (!ctx) throw new Error('useSteamImportContext must be used within a SteamImportProvider');
  return ctx;
}
