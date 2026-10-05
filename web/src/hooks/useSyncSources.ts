import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibrarySyncProgress } from '@queueup/shared';
import { exophaseApi, EXOPHASE_STATUS_QUERY_KEY } from '../api/exophase';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { psnApi, PSN_STATUS_QUERY_KEY } from '../api/psn';
import { retroAchievementsApi, RETROACHIEVEMENTS_STATUS_QUERY_KEY } from '../api/retroachievements';
import { xboxApi, XBOX_STATUS_QUERY_KEY } from '../api/xbox';
import { useAuth } from '../context/AuthContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { useLibraryLimits } from './useLibraryLimits';

/** One connected library. To add another, add an entry below: both settings buttons ("Sync
 * libraries" and "Sync trophies and achievements") run every linked source in one click, so nothing
 * else in the UI needs to change. Playnite is not here: it pushes from the person's desktop, so there
 * is nothing for QueueUp to start. */
interface SyncSource {
  id: string;
  label: string;
  linked: boolean;
  /** Pull in new games (and wishlist) from this source. Resolves when the sync has finished. */
  syncLibrary: () => Promise<void>;
  /** Whether this source has trophies/achievements to check at all. */
  hasAchievements: boolean;
  /** Check this source for 100%'d games / trophies and open the review dialog if any are found. */
  syncAchievements: () => Promise<void>;
}

const POLL_MS = 1500;
/** Stops waiting on a sync that never reports done (a lost progress row), well past any real library. */
const MAX_POLLS = (30 * 60 * 1000) / POLL_MS;

/** Starts a native sync (Xbox, Exophase, PlayStation) and waits for it to finish, so the sources run
 * one after another and the button stays busy for the whole sync. A failure to start throws; the
 * server also writes it to the person's notifications (see notifyLibrarySyncError). */
async function runNativeSync(start: () => Promise<unknown>, progress: () => Promise<{ progress: LibrarySyncProgress | null }>): Promise<void> {
  await start();
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const { progress: p } = await progress();
    if (p?.done) return;
  }
}

export function useSyncSources() {
  const { steamLinked } = useAuth();
  const steam = useSteamImportContext();
  const queryClient = useQueryClient();
  const ui = useUi();
  const [nativeBusy, setNativeBusy] = useState(false);
  const limits = useLibraryLimits();
  const xbox = useQuery({ queryKey: XBOX_STATUS_QUERY_KEY, queryFn: xboxApi.status });
  const exophase = useQuery({ queryKey: EXOPHASE_STATUS_QUERY_KEY, queryFn: exophaseApi.status });
  const psn = useQuery({ queryKey: PSN_STATUS_QUERY_KEY, queryFn: psnApi.status });
  const retro = useQuery({ queryKey: RETROACHIEVEMENTS_STATUS_QUERY_KEY, queryFn: retroAchievementsApi.status });

  const noAchievements = async () => undefined;
  const sources: SyncSource[] = [
    {
      id: 'steam',
      label: 'Steam',
      linked: steamLinked,
      syncLibrary: steam.runSyncLibraryAndWishlist,
      hasAchievements: true,
      syncAchievements: steam.completions.scan,
    },
    { id: 'psn', label: 'PlayStation', linked: !!psn.data?.connected, syncLibrary: () => runNativeSync(psnApi.sync, psnApi.progress), hasAchievements: false, syncAchievements: noAchievements },
    { id: 'xbox', label: 'Xbox', linked: !!xbox.data?.connected, syncLibrary: () => runNativeSync(xboxApi.sync, xboxApi.progress), hasAchievements: false, syncAchievements: noAchievements },
    { id: 'retroachievements', label: 'RetroAchievements', linked: !!retro.data?.connected, syncLibrary: () => runNativeSync(retroAchievementsApi.sync, retroAchievementsApi.progress), hasAchievements: false, syncAchievements: noAchievements },
    { id: 'exophase', label: 'Exophase', linked: !!exophase.data?.connected, syncLibrary: () => runNativeSync(exophaseApi.sync, exophaseApi.progress), hasAchievements: false, syncAchievements: noAchievements },
  ];
  const linked = sources.filter((s) => s.linked);

  /** New games, new unmatched titles, new "last synced" times, and any error notifications. */
  const refreshAfterSync = () => {
    void queryClient.invalidateQueries({ queryKey: ['games'] });
    void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: XBOX_STATUS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: EXOPHASE_STATUS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PSN_STATUS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: RETROACHIEVEMENTS_STATUS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['games', 'completion-suggestions'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return {
    /** Names of the connected sources, for button subtitles. */
    linkedLabels: linked.map((s) => s.label),
    hasLinked: linked.length > 0,
    /** Whether any connected source has trophies/achievements to check. */
    hasAchievementSource: linked.some((s) => s.hasAchievements),
    busy: steam.busy || steam.completions.busy || steam.syncingEverything || nativeBusy,
    /** Syncs every connected library, one after another. One failing doesn't stop the rest. Returns
     * the names of the ones that failed (each also lands in the person's notifications) and the ones
     * skipped because they are rate limiting QueueUp. */
    syncLibraries: async (): Promise<{ failed: string[]; skipped: string[] }> => {
      const failed: string[] = [];
      // A source that is rate limiting QueueUp is left alone rather than hit again (#864).
      const skipped = linked.filter((s) => limits.isLimited(s.id)).map((s) => s.label);
      setNativeBusy(true);
      try {
        for (const s of linked) {
          if (limits.isLimited(s.id)) continue;
          try {
            await s.syncLibrary();
          } catch {
            failed.push(s.label);
          }
        }
      } finally {
        setNativeBusy(false);
        refreshAfterSync();
      }
      return { failed, skipped };
    },
    syncAchievements: async () => {
      for (const s of linked) await s.syncAchievements();
    },
    /** Syncs one connected source (issue #859), e.g. from the Libraries dialog opened in Add game. Returns
     * 'limited' without calling the source when it is rate limiting QueueUp; a failure throws (the server
     * also writes it to the person's notifications). */
    syncOne: async (id: string): Promise<'synced' | 'limited'> => {
      const source = linked.find((s) => s.id === id);
      if (!source) throw new Error('That library is not linked');
      if (limits.isLimited(id)) return 'limited';
      setNativeBusy(true);
      try {
        await source.syncLibrary();
      } finally {
        setNativeBusy(false);
        refreshAfterSync();
      }
      return 'synced';
    },
    /** With nothing linked yet, the libraries dialog is the way in. */
    openLibraries: () => ui.openDialog('import'),
  };
}
