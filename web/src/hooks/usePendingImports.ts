import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { DUPLICATE_COUNT_QUERY_KEY, gamesApi } from '../api/games';

// Same cadence as useNotificationSummary's poll - light enough to keep the sidebar badge
// reasonably fresh without a websocket/SSE layer for what's still a small, low-traffic app.
const POLL_INTERVAL_MS = 30_000;

/** Backs the sidebar's Needs Review badge (issue: the review queue used to live silently inside
 * Profile Settings with no indication anywhere else that anything was waiting) - just the count,
 * polled independently of NeedsReviewView's own query so the badge stays current even while
 * sitting on a completely different page. Polls a count-only endpoint rather than the full review
 * list (with its match suggestions), which only NeedsReviewView fetches. */
export function usePendingImportsCount(): number {
  const { user } = useAuth();
  // Under the list's key, so anything that invalidates the list refreshes the count too.
  const { data } = useQuery({
    queryKey: [...PENDING_IMPORTS_QUERY_KEY, 'count'],
    queryFn: pendingImportsApi.count,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });
  return data?.count ?? 0;
}

/** "Library items to tidy up": synced titles waiting for a match plus possible duplicate cards. The
 * duplicates only count once AI is set up, since the AI is what judges and merges them. Backs the
 * Settings › Libraries badge. */
export function useLibraryCleanupCount(): { pending: number; duplicates: number; total: number } {
  const { user } = useAuth();
  const pending = usePendingImportsCount();
  const aiSettings = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine, enabled: !!user });
  const aiReady = !!aiSettings.data && aiSettings.data.effectiveSource !== 'none';
  const { data } = useQuery({ queryKey: DUPLICATE_COUNT_QUERY_KEY, queryFn: gamesApi.duplicateCandidateCount, enabled: !!user && aiReady, staleTime: 10 * 60_000 });
  const duplicates = aiReady ? (data?.count ?? 0) : 0;
  return { pending, duplicates, total: pending + duplicates };
}
