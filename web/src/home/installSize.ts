import { useSyncExternalStore } from 'react';
import type { Game } from '@queueup/shared';

/** Issue #1046: "fits on my disk". The most install space (GB) a game may need to be listed, 0 for no
 * limit. A per-browser preference like the card density; free disk space is not stored in My computer,
 * so the person picks the size here. */
export const INSTALL_SIZE_PRESETS_GB = [10, 25, 50, 100, 200, 500] as const;

/** Games with no known size stay listed (they are marked "size unknown"), whatever the limit. */
export function fitsInstallSize(g: Pick<Game, 'downloadSizeMb'>, maxGb: number): boolean {
  if (!maxGb) return true;
  return g.downloadSizeMb === null || g.downloadSizeMb <= maxGb * 1024;
}

export function parseInstallSize(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 100_000 ? n : 0;
}

const STORAGE_KEY = 'sq-max-install-gb';
const listeners = new Set<() => void>();

function read(): number {
  try {
    return parseInstallSize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 0; // storage blocked - no limit
  }
}

let current = read();

export function setMaxInstallGb(gb: number) {
  current = gb > 0 ? gb : 0;
  try {
    if (current) localStorage.setItem(STORAGE_KEY, String(current));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked - the limit just will not persist */
  }
  listeners.forEach((l) => l());
}

export function useMaxInstallGb(): [number, (gb: number) => void] {
  const gb = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 0,
  );
  return [gb, setMaxInstallGb];
}
