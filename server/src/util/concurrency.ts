/** Runs `worker` over `items` with at most `limit` invocations in flight at once, rather than either
 * fully sequential (one at a time) or fully parallel (`Promise.all` over everything) - see
 * runPlayniteImportLoop in routes/apiV1.ts for why: unbounded parallelism against IGDB's ~4 req/s
 * rate limit would turn a slow-but-reliable import into a fast-but-flaky one. A rejected `worker`
 * call stops the pool (via `Promise.all`) - if per-item failures shouldn't abort the batch, `worker`
 * must catch its own errors, same contract a plain `for...of` loop would have needed anyway. */
export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    const index = nextIndex++;
    if (index >= items.length) return;
    await worker(items[index]);
    await runNext();
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runNext));
}
