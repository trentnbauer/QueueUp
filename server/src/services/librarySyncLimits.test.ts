import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('./redisClient.js', () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  },
}));

import { assertNotLimited, DEFAULT_LIMIT_MS, formatLimitMessage, limitedUntilMs, limitsFor, markLimited } from './librarySyncLimits.js';

const NOW = Date.UTC(2026, 9, 5, 14, 0, 0);

beforeEach(() => store.clear());

describe('markLimited / limitedUntilMs', () => {
  it('is not limited until marked, then until the end of the window', async () => {
    expect(await limitedUntilMs('exophase', 'u1', NOW)).toBeNull();
    await markLimited('exophase', null, DEFAULT_LIMIT_MS, NOW);
    expect(await limitedUntilMs('exophase', 'u1', NOW + 1000)).toBe(NOW + DEFAULT_LIMIT_MS);
    expect(await limitedUntilMs('exophase', 'u1', NOW + DEFAULT_LIMIT_MS)).toBeNull();
  });

  it('shares a server-wide limit with everyone, but keeps a key limit to its owner', async () => {
    await markLimited('exophase', null, 60_000, NOW);
    await markLimited('retroachievements', 'u1', 60_000, NOW);
    expect(await limitedUntilMs('exophase', 'u2', NOW)).not.toBeNull();
    expect(await limitedUntilMs('retroachievements', 'u1', NOW)).not.toBeNull();
    expect(await limitedUntilMs('retroachievements', 'u2', NOW)).toBeNull();
  });

  it('never shortens a longer limit', async () => {
    await markLimited('exophase', null, 60 * 60_000, NOW);
    await markLimited('exophase', null, 60_000, NOW);
    expect(await limitedUntilMs('exophase', 'u1', NOW)).toBe(NOW + 60 * 60_000);
  });
});

describe('limitsFor', () => {
  it('lists each source with an ISO time or null', async () => {
    await markLimited('exophase', null, 60_000, NOW);
    expect(await limitsFor(['exophase', 'retroachievements'], 'u1', NOW)).toEqual({ exophase: new Date(NOW + 60_000).toISOString(), retroachievements: null });
  });
});

describe('assertNotLimited', () => {
  it('lets a source through, and refuses a limited one with a 429 that says when', async () => {
    await expect(assertNotLimited('exophase', 'Exophase', 'u1', NOW)).resolves.toBeUndefined();
    await markLimited('exophase', null, 5 * 60_000, NOW);
    await expect(assertNotLimited('exophase', 'Exophase', 'u1', NOW)).rejects.toMatchObject({ statusCode: 429, message: 'Exophase is limiting requests right now. Try again in about 5 minutes.' });
  });
});

describe('formatLimitMessage', () => {
  it('rounds up to a whole minute', () => {
    expect(formatLimitMessage('Exophase', NOW + 1, NOW)).toMatch(/about 1 minute\./);
  });
});
