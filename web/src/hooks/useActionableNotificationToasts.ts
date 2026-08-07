import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { notificationsApi } from '../api/notifications';
import { gamesApi } from '../api/games';

const POLL_INTERVAL_MS = 30_000;

/** Bridges the notification feed to bottom-right toasts (issue #554, built on #553's
 * infrastructure) for notification types that carry an action - currently just
 * `playtime_mark_playing`. Mounted once at the app root (see App.tsx) so a toast can appear
 * regardless of which view is on screen, not just when the notification flyout happens to be
 * open. Shares the same `['notifications', 'feed']` query key as the flyout's own
 * useNotificationFeed - this hook's always-on 30s poll keeps that cache warm for both, rather than
 * the two independently fetching the same endpoint. */
export function useActionableNotificationToasts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications', 'feed'],
    queryFn: notificationsApi.feed,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'summary'] });
    },
  });

  const markPlaying = useMutation({
    mutationFn: (gameId: string) => gamesApi.updateStatus(gameId, { status: 'playing' }),
    onSuccess: () => {
      // Broad invalidation, same as useGames' own status mutation - a shelf/room game list
      // wherever this game happens to be shown should reflect the new status.
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  useEffect(() => {
    for (const notification of data?.notifications ?? []) {
      if (notification.type !== 'playtime_mark_playing' || notification.gameId === null) continue;
      const gameId = notification.gameId;
      showToast({
        id: `notification-${notification.id}`,
        message: notification.message,
        actions: [{ label: 'Mark Playing', onClick: () => markPlaying.mutate(gameId) }],
        onDismiss: () => markRead.mutate(notification.id),
      });
    }
    // markRead/markPlaying are stable across renders (useMutation identity), and including them
    // would re-run this for every unrelated render of either mutation's internal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showToast]);
}
