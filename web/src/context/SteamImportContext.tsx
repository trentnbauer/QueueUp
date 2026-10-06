import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useGames } from '../hooks/useGames';
import { useSteamImport } from '../hooks/useSteamImport';
import { useSteamCompletionsSync } from '../hooks/useSteamCompletionsSync';

/** One shared useSteamImport instance for the whole app, not one per caller. The Personal Shelf's
 * Steam import can be triggered from more than one place at once - the header's Import Library
 * modal (issue #359) and the Sidebar's notification bell/flyout, which surface the same in-flight
 * state rather than running their own import - and each used to hold its own independent `busy`
 * state, so one being mid-import didn't disable the other: a user could fire two concurrent
 * /api/games/import-steam-library requests, each snapshotting "already owned" games at its own
 * start, risking duplicate shelf rows for a game the first request was still mid-way through
 * creating. Sharing one instance here means every consumer sees the same in-flight state.
 *
 * Also shares one useSteamCompletionsSync instance (`completions`) for the same reason, and adds
 * `runSyncEverything`/`runSyncLibraryAndWishlist` orchestrators (issue #359's "ensure resync does
 * all future libraries and achievements") - chaining is possible because useSteamImport's
 * runImport/runWishlistImport now resolve only once their background job is actually done, not
 * just once the "started" POST resolves. */
export function SteamImportProvider({ children }: { children: ReactNode }) {
  const { steamLinked } = useAuth();
  const { invalidate } = useGames(null);
  const steamImport = useSteamImport(steamLinked, invalidate);
  const completions = useSteamCompletionsSync();
  // Guards against the auto-login effect and a manual "Sync Everything" click overlapping -
  // runImport/runWishlistImport already no-op while already polling, but completions.scan() has
  // no such guard of its own since it was never shared/re-entrant before this. The ref is the
  // actual reentrancy guard (checked synchronously, no stale-closure risk); the mirrored state
  // exists purely so callers (the "Sync Everything" button) can disable themselves and show
  // something's already running, instead of silently no-op'ing when the auto-login sync below is
  // still mid-flight.
  const syncingEverythingRef = useRef(false);
  const [syncingEverything, setSyncingEverything] = useState(false);

  function beginSyncingEverything(): boolean {
    if (syncingEverythingRef.current) return false;
    syncingEverythingRef.current = true;
    setSyncingEverything(true);
    return true;
  }

  function endSyncingEverything() {
    syncingEverythingRef.current = false;
    setSyncingEverything(false);
  }

  async function runSyncLibraryAndWishlist(): Promise<void> {
    await steamImport.runImport();
    // Keep the library's result on screen: the wishlist's message is added under it, not over it.
    await steamImport.runWishlistImport({ keepResult: true });
  }

  async function runSyncEverything(): Promise<void> {
    if (!beginSyncingEverything()) return;
    try {
      await runSyncLibraryAndWishlist();
      await completions.scan();
    } finally {
      endSyncingEverything();
    }
  }

  return (
    <SteamImportContext.Provider
      value={{ ...steamImport, completions, runSyncLibraryAndWishlist, runSyncEverything, syncingEverything }}
    >
      {children}
    </SteamImportContext.Provider>
  );
}

type SteamImportContextValue = ReturnType<typeof useSteamImport> & {
  completions: ReturnType<typeof useSteamCompletionsSync>;
  runSyncLibraryAndWishlist: () => Promise<void>;
  runSyncEverything: () => Promise<void>;
  /** True while a "Sync Everything" run is in flight, whether triggered by the header's button or
   * the once-per-session auto-login sync - lets a caller disable its own trigger with visible
   * feedback instead of silently no-op'ing (runSyncEverything itself is reentrancy-guarded). */
  syncingEverything: boolean;
};

const SteamImportContext = createContext<SteamImportContextValue | undefined>(undefined);

export function useSteamImportContext(): SteamImportContextValue {
  const ctx = useContext(SteamImportContext);
  if (!ctx) throw new Error('useSteamImportContext must be used within a SteamImportProvider');
  return ctx;
}
