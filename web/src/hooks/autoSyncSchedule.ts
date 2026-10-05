/** When the app last synced the person's libraries and achievements on its own (issue #853), kept in
 * localStorage so tabs opened together share it and a reload doesn't re-trigger a sync. */
const LIBRARIES_KEY = 'queueup-last-auto-sync';
const ACHIEVEMENTS_KEY = 'queueup-last-auto-achievements-sync';

/** Libraries: at most once an hour. This is also what the Steam-only login sync used (issue #359). */
export const LIBRARIES_MIN_INTERVAL_MS = 60 * 60 * 1000;
/** Achievements: at most twice a day. The Steam scan is the priciest step (two Steam API calls per
 * candidate) and has a tight hourly limit, so showing up must not burn through it. */
export const ACHIEVEMENTS_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type AutoSyncKind = 'libraries' | 'achievements';

const KEYS: Record<AutoSyncKind, string> = { libraries: LIBRARIES_KEY, achievements: ACHIEVEMENTS_KEY };
const INTERVALS: Record<AutoSyncKind, number> = { libraries: LIBRARIES_MIN_INTERVAL_MS, achievements: ACHIEVEMENTS_MIN_INTERVAL_MS };

/** Whether enough time has passed since `last` (0 when it never ran) to run again. A last-run time in
 * the future (a clock change) counts as due, so a wrong clock can't switch syncing off for good. */
export function autoSyncDue(now: number, last: number, minIntervalMs: number): boolean {
  if (last > now) return true;
  return now - last >= minIntervalMs;
}

function readLast(kind: AutoSyncKind): number {
  try {
    return Number(localStorage.getItem(KEYS[kind])) || 0;
  } catch {
    return 0;
  }
}

export function isAutoSyncDue(kind: AutoSyncKind, now = Date.now()): boolean {
  return autoSyncDue(now, readLast(kind), INTERVALS[kind]);
}

/** Stamped before the sync starts, so tabs opened together don't all fire at once. */
export function markAutoSynced(kind: AutoSyncKind, now = Date.now()): void {
  try {
    localStorage.setItem(KEYS[kind], String(now));
  } catch {
    /* storage blocked - auto-sync just isn't throttled across tabs */
  }
}
