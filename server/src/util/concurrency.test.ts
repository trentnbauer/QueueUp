import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from './concurrency.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('runWithConcurrency', () => {
  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never runs more than `limit` workers at once', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    let inFlight = 0;
    let maxInFlight = 0;
    await runWithConcurrency(items, 3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('keeps pulling new items as earlier ones finish, not just batch-by-batch', async () => {
    // Item 0 stays in flight the whole time; items 1-3 should still all complete despite only a
    // limit of 2 slots, proving a freed slot picks up a *new* item rather than waiting on the batch.
    const slow = deferred<void>();
    const completed: number[] = [];
    const run = runWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      if (item === 0) {
        await slow.promise;
      }
      completed.push(item);
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(completed).toEqual(expect.arrayContaining([1, 2, 3]));
    slow.resolve();
    await run;
    expect(completed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('caps concurrency at the item count when limit is larger', async () => {
    const worker = vi.fn(async () => {});
    await runWithConcurrency([1, 2], 10, worker);
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it('does nothing for an empty item list', async () => {
    const worker = vi.fn(async () => {});
    await runWithConcurrency([], 4, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('propagates a worker rejection rather than swallowing it', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
