import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './priceService.js';

describe('mapWithConcurrency', () => {
  it('preserves input order in the results regardless of completion order', async () => {
    const delays = [30, 10, 20];
    const result = await mapWithConcurrency(delays, 3, (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)));
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` calls at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return i;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('runs every item exactly once', async () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    await mapWithConcurrency(items, 2, async (i) => {
      seen.push(i);
      return i * 2;
    });
    expect(seen.sort()).toEqual(items);
  });

  it('handles an empty input without hanging', async () => {
    const result = await mapWithConcurrency([], 4, async (i: number) => i);
    expect(result).toEqual([]);
  });

  it('handles a limit larger than the item count', async () => {
    const result = await mapWithConcurrency([1, 2], 10, async (i) => i * 10);
    expect(result).toEqual([10, 20]);
  });
});
