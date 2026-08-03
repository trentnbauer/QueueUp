import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoomSpinSession } from '@queueup/shared';
import { roomSpinApi } from '../api/rooms';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';

// Polling, not a websocket/SSE layer this still-small app doesn't otherwise need (same reasoning
// as useNotifications' poll) - but a live nudge fight needs to feel closer to real-time than a
// badge count does, so the rate flexes with what's actually happening (see pollInterval below):
// fast while a spin is in-flight and un-settled (every nudge, from any member, should reach
// everyone else quickly), a slow baseline otherwise (still catches a fellow member starting a
// fresh spin, just not urgently).
const ACTIVE_POLL_MS = 700;
const IDLE_POLL_MS = 3_000;

function queryKey(roomId: string) {
  return ['room-spin', roomId];
}

function isSettled(spin: RoomSpinSession): boolean {
  return Date.now() >= new Date(spin.settlesAt).getTime();
}

function pollInterval(spin: RoomSpinSession | null | undefined): number {
  if (spin && !isSettled(spin)) return ACTIVE_POLL_MS;
  return IDLE_POLL_MS;
}

/** A room's shared Spin the Wheel session (see RoomSpinSession) - polled while `roomId` is set so
 * every member currently viewing the room sees the same modal open/nudge/settle/close together,
 * not just whoever clicked "Pick a Game". `undefined` on the Personal Shelf (no room to share a
 * spin with); that surface runs the exact same physics entirely client-side instead (see
 * SpinWheelModal), with no server session at all. */
export function useRoomSpin(roomId: string | undefined) {
  const queryClient = useQueryClient();
  const announceUnlock = useAnnounceUnlock();
  const enabled = roomId !== undefined;

  const query = useQuery({
    queryKey: queryKey(roomId ?? ''),
    queryFn: () => roomSpinApi.get(roomId!),
    enabled,
    refetchInterval: (q) => pollInterval(q.state.data?.spin),
  });

  const setCache = (data: { spin: RoomSpinSession | null }) => {
    if (roomId) queryClient.setQueryData(queryKey(roomId), data);
  };

  const start = useMutation({
    mutationFn: () => roomSpinApi.start(roomId!),
    onSuccess: setCache,
  });

  const nudge = useMutation({
    mutationFn: (direction: 'left' | 'right') => roomSpinApi.nudge(roomId!, direction),
    onSuccess: setCache,
    // Someone else already committed/expired/settled the spin out from under this nudge - the
    // next poll will see the real state and the modal will react on its own; nothing to reconcile
    // here beyond not leaving stale cached data behind.
    onError: () => roomId && queryClient.invalidateQueries({ queryKey: queryKey(roomId) }),
  });

  const restart = useMutation({
    mutationFn: () => roomSpinApi.restart(roomId!),
    onSuccess: setCache,
  });

  const skipWait = useMutation({
    mutationFn: () => roomSpinApi.skipWait(roomId!),
    onSuccess: setCache,
  });

  // Issue #488: marks the caller ready for the waiting room's readyCount - deliberately a separate
  // mutation from the background `query` above (see roomSpinApi.ready's doc), called only from
  // SpinWheelModal's own mount effect.
  const markReady = useMutation({
    mutationFn: () => roomSpinApi.ready(roomId!),
    onSuccess: ({ spin, unlockedBadges }) => {
      setCache({ spin });
      announceUnlock(unlockedBadges);
    },
  });

  const close = useMutation({
    mutationFn: () => roomSpinApi.close(roomId!),
    onSuccess: () => setCache({ spin: null }),
  });

  return {
    spin: query.data?.spin ?? null,
    startSpin: () => start.mutateAsync(),
    nudgeSpin: (direction: 'left' | 'right') => nudge.mutateAsync(direction),
    restartSpin: () => restart.mutateAsync(),
    skipWaitSpin: () => skipWait.mutateAsync(),
    markReady: () => markReady.mutateAsync(),
    closeSpin: () => close.mutateAsync(),
    starting: start.isPending,
    nudging: nudge.isPending,
  };
}
