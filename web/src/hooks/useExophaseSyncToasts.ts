import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EXOPHASE_STATUS_QUERY_KEY, exophaseApi } from '../api/exophase';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useToast } from '../context/ToastContext';
import { useUi } from '../context/UiContext';
import { t } from '../i18n';

const POLL_INTERVAL_MS = 2_000;

/** Set to true when an Exophase sync is started from the dialog (issue #844). The dialog closes right
 * away, so the sync is watched from here instead of from inside it. */
export const EXOPHASE_SYNC_WATCH_QUERY_KEY = ['exophase', 'sync-watch'] as const;

/** Follows an Exophase sync after the dialog has closed (issue #844): polls its progress and shows
 * a toast when it finishes, so the person can keep using QueueUp meanwhile. Mounted once at the app
 * root, same shape as usePlayniteSyncToasts. */
export function useExophaseSyncToasts() {
  const queryClient = useQueryClient();
  const ui = useUi();
  const { showToast } = useToast();
  const lastShown = useRef<string | null>(null);

  const { data: watching } = useQuery({
    queryKey: EXOPHASE_SYNC_WATCH_QUERY_KEY,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const { data } = useQuery({
    queryKey: ['exophase', 'sync-watch-progress'],
    queryFn: exophaseApi.progress,
    enabled: watching,
    refetchInterval: POLL_INTERVAL_MS,
    gcTime: 0,
  });

  useEffect(() => {
    const progress = data?.progress ?? null;
    if (!watching || !progress || !progress.done || lastShown.current === progress.startedAt) return;
    lastShown.current = progress.startedAt;
    queryClient.setQueryData(EXOPHASE_SYNC_WATCH_QUERY_KEY, false);
    void queryClient.invalidateQueries({ queryKey: EXOPHASE_STATUS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['games'] });
    void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
    showToast({
      id: `exophase-sync-complete-${progress.startedAt}`,
      message: t('settings.exophase.syncDone', { matched: progress.matched, unmatched: progress.unmatched }),
      actions: progress.unmatched > 0 ? [{ label: t('add.playnite.review'), onClick: () => ui.openDialog('needsReview') }] : [],
    });
    // Only the poll result should retrigger this, same exclusion as usePlayniteSyncToasts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, watching]);
}
