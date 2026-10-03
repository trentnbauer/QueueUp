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
