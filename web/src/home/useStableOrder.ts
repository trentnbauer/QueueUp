import { useMemo, useRef } from 'react';

/** Keeps a list in the order it was first shown while the same games are still in it.
 *
 * The lists are sorted by vote score, so voting on a game used to re-sort it straight away - often
 * jumping it to the top of the queue, away from your finger and your scroll position. With this the
 * rows stay put when only their contents change (votes, prices, tags...) and take the new order the
 * next time the list is built fresh: a different tab, search or scope, or the set of games changing
 * (added, removed, status changed).
 *
 * `key` identifies the view (scope + tab + search). Rows are always returned with their latest data. */
export function useStableOrder<T extends { id: string }>(list: T[], key: string): T[] {
  const kept = useRef<{ key: string; ids: string[] } | null>(null);

  return useMemo(() => {
    const { items, ids } = stableOrder(kept.current, list, key);
    kept.current = ids;
    return items;
  }, [list, key]);
}

/** The pure part of useStableOrder: given the order kept from last time (or null), the freshly
 * sorted list and the view key, returns what to show and what to keep. The kept order is reused
 * only for the same view and the same set of games. */
export function stableOrder<T extends { id: string }>(
  previous: { key: string; ids: string[] } | null,
  list: T[],
  key: string,
): { items: T[]; ids: { key: string; ids: string[] } } {
  if (previous && previous.key === key && previous.ids.length === list.length) {
    const byId = new Map(list.map((g) => [g.id, g]));
    if (previous.ids.every((id) => byId.has(id))) return { items: previous.ids.map((id) => byId.get(id)!), ids: previous };
  }
  return { items: list, ids: { key, ids: list.map((g) => g.id) } };
}
