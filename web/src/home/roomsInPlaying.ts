import { useSyncExternalStore } from 'react';

// A per-browser preference (Shelf settings): list the games being played in your rooms under the shelf's Playing tab,
// after your own, as well as in the More menu's "In rooms" tab. Off by default.
const KEY = 'sq-shelf-rooms-in-playing';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setRoomsInPlaying(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked - the choice just will not persist */
  }
  listeners.forEach((l) => l());
}

export function useRoomsInPlaying(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
  return [on, setRoomsInPlaying];
}
