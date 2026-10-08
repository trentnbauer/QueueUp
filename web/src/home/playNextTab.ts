import { useSyncExternalStore } from 'react';

/** Which shelf tab holds Play next games: Playing (the default, under what you're playing) or Backlog
 * (pinned to the top of it). */
export type PlayNextTab = 'playing' | 'backlog';

// A per-browser preference, like the Backlog sort. Read by the shelf and changed in Shelf settings.
const STORAGE_KEY = 'sq-shelf-play-next-tab';
const listeners = new Set<() => void>();

function read(): PlayNextTab {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'backlog' ? 'backlog' : 'playing';
  } catch {
    return 'playing';
  }
}

export function setPlayNextTab(tab: PlayNextTab) {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePlayNextTab(): [PlayNextTab, (tab: PlayNextTab) => void] {
  const tab = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'playing' as PlayNextTab,
  );
  return [tab, setPlayNextTab];
}
