import { useState } from 'react';
import type { SteamCompletionsSyncResult } from '@queueup/shared';
import { gamesApi } from '../api/games';

/** Drives the "Sync completions from Steam" tile (issue #244) - a single scan-and-review flow, not
 * shared across multiple trigger points the way useSteamImport is (see SteamImportContext), since
 * this only ever runs from the one shelf tile. `result` holds the last scan's candidates until the
 * caller dismisses/closes the review modal (see `reset`); it doesn't persist anything - the games
 * it applies Done to go through the caller's own bulkUpdateStatus (useGames), not this hook. */
export function useSteamCompletionsSync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SteamCompletionsSyncResult | null>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await gamesApi.syncSteamCompletions();
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync completions from Steam');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { busy, error, result, scan, reset };
}
