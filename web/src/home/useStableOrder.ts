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
    const previous = kept.current;
    if (previous && previous.key === key && previous.ids.length === list.length) {
      const byId = new Map(list.map((g) => [g.id, g]));
      if (previous.ids.every((id) => byId.has(id))) return previous.ids.map((id) => byId.get(id)!);
    }
    kept.current = { key, ids: list.map((g) => g.id) };
    return list;
  }, [list, key]);
}
