import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useToast } from '../context/ToastContext';
import { roomSpinApi } from '../api/rooms';

// Confirmed requirement (issue #555): this needs to feel near-instant, unlike the 30s notification
// poll #554 uses - a spin's pre-start waiting room only lasts SPIN_WAITING_ROOM_MS (30s, see
// roomSpin.ts), so a slow poll could easily miss the window entirely. Cheap enough to justify: the
// payload is just {spinId, roomId, roomName} per active spin, not the full session.
const POLL_INTERVAL_MS = 2_000;

function toastId(spinId: string): string {
  return `active-spin-${spinId}`;
}

/** Bridges the cross-room active-spins poll to bottom-right toasts (issue #555, built on #553's
 * infrastructure) - pulls in someone who isn't currently looking at the room a spin just started
 * in, before its pre-start waiting window closes. Mounted once at the app root (see App.tsx).
 * Deliberately its own poll, not reusing useRoomSpin's per-room one - that one only ever watches
 * whichever single room is currently open; this watches every room the caller is in, all at once,
 * off the lightweight ActiveRoomSpin payload rather than the full per-room session. No popup for
 * whoever's already viewing the room the spin started in - they get the real waiting-room UI
 * instead (see SpinWheelModal), which this would only be a noisier duplicate of. */
export function useActiveRoomSpinToasts() {
  const { user } = useAuth();
  const { view, switchView } = useView();
  const { showToast, dismissToast } = useToast();
  const previousSpinIds = useRef<Set<string>>(new Set());
  // Bug fix: without this, clicking a toast's own x just removed it from ToastContext's list -
  // nothing recorded that the person had already seen and dismissed spin S, so the very next poll
  // (2s later) found S still active, still not the room the viewer's on, and pushed the exact same
  // toast right back. Populated by the toast's own onDismiss (fired only by a real dismiss/action
  // click - see ToastStack.tsx), not by the natural-cleanup branch below, which isn't "the person
  // dismissed it," just "the spin itself is gone."
  const dismissedSpinIds = useRef<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['rooms', 'active-spins'],
    queryFn: roomSpinApi.activeSpins,
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    const spins = data?.spins ?? [];
    const currentIds = new Set(spins.map((s) => s.spinId));

    // A spin that dropped out of the list since the last poll has either started moving (its
    // waiting window closed) or been closed outright - either way, "Join" no longer means
    // anything useful, so its toast shouldn't linger waiting to be noticed. Also frees the
    // dismissed-ids entry, so a later *different* spin that happens to reuse... it can't actually
    // reuse this spinId (each spin gets a fresh one), but there's no reason to keep it around
    // forever either.
    for (const id of previousSpinIds.current) {
      if (!currentIds.has(id)) {
        dismissToast(toastId(id));
        dismissedSpinIds.current.delete(id);
      }
    }
    previousSpinIds.current = currentIds;

    for (const spin of spins) {
      if (view.type === 'room' && view.roomId === spin.roomId) continue;
      if (dismissedSpinIds.current.has(spin.spinId)) continue;
      showToast({
        id: toastId(spin.spinId),
        message: `${spin.roomName} just started a Spin the Wheel!`,
        actions: [{ label: 'Join', onClick: () => switchView({ type: 'room', roomId: spin.roomId }) }],
        onDismiss: () => dismissedSpinIds.current.add(spin.spinId),
      });
    }
    // Only `data` (the poll result) should retrigger this - view/switchView/showToast/dismissToast
    // are read fresh on each run regardless, and including them would just mean re-running on
    // every unrelated render of any of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
