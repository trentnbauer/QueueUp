import { useQuery } from '@tanstack/react-query';
import { libraryLimitsApi, LIBRARY_LIMITS_QUERY_KEY } from '../api/libraryLimits';
import { useAuth } from '../context/AuthContext';

/** Which library sources are rate limiting QueueUp (issue #864). `minutesLeft(source)` is how long to
 * wait, rounded up, or null when the source is fine. Checked again every minute while any is limited,
 * so the message clears by itself once the wait is over. */
export function useLibraryLimits() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: LIBRARY_LIMITS_QUERY_KEY,
    queryFn: libraryLimitsApi.get,
    enabled: !!user,
    refetchInterval: (query) => (Object.values(query.state.data?.limits ?? {}).some(Boolean) ? 60_000 : false),
  });
  const limits = data?.limits ?? {};
  return {
    limits,
    isLimited: (source: string) => minutesLeft(limits[source]) !== null,
    minutesLeft: (source: string) => minutesLeft(limits[source]),
  };
}

function minutesLeft(until: string | null | undefined, now: number = Date.now()): number | null {
  if (!until) return null;
  const ms = Date.parse(until) - now;
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60_000)) : null;
}
