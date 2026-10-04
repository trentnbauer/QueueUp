import { useSyncExternalStore } from 'react';
import { normalizeSpinTheme, type SpinWheelTheme } from '@queueup/shared';

// The Personal Shelf's Spin type (rooms keep theirs on the room). Kept in this browser, read by the
// spin dialog and changed in Shelf settings.
const STORAGE_KEY = 'sq-shelf-spin-theme';
const listeners = new Set<() => void>();

function read(): SpinWheelTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSpinTheme(raw) : 'reel';
  } catch {
    return 'reel';
  }
}

export function setShelfSpinTheme(theme: SpinWheelTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useShelfSpinTheme(): [SpinWheelTheme, (theme: SpinWheelTheme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'reel' as SpinWheelTheme,
  );
  return [theme, setShelfSpinTheme];
}
