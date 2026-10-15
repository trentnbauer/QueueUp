import { useSyncExternalStore } from 'react';

/** Whether games that are not out yet (and not out soon) sit at the bottom of the Backlog / room Queue. Off by default:
 * they sort like any other game. */

// A per-browser preference like the Play next tab: one for the shelf (Shelf settings) and one per room (Room settings).
const keyFor = (roomId: string | null) => (roomId ? `sq-room-unreleased-last:${roomId}` : 'sq-shelf-unreleased-last');
const listeners = new Set<() => void>();

function read(roomId: string | null): boolean {
  try {
    return localStorage.getItem(keyFor(roomId)) === '1';
  } catch {
    return false;
  }
}

export function setUnreleasedLast(roomId: string | null, on: boolean) {
  try {
    if (on) localStorage.setItem(keyFor(roomId), '1');
    else localStorage.removeItem(keyFor(roomId));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** The setting for a room, or for the shelf when `roomId` is null. */
export function useUnreleasedLast(roomId: string | null = null): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(roomId),
    () => false,
  );
  return [on, (next: boolean) => setUnreleasedLast(roomId, next)];
}
