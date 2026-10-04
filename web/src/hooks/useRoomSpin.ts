import { useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoomSpinSession, SpinPlayAction } from '@queueup/shared';
import { roomSpinApi, type SpinFilters } from '../api/rooms';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';

// Polling, not a websocket/SSE layer this still-small app doesn't otherwise need (same reasoning
// as useNotifications' poll) - but a live spin needs to feel closer to real-time than a badge
// count does, so the rate flexes with what's actually happening (see pollInterval below): fast
// while a spin is in-flight and un-settled (a voted respin, from any member, should reach everyone
// else quickly), a slow baseline otherwise (still catches a fellow member starting a
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
 * every member currently viewing the room sees the same modal open/settle/respin/close together,
 * not just whoever clicked "Pick a Game". `undefined` on the Personal Shelf (no room to share a
 * spin with); that surface runs the exact same physics entirely client-side instead (see
 * SpinWheelModal), with no server session at all. */
export function useRoomSpin(roomId: string | undefined) {
  const queryClient = useQueryClient();
  const announceUnlock = useAnnounceUnlock();
  const enabled = roomId !== undefined;

  const query = useQuery({
    queryKey: queryKey(roomId ?? ''),
    // Sends back the strip it already has, so a poll only carries the strip's games when they change.
    queryFn: async () => {
      const prev = queryClient.getQueryData<{ spin: RoomSpinSession | null }>(queryKey(roomId!))?.spin;
      const res = await roomSpinApi.get(roomId!, prev && prev.strip.length ? prev.stripKey : undefined);
      if (res.spin?.stripOmitted && prev) return { spin: { ...res.spin, strip: prev.strip } };
      return res;
    },
    enabled,
    refetchInterval: (q) => pollInterval(q.state.data?.spin),
  });

  const setCache = (data: { spin: RoomSpinSession | null }) => {
    if (roomId) queryClient.setQueryData(queryKey(roomId), data);
  };

  // Server clock minus ours, from the latest response: spin modes timestamp everything on the
  // server's clock, so timers and animations line up for everyone whatever their own clock says.
  // Each response's estimate includes its own network delay, so it's smoothed rather than taken
  // as-is - otherwise timers and the claw would jitter by the latency on every poll. A big jump
  // (the device's clock changed) is taken straight away.
  const serverNow = query.data?.spin?.serverNow;
  const offsetRef = useRef<number | null>(null);
  const clockOffset = useMemo(() => {
    if (!serverNow) return offsetRef.current ?? 0;
    const sample = new Date(serverNow).getTime() - Date.now();
    const prev = offsetRef.current;
    const next = prev === null || Math.abs(sample - prev) > 2000 ? sample : Math.round(prev * 0.85 + sample * 0.15);
    offsetRef.current = next;
    return next;
  }, [serverNow]);

  const act = useMutation({
    mutationFn: (action: SpinPlayAction) => roomSpinApi.action(roomId!, action),
    onSuccess: setCache,
    onError: () => roomId && queryClient.invalidateQueries({ queryKey: queryKey(roomId) }),
  });

  const start = useMutation({
    mutationFn: (filters?: SpinFilters) => roomSpinApi.start(roomId!, filters),
    onSuccess: setCache,
  });

  const respinVote = useMutation({
    mutationFn: () => roomSpinApi.respinVote(roomId!),
    onSuccess: setCache,
    onError: () => roomId && queryClient.invalidateQueries({ queryKey: queryKey(roomId) }),
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
    startSpin: (filters?: SpinFilters) => start.mutateAsync(filters),
    voteRespin: () => respinVote.mutateAsync(),
    act: (action: SpinPlayAction) => act.mutateAsync(action),
    clockOffset,
    skipWaitSpin: () => skipWait.mutateAsync(),
    markReady: () => markReady.mutateAsync(),
    closeSpin: () => close.mutateAsync(),
    starting: start.isPending,
    votingRespin: respinVote.isPending,
  };
}
