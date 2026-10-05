import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = new Map<string, { value: string; ttl: number }>();
const pipelineSets: { key: string; ttl: number }[] = [];
vi.mock('./redisClient.js', () => ({
  redis: {
    get: async (key: string) => store.get(key)?.value ?? null,
    mget: async (keys: string[]) => keys.map((k) => store.get(k)?.value ?? null),
    set: async (key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, { value, ttl });
      return 'OK';
    },
    // Counters for ggDealsLimits.ts' hourly budget.
    incrby: async (key: string, n: number) => {
      const v = Number(store.get(key)?.value ?? 0) + n;
      store.set(key, { value: String(v), ttl: 0 });
      return v;
    },
    decrby: async (key: string, n: number) => {
      const v = Number(store.get(key)?.value ?? 0) - n;
      store.set(key, { value: String(v), ttl: 0 });
      return v;
    },
    expire: async () => 1,
    pipeline: () => {
      const ops: (() => void)[] = [];
      const p = {
        set: (key: string, value: string, _ex: string, ttl: number) => {
          ops.push(() => {
            store.set(key, { value, ttl });
            pipelineSets.push({ key, ttl });
          });
          return p;
        },
        exec: async () => ops.forEach((op) => op()),
      };
      return p;
    },
  },
}));
vi.mock('./configResolver.js', () => ({ getConfigValue: async () => 'test-key' }));
vi.mock('../config/env.js', () => ({ env: { GGDEALS_API_KEY: 'test-key', GGDEALS_DEFAULT_REGION: 'us' } }));

const { getSteamPrices } = await import('./priceService.js');

describe('getSteamPrices when gg.deals fails', () => {
  beforeEach(() => {
    store.clear();
    pipelineSets.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('treats a network error as "unavailable" instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const prices = await getSteamPrices([10, 20]);
    expect(prices.get(10)?.source).toBe('unavailable');
    expect(prices.get(20)?.source).toBe('unavailable');
  });

  it('caches a failed lookup only briefly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('busy', { status: 503 }));
    await getSteamPrices([10]);
    expect(pipelineSets[0]?.ttl).toBeLessThanOrEqual(60 * 10);
  });

  it('still caches a real answer for the full window', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { '10': { title: 'X', url: 'u', prices: { currentRetail: '9.99', currency: 'USD' } } } }),
        { status: 200 },
      ),
    );
    const prices = await getSteamPrices([10]);
    expect(prices.get(10)?.amount).toBe('9.99');
    expect(pipelineSets[0]?.ttl).toBe(60 * 60 * 6);
  });

  it('treats an entry with no prices block as unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { '10': { title: 'X', url: 'u' } } }), { status: 200 }),
    );
    const prices = await getSteamPrices([10]);
    expect(prices.get(10)?.source).toBe('unavailable');
  });
});

describe('gg.deals rate limiting (#863)', () => {
  const ok = (id: number) =>
    new Response(JSON.stringify({ success: true, data: { [String(id)]: { title: 'Game', url: 'https://gg.deals/g', prices: { currentRetail: '10.00', currency: 'USD' } } } }), { status: 200 });

  beforeEach(() => {
    store.clear();
    pipelineSets.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('stops asking gg.deals after a 429 and does not cache "unavailable" for the games it skipped', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '600' } }));
    await getSteamPrices([10]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // While backing off: no request at all, and nothing is cached for the skipped game.
    pipelineSets.length = 0;
    const prices = await getSteamPrices([20]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(prices.get(20)?.source).toBe('unavailable');
    expect(pipelineSets.map((s) => s.key).some((k) => k.includes(':20:'))).toBe(false);
  });

  it('does not call gg.deals for a manual refresh while backing off', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
    await getSteamPrices([10]);
    fetchSpy.mockClear();
    await expect(getSteamPrices([30], { forceRefresh: true })).resolves.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('looks a game up once even when several people ask for it (the cache is per game and region, not per person)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(40));
    const first = await getSteamPrices([40]);
    expect(first.get(40)?.source).toBe('live');
    fetchSpy.mockClear();
    // A second person (any room, any library) asking for the same game and region is a cache hit.
    const second = await getSteamPrices([40]);
    expect(second.get(40)?.source).toBe('live');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
