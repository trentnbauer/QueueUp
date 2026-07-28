import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoomSpinSession } from '@queueup/shared';
import { roomSpinApi } from '../api/rooms';

// Fast enough that "shake" and a fellow member's start feel close to live, without a
// websocket/SSE layer this still-small app doesn't otherwise need (same reasoning as
// useNotifications' poll, just a much shorter interval - this drives a modal someone's actively
// watching, not a badge count).
const POLL_INTERVAL_MS = 2_500;

function queryKey(roomId: string) {
  return ['room-spin', roomId];
}

/** A room's shared Spin the Wheel session (see RoomSpinSession) - polled while `roomId` is set so
 * every member currently viewing the room sees the same modal open/reroll/close together, not just
 * whoever clicked "Pick a Game". `undefined` on the Personal Shelf (no room to share a spin with);
 * that surface keeps its own fully-local spin instead of using this hook at all. */
export function useRoomSpin(roomId: string | undefined) {
  const queryClient = useQueryClient();
  const enabled = roomId !== undefined;

  const query = useQuery({
    queryKey: queryKey(roomId ?? ''),
    queryFn: () => roomSpinApi.get(roomId!),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const setCache = (data: { spin: RoomSpinSession | null }) => {
    if (roomId) queryClient.setQueryData(queryKey(roomId), data);
  };

  const start = useMutation({
    mutationFn: () => roomSpinApi.start(roomId!),
    onSuccess: setCache,
  });

  const shake = useMutation({
    mutationFn: () => roomSpinApi.shake(roomId!),
    onSuccess: setCache,
    // Someone else already committed/expired the spin out from under this shake - the next poll
    // will see it's gone and the modal will close on its own; nothing to reconcile here beyond
    // not leaving stale cached data behind.
    onError: () => roomId && queryClient.invalidateQueries({ queryKey: queryKey(roomId) }),
  });

  const close = useMutation({
    mutationFn: () => roomSpinApi.close(roomId!),
    onSuccess: () => setCache({ spin: null }),
  });

  return {
    spin: query.data?.spin ?? null,
    startSpin: () => start.mutateAsync(),
    shakeSpin: () => shake.mutateAsync(),
    closeSpin: () => close.mutateAsync(),
    starting: start.isPending,
    shaking: shake.isPending,
  };
}
