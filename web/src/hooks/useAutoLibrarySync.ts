import { useEffect, useRef } from 'react';
import { useSyncSources } from './useSyncSources';
import { isAutoSyncDue, markAutoSynced } from './autoSyncSchedule';

/** Syncs the person's linked libraries, and checks their achievements, on its own (issue #853): when
 * they open QueueUp, and again when they come back to the tab after a while. How often is limited by
 * autoSyncSchedule, shared across tabs. Sources that are rate limiting QueueUp are skipped by
 * syncLibraries, and a failing source is reported in the person's notifications by the server, so
 * nothing needs showing here. Mounted inside SteamImportProvider (see App.tsx). */
export function useAutoLibrarySync() {
  const sync = useSyncSources();
  const running = useRef(false);
  // The listeners below outlive any one render, so they call whatever the latest one set up.
  const latest = useRef<() => void>(() => {});

  latest.current = () => {
    if (running.current || sync.busy || !sync.hasLinked) return;
    const libraries = isAutoSyncDue('libraries');
    const achievements = sync.hasAchievementSource && isAutoSyncDue('achievements');
    if (!libraries && !achievements) return;
    running.current = true;
    if (libraries) markAutoSynced('libraries');
    if (achievements) markAutoSynced('achievements');
    void (async () => {
      try {
        if (libraries) await sync.syncLibraries();
        if (achievements) await sync.syncAchievements();
      } catch {
        // The server already told the person about a failed source.
      } finally {
        running.current = false;
      }
    })();
  };

  // Once the linked sources are known (their status queries have loaded), and again if that changes.
  useEffect(() => {
    latest.current();
  }, [sync.hasLinked, sync.hasAchievementSource]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}

/** Renders nothing; exists so the hook can be mounted below SteamImportProvider. */
export function AutoLibrarySync() {
  useAutoLibrarySync();
  return null;
}
