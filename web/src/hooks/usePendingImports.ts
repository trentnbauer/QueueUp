import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';

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
