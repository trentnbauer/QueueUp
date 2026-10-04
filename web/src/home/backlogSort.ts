import { useSyncExternalStore } from 'react';
import type { Game } from '@queueup/shared';
import { gameScore, isNewRelease } from '../lib/gameView';
import { t, type MessageKey } from '../i18n';

/** Issue #798: how the Personal Shelf's Backlog is ordered. Several keys can be picked; the order
 * they were picked in is their priority (first key sorts, the next breaks its ties, and so on). */
export type BacklogSortKey = 'want' | 'review' | 'release';

const sortOption = (key: BacklogSortKey, labelKey: MessageKey) => ({
  key,
  get label() {
    return t(labelKey);
  },
});

/** The sort chips, with labels in the current language. */
export const BACKLOG_SORT_OPTIONS: { key: BacklogSortKey; label: string }[] = [
  sortOption('want', 'home.sort.want'),
  sortOption('review', 'home.sort.review'),
  sortOption('release', 'home.sort.release'),
];

export const DEFAULT_BACKLOG_SORT: BacklogSortKey[] = ['want'];

/** Nulls last, whichever way the rest sorts. */
function nullsLast<T>(a: T | null, b: T | null, cmp: (a: T, b: T) => number): number | null {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(a, b);
}

/** Sortable release key: the full date when known, else just the year. */
const releaseKey = (g: Game): string | null => g.releaseDate ?? (g.releaseYear != null ? String(g.releaseYear) : null);

function compareBy(key: BacklogSortKey, a: Game, b: Game, now: number): number {
  switch (key) {
    case 'want': {
      // The original Backlog order: fresh releases (last 60 days) first, newest first, then votes.
      const na = isNewRelease(a, now);
      const nb = isNewRelease(b, now);
      if (na !== nb) return na ? -1 : 1;
      if (na && nb) {
        const d = (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
        if (d) return d;
      }
      return gameScore(b) - gameScore(a);
    }
    case 'review':
      return nullsLast(a.reviewScore, b.reviewScore, (x, y) => y - x) ?? 0;
    case 'release':
      return nullsLast(releaseKey(a), releaseKey(b), (x, y) => y.localeCompare(x)) ?? 0;
  }
}

/** Comparator for the given keys in priority order; title breaks any remaining tie. */
export function backlogComparator(keys: BacklogSortKey[], now: number = Date.now()) {
  const ks = keys.length ? keys : DEFAULT_BACKLOG_SORT;
  return (a: Game, b: Game): number => {
    for (const k of ks) {
      const c = compareBy(k, a, b, now);
      if (c) return c;
    }
    return a.title.localeCompare(b.title);
  };
}

/** Clicking a chip: picked keys go to the back of the priority list, unpicking removes it. Never
 * leaves nothing picked - unpicking the last one falls back to the default. */
export function toggleBacklogSort(keys: BacklogSortKey[], key: BacklogSortKey): BacklogSortKey[] {
  const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
  return next.length ? next : DEFAULT_BACKLOG_SORT;
}

export function parseBacklogSort(raw: string | null): BacklogSortKey[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(v)) return DEFAULT_BACKLOG_SORT;
    const valid = BACKLOG_SORT_OPTIONS.map((o) => o.key) as string[];
    const keys = Array.from(new Set(v.filter((k): k is BacklogSortKey => typeof k === 'string' && valid.includes(k))));
    return keys.length ? keys : DEFAULT_BACKLOG_SORT;
  } catch {
    return DEFAULT_BACKLOG_SORT;
  }
}

// A per-browser preference, like card density. Kept in a tiny store so the shelf re-sorts as soon
// as the settings dialog changes it.
const STORAGE_KEY = 'sq-backlog-sort';
const listeners = new Set<() => void>();
let cached: { raw: string | null; keys: BacklogSortKey[] } | null = null;

function read(): BacklogSortKey[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked - use the default */
  }
  if (!cached || cached.raw !== raw) cached = { raw, keys: parseBacklogSort(raw) };
  return cached.keys;
}

export function setBacklogSort(keys: BacklogSortKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useBacklogSort(): [BacklogSortKey[], (keys: BacklogSortKey[]) => void] {
  const keys = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT_BACKLOG_SORT,
  );
  return [keys, setBacklogSort];
}
