import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';
import { useAuth } from '../context/AuthContext';

const SUMMARY_QUERY_KEY = ['notifications', 'summary'];
const FEED_QUERY_KEY = ['notifications', 'feed'];
// Notifications aren't pushed live - a light poll keeps the SQ button's badge and the room dots
// reasonably fresh without adding a websocket/SSE layer for what's still a small, low-traffic app.
const POLL_INTERVAL_MS = 30_000;

export function useNotificationSummary() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: SUMMARY_QUERY_KEY,
    queryFn: notificationsApi.summary,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });

  return {
    totalUnread: query.data?.totalUnread ?? 0,
    unreadRoomIds: new Set((query.data?.rooms ?? []).map((r) => r.roomId)),
  };
}

export function useNotificationFeed(enabled: boolean) {
  const query = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: notificationsApi.feed,
    enabled,
  });

  return {
    notifications: query.data?.notifications ?? [],
    isLoading: query.isLoading,
  };
}

/** Returns a callback to mark every notification read - driven by an explicit user action (closing
 * the flyout, clicking away) rather than component unmount, since React 18 StrictMode double-fires
 * mount/cleanup in development and an unmount-triggered mark-read would clear the unread state
 * before the user ever saw it. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });

  return () => mutation.mutate();
}

export function useMarkRoomNotificationsRead(roomId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: notificationsApi.markRoomRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });

  return () => {
    if (roomId) mutation.mutate(roomId);
  };
}
