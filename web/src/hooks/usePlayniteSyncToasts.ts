import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import { playniteImportApi, PLAYNITE_IMPORT_PROGRESS_QUERY_KEY } from '../api/playniteImport';
import { summarizePlayniteSyncCompletion } from './playniteSyncSummary';

// Not time-critical the way useActiveRoomSpinToasts' 2s poll is (a spin's waiting room closes in
// 30s; a Playnite sync just needs to feel noticed, not caught mid-window) - a Playnite import can
// also run long for a big library, so a fast poll would mostly be wasted requests.
const POLL_INTERVAL_MS = 5_000;

function startedToastId(startedAt: string): string {
  return `playnite-sync-started-${startedAt}`;
}

/** Bridges the Playnite import progress the extension writes (see routes/apiV1.ts'
 * runPlayniteImportLoop) to a "started"/"completed" toast pair (issue #583), built on #553's
 * infrastructure same as useActiveRoomSpinToasts/useActionableNotificationToasts. Mounted once at
 * the app root (see App.tsx) since the sync itself is triggered by the Playnite desktop extension
 * calling the server directly, not by anything in this browser session - without an always-on poll
 * here, nothing in the web app would ever notice a sync happened at all (the whole point of #583).
 *
 * `startedAt` (see PlayniteImportProgress) is what makes this reliable across repeat syncs of an
 * unchanged-size library: `seenStartedAtRef` only ever holds the startedAt of a run this hook has
 * itself observed still in progress (`done: false`), so it only dismisses/attributes a started
 * toast to a run this same poll loop actually watched start - not to a stale `done: true` row this
 * tab never saw begin (e.g. a sync that finished before the tab was even open, still cached within
 * the progress row's 30-minute TTL - see IMPORT_PROGRESS_TTL_SECONDS).
 *
 * The completed toast itself is tracked separately via `shownCompleteForRef`, keyed on the same
 * `startedAt`, and fires unconditionally the first time a given run's `done: true` is observed -
 * not only when a `done: false` was seen for that run first. A small/fast library (or a tab opened
 * partway through a sync) can easily finish within a single 5s poll window, so gating the completed
 * toast on having previously shown a started toast silently dropped it (issue #583 follow-up).
 * `shownCompleteForRef` is what then prevents that same completed toast from firing again on every
 * subsequent poll of the still-`done: true` row. */
export function usePlayniteSyncToasts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();
  const announceUnlock = useAnnounceUnlock();
  const seenStartedAtRef = useRef<string | null>(null);
  const shownCompleteForRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: PLAYNITE_IMPORT_PROGRESS_QUERY_KEY,
    queryFn: playniteImportApi.progress,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    const progress = data?.progress ?? null;
    if (!progress) return;

    if (!progress.done && seenStartedAtRef.current !== progress.startedAt) {
      seenStartedAtRef.current = progress.startedAt;
      showToast({
        id: startedToastId(progress.startedAt),
        message: 'Playnite library sync started - this can take a bit for a big library.',
        actions: [],
      });
      return;
    }

    if (progress.done && shownCompleteForRef.current !== progress.startedAt) {
      shownCompleteForRef.current = progress.startedAt;
      if (seenStartedAtRef.current === progress.startedAt) {
        seenStartedAtRef.current = null;
        dismissToast(startedToastId(progress.startedAt));
      }
      showToast({
        id: `playnite-sync-complete-${progress.startedAt}`,
        message: summarizePlayniteSyncCompletion(progress),
        actions: progress.unmatched > 0 ? [{ label: 'Review', onClick: () => navigate('/review') }] : [],
      });
      if (progress.unlockedBadges) announceUnlock(progress.unlockedBadges);
    }
    // Only `data` (the poll result) should retrigger this - navigate/showToast/dismissToast/
    // announceUnlock are read fresh on each run regardless, same reasoning as
    // useActiveRoomSpinToasts' identical exclusion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
