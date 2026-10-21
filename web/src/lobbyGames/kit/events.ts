/** What a view saw in the last snapshot it drew, so it can tell what has just happened (a cube broken, a fish landed) by comparing with the next. Make one
 * per view, at module level, and call it each frame:
 *
 *   const previous = rememberSnapshot<Map<number, Thing>>();
 *   ...
 *   const before = previous(snapshot, () => new Map(...));   // null unless the snapshot is a new one in the same run, while playing
 *
 * `make` runs only when the snapshot is a new one (a view draws the same snapshot many times). The first snapshot of a run, and any that follows a pause between
 * runs, has no `before`, so a new run clearing the board never looks like a lot of things happening at once. */
export function rememberSnapshot<T>(): (snapshot: { run: number; phase: string }, make: () => T) => T | null {
  let last: { snapshot: object; run: number; value: T } | null = null;
  return (snapshot, make) => {
    if (last && last.snapshot === snapshot) return null;
    const before = last && last.run === snapshot.run && snapshot.phase === 'playing' ? last.value : null;
    last = { snapshot, run: snapshot.run, value: make() };
    return before;
  };
}
