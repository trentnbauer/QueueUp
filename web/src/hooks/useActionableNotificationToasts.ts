import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { useUi } from '../context/UiContext';
import { useToast } from '../context/ToastContext';
import { notificationsApi } from '../api/notifications';
import { gamesApi } from '../api/games';
import { apiPost } from '../api/client';

const POLL_INTERVAL_MS = 30_000;

/** Bridges the notification feed to bottom-right toasts (issue #554, built on #553's
 * infrastructure) for notification types that carry an action - `playtime_mark_playing` (its own
 * Mark Playing action) and `price_drop` (issue #563 - a View action, jumping to the room/Personal
 * Shelf the game's in, same navigation NotificationFlyout.tsx's own room-scoped Link already
 * offers). Mounted once at the app root (see App.tsx) so a toast can appear regardless of which
 * view is on screen, not just when the notification flyout happens to be open. Shares the same
 * `['notifications', 'feed']` query key as the flyout's own useNotificationFeed - this hook's
 * always-on 30s poll keeps that cache warm for both, rather than the two independently fetching
 * the same endpoint. */
export function useActionableNotificationToasts() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const ui = useUi();
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
      // A sync found games on a console the person had unticked: ask before adding it back.
      if (notification.type === 'platform_unowned' && notification.platform && !notification.read) {
        const platform = notification.platform;
        const answer = async (add: boolean) => {
          try {
            await apiPost(`/api/me/owned-platforms/${platform}/answer`, { add });
          } catch (err) {
            ui.showError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
            throw err;
          }
          queryClient.invalidateQueries({ queryKey: ['notifications', 'feed'] });
          queryClient.invalidateQueries({ queryKey: ['notifications', 'summary'] });
          if (add) void refetch();
        };
        showToast({
          id: `notification-${notification.id}`,
          message: notification.message,
          actions: [
            { label: 'Yes, add it', onClick: () => answer(true) },
            { label: 'No', onClick: () => answer(false) },
          ],
          onDismiss: () => markRead.mutate(notification.id),
        });
        continue;
      }
      // A friend recommended a game (#808) you don't have yet: find it in Add Game.
      if (notification.type === 'friend_recommendation' && notification.gameId === null && !notification.read) {
        const title = /"(.+)"/.exec(notification.message)?.[1];
        showToast({
          id: `notification-${notification.id}`,
          message: notification.message,
          actions: title ? [{ label: 'Find it', onClick: () => ui.openDialog('add', { query: title }) }] : [],
          onDismiss: () => markRead.mutate(notification.id),
        });
        continue;
      }
      if (notification.gameId === null) continue;
      const gameId = notification.gameId;

      // Jump to the room/Personal Shelf the game's in and open its card (clicking the toast text, or
      // View, both do this).
      const openGame = () => {
        navigate(notification.roomId ? `/room/${notification.roomId}` : '/');
        ui.selectGame(gameId);
      };

      if (notification.type === 'playtime_mark_playing') {
        showToast({
          onOpen: openGame,
          id: `notification-${notification.id}`,
          message: notification.message,
          // mutateAsync (not the fire-and-forget mutate) so ToastStack's action handler can await
          // it and only dismiss the toast on actual success - see ToastStack.tsx's bug-fix comment.
          actions: [{ label: 'Mark Playing', onClick: () => markPlaying.mutateAsync(gameId) }],
          onDismiss: () => markRead.mutate(notification.id),
        });
      } else if (notification.type === 'room_game_beaten') {
        // Another member beat a room game: review it, and mark it Beaten on your own shelf (the
        // review sheet does the shelf sync once it's saved or skipped, so the review goes with it).
        showToast({
          id: `notification-${notification.id}`,
          message: notification.message,
          onOpen: openGame,
          actions: [
            {
              label: 'Review it',
              onClick: () => {
                openGame();
                ui.openDialog('review', { gameId, syncShelf: true });
              },
            },
            {
              label: 'Mark Beaten',
              onClick: async () => {
                try {
                  await gamesApi.syncShelfBeaten(gameId);
                } catch (err) {
                  ui.showError(err instanceof Error ? err.message : "Couldn't update your shelf. Try again.");
                  throw err;
                }
                void queryClient.invalidateQueries({ queryKey: ['games'] });
                ui.notify('Marked Beaten on your shelf');
              },
            },
          ],
          onDismiss: () => markRead.mutate(notification.id),
        });
      } else if (notification.type === 'friend_recommendation' && !notification.read) {
        showToast({
          id: `notification-${notification.id}`,
          message: notification.message,
          onOpen: openGame,
          actions: [{ label: 'View', onClick: openGame }],
          onDismiss: () => markRead.mutate(notification.id),
        });
      } else if (notification.type === 'price_drop') {
        showToast({
          id: `notification-${notification.id}`,
          message: notification.message,
          onOpen: openGame,
          actions: [{ label: 'View', onClick: openGame }],
          onDismiss: () => markRead.mutate(notification.id),
        });
      }
    }
    // markRead/markPlaying/switchView are stable across renders (useMutation identity /
    // useState setter), and including them would re-run this for every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showToast]);
}
