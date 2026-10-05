import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('./redisClient.js', () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    incrby: vi.fn(async (k: string, n: number) => {
      const next = Number(store.get(k) ?? 0) + n;
      store.set(k, String(next));
      return next;
    }),
    decrby: vi.fn(async (k: string, n: number) => {
      const next = Number(store.get(k) ?? 0) - n;
      store.set(k, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
  },
}));

import { backoffRemainingMs, DEFAULT_BACKOFF_MS, formatWaitMessage, GGDEALS_HOURLY_BUDGET, parseRetryAfterMs, reserveBudget, startBackoff, waitBeforeLookup } from './ggDealsLimits.js';

const NOW = Date.UTC(2026, 9, 5, 14, 20, 0); // 14:20 UTC

beforeEach(() => store.clear());

describe('parseRetryAfterMs', () => {
  it('reads seconds and dates, and ignores junk, capping silly values', () => {
    expect(parseRetryAfterMs('120', NOW)).toBe(120_000);
    expect(parseRetryAfterMs(new Date(NOW + 90_000).toUTCString(), NOW)).toBe(90_000);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('soon', NOW)).toBeNull();
    expect(parseRetryAfterMs('-5', NOW)).toBeNull();
    expect(parseRetryAfterMs('999999999', NOW)).toBe(2 * 60 * 60 * 1000);
  });
});

describe('back-off', () => {
  it('is off until a 429, then lasts an hour by default or as long as Retry-After says', async () => {
    expect(await backoffRemainingMs(NOW)).toBe(0);
    await startBackoff(null, NOW);
    expect(await backoffRemainingMs(NOW + 1000)).toBe(DEFAULT_BACKOFF_MS - 1000);
    expect(await backoffRemainingMs(NOW + DEFAULT_BACKOFF_MS)).toBe(0);
  });

  it('never shortens a back-off that is already longer', async () => {
    await startBackoff(DEFAULT_BACKOFF_MS, NOW);
    await startBackoff(60_000, NOW);
    expect(await backoffRemainingMs(NOW)).toBe(DEFAULT_BACKOFF_MS);
  });
});

describe('reserveBudget', () => {
  it('lets lookups through up to the hourly budget, then says how long until the next hour', async () => {
    expect(await reserveBudget(GGDEALS_HOURLY_BUDGET - 50, NOW)).toBe(0);
    expect(await reserveBudget(50, NOW)).toBe(0);
    const wait = await reserveBudget(1, NOW);
    expect(wait).toBe(40 * 60_000); // 14:20 -> 15:00
  });

  it('gives back a request that was refused, so a smaller one can still go ahead', async () => {
    await reserveBudget(GGDEALS_HOURLY_BUDGET - 10, NOW);
    expect(await reserveBudget(50, NOW)).toBeGreaterThan(0);
    expect(await reserveBudget(10, NOW)).toBe(0);
  });

  it('starts fresh in the next hour', async () => {
    await reserveBudget(GGDEALS_HOURLY_BUDGET, NOW);
    expect(await reserveBudget(5, NOW + 3_600_000)).toBe(0);
  });
});

describe('waitBeforeLookup', () => {
  it('waits out a back-off without spending any budget', async () => {
    await startBackoff(5 * 60_000, NOW);
    expect(await waitBeforeLookup(10, NOW)).toBe(5 * 60_000);
    expect(await reserveBudget(GGDEALS_HOURLY_BUDGET, NOW)).toBe(0);
  });

  it('is 0 when nothing is holding lookups back', async () => {
    expect(await waitBeforeLookup(10, NOW)).toBe(0);
  });
});

describe('formatWaitMessage', () => {
  it('rounds up to a whole minute', () => {
    expect(formatWaitMessage(1)).toMatch(/about 1 minute\./);
    expect(formatWaitMessage(125_000)).toMatch(/about 3 minutes\./);
  });
});
