import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';

// Same cadence as useNotificationSummary's poll - light enough to keep the sidebar badge
// reasonably fresh without a websocket/SSE layer for what's still a small, low-traffic app.
const POLL_INTERVAL_MS = 30_000;

/** Backs the sidebar's Needs Review badge (issue: the review queue used to live silently inside
 * Profile Settings with no indication anywhere else that anything was waiting) - just the count,
 * polled independently of NeedsReviewView's own query so the badge stays current even while
 * sitting on a completely different page. Same query key as NeedsReviewView's own useQuery, so
 * react-query dedupes the two into one shared cache entry/request rather than polling twice. */
export function usePendingImportsCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: PENDING_IMPORTS_QUERY_KEY,
    queryFn: pendingImportsApi.list,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });
  return data?.pending.length ?? 0;
}
