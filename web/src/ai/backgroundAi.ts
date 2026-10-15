import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AiDuplicateScanResponse, AiMatchSuggestion } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY } from '../api/ai';
import { gamesApi } from '../api/games';
import { PENDING_IMPORTS_QUERY_KEY, pendingImportsApi } from '../api/pendingImports';
import { useToast } from '../context/ToastContext';
import { useUi } from '../context/UiContext';
import { isAiActivityRunning, trackAiActivity } from '../hooks/useAiActivity';
import { t } from '../i18n';

/** AI jobs that run on their own once started: the menu entry starts one, the menu closes, and the person is
 * told when it is done (with a button to the result) or why it failed. The dialogs read the result back from
 * the query cache, so opening them afterwards shows it at once. */

export const DUPLICATE_SCAN_QUERY_KEY = ['ai', 'duplicate-scan'] as const;
export const AI_MATCH_RESULT_QUERY_KEY = ['ai', 'match-result'] as const;

/** A result older than this is not shown again: the shelf has probably changed since. */
const RESULT_TTL_MS = 30 * 60_000;

interface Cached<T> {
  value: T;
  at: number;
}

export function cacheAiResult<T>(queryClient: QueryClient, key: readonly unknown[], value: T): void {
  queryClient.setQueryData<Cached<T>>(key, { value, at: Date.now() });
}

export function readAiResult<T>(queryClient: QueryClient, key: readonly unknown[]): T | null {
  const hit = queryClient.getQueryData<Cached<T>>(key);
  return hit && Date.now() - hit.at < RESULT_TTL_MS ? hit.value : null;
}

// What this browser has already told the person, so the server's own notification (sent for the same thing, for
// when nobody is looking) does not announce it a second time.
const SHOWN_FOR_MS = 5 * 60_000;
const shownErrors: { message: string; at: number }[] = [];
let reportedAt = 0;

/** A failure was shown on screen: its notification (which carries the same reason) is only marked read. */
export function noteAiErrorShown(message: string): void {
  shownErrors.push({ message, at: Date.now() });
  if (shownErrors.length > 20) shownErrors.shift();
}

export function wasShownAsAiError(notificationMessage: string): boolean {
  const now = Date.now();
  return shownErrors.some((e) => now - e.at < SHOWN_FOR_MS && notificationMessage.includes(e.message));
}

/** A finished job was announced on screen a moment ago. */
export function noteAiResultReported(): void {
  reportedAt = Date.now();
}

export function recentlyReportedAiResult(): boolean {
  return Date.now() - reportedAt < 60_000;
}

/** The whole "match" pass: asks the server a chunk at a time until every waiting title has been looked at (the server
 * auto-matches the sure ones and suggests the rest). With nothing done yet an error is thrown; part way, what the
 * earlier chunks found is kept and `stopped` says why it ended. */
export async function runAiMatchPass(onProgress?: (done: number, total: number, picks: Map<string, AiMatchSuggestion>) => void) {
  const picks = new Map<string, AiMatchSuggestion>();
  let autoMatched = 0;
  let checked = 0;
  let after: string | null = null;
  let stopped: string | null = null;
  for (;;) {
    let res;
    try {
      res = await pendingImportsApi.aiMatch(after);
    } catch (err) {
      if (checked === 0 && picks.size === 0 && autoMatched === 0) throw err;
      stopped = err instanceof Error ? err.message : t('add.review.ai.failed');
      break;
    }
    for (const s of res.suggestions) picks.set(s.id, s);
    autoMatched += res.autoMatched;
    checked += res.checked;
    onProgress?.(checked, checked + res.remaining, picks);
    if (res.stopped) stopped = res.stopped;
    if (!res.next) break;
    after = res.next;
  }
  return { picks, autoMatched, stopped };
}

/** Starts AI jobs that carry on after the menu closes. */
export function useBackgroundAi() {
  const ui = useUi();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refreshNotifications = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'feed'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'summary'] });
  }, [queryClient]);

  /** Says why a job failed (out of tokens, a provider error, the daily limit), with a way to the AI settings. */
  const failed = useCallback(
    (err: unknown, fallback: string) => {
      const message = err instanceof Error && err.message ? err.message : fallback;
      noteAiErrorShown(message);
      showToast({ id: `ai-error-${Date.now()}`, message, actions: [{ label: t('shell.toasts.aiSettings'), onClick: () => navigate('/settings/ai') }] });
      refreshNotifications();
    },
    [showToast, navigate, refreshNotifications],
  );

  const done = useCallback(
    (id: string, message: string, review?: { label: string; open: () => void }) => {
      noteAiResultReported();
      showToast({ id: `${id}-${Date.now()}`, message, onOpen: review?.open, actions: review ? [{ label: review.label, onClick: review.open }] : [] });
      refreshNotifications();
    },
    [showToast, refreshNotifications],
  );

  /** Looks for duplicate games on the shelf. The result is kept for the Find duplicates dialog. */
  const scanDuplicates = useCallback(
    (fresh = false) => {
      if (isAiActivityRunning('duplicates')) {
        ui.notify(t('ai.background.alreadyRunning'));
        return;
      }
      ui.notify(t('ai.background.duplicates.started'), undefined, 4000);
      void trackAiActivity('duplicates', () => gamesApi.aiScanDuplicates(fresh))
        .then((res: AiDuplicateScanResponse) => {
          cacheAiResult(queryClient, DUPLICATE_SCAN_QUERY_KEY, res);
          void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
          const n = res.pairs.length;
          // A scan that stopped early cannot say "no duplicates": it only says why it stopped.
          if (n > 0 || !res.stopped) {
            done(
              'ai-duplicates',
              n === 0 ? t('ai.background.duplicates.none') : t(n === 1 ? 'ai.background.duplicates.found.one' : 'ai.background.duplicates.found.other', { n }),
              n === 0 ? undefined : { label: t('shell.toasts.reviewMerges'), open: () => ui.openDialog('duplicates') },
            );
          }
          if (res.stopped) failed(new Error(res.stopped), res.stopped);
        })
        .catch((err) => failed(err, t('settings.duplicates.failed')));
    },
    [ui, queryClient, done, failed],
  );

  /** Has the AI match every title waiting from a library import. What it matched is applied; what it only suggested is kept
   * for the Match games dialog. */
  const matchImports = useCallback(() => {
    if (isAiActivityRunning('match')) {
      ui.notify(t('ai.background.alreadyRunning'));
      return;
    }
    ui.notify(t('ai.background.match.started'), undefined, 4000);
    void trackAiActivity('match', () => runAiMatchPass())
      .then(({ picks, autoMatched, stopped }) => {
        cacheAiResult(queryClient, AI_MATCH_RESULT_QUERY_KEY, [...picks.values()]);
        void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ['games'] });
        void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
        done(
          'ai-match',
          t('add.review.ai.done', { auto: autoMatched, suggested: picks.size }),
          picks.size > 0 ? { label: t('ai.background.review'), open: () => ui.openDialog('needsReview') } : undefined,
        );
        if (stopped) failed(new Error(stopped), stopped);
      })
      .catch((err) => failed(err, t('add.review.ai.failed')));
  }, [ui, queryClient, done, failed]);

  return { scanDuplicates, matchImports };
}
