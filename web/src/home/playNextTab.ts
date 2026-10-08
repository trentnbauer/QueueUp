import { useSyncExternalStore } from 'react';

/** Which tab holds Play next games: Playing (the default, under what you're playing) or the
 * Backlog / room Queue (pinned to the top of it). */
export type PlayNextTab = 'playing' | 'backlog';

// A per-browser preference, like the Backlog sort: one for the shelf (Shelf settings) and one per room
// (Room settings), so a room's choice doesn't change your other rooms or anyone else's view.
const keyFor = (roomId: string | null) => (roomId ? `sq-room-play-next-tab:${roomId}` : 'sq-shelf-play-next-tab');
const listeners = new Set<() => void>();

function read(roomId: string | null): PlayNextTab {
  try {
    return localStorage.getItem(keyFor(roomId)) === 'backlog' ? 'backlog' : 'playing';
  } catch {
    return 'playing';
  }
}

export function setPlayNextTab(roomId: string | null, tab: PlayNextTab) {
  try {
    localStorage.setItem(keyFor(roomId), tab);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** The Play next tab for a room, or for the shelf when `roomId` is null. */
export function usePlayNextTab(roomId: string | null = null): [PlayNextTab, (tab: PlayNextTab) => void] {
  const tab = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(roomId),
    () => 'playing' as PlayNextTab,
  );
  return [tab, (next: PlayNextTab) => setPlayNextTab(roomId, next)];
}
