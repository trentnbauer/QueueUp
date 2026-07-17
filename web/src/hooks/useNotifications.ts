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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: notificationsApi.feed,
    enabled,
  });

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUMMARY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });

  return {
    notifications: query.data?.notifications ?? [],
    isLoading: query.isLoading,
    markAllRead,
  };
}

export function useMarkRoomNotificationsRead(roomId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRoomRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUMMARY_QUERY_KEY });
    },
  });

  return () => {
    if (roomId) mutation.mutate(roomId);
  };
}
