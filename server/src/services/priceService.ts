import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import type { GamePrice } from '@squadqueue/shared';

const PRICE_CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h — prices/sales move faster than metadata
const PRICE_CACHE_PREFIX = 'gg:price:v3:steam:'; // v3: GamePrice now also carries historicalLow

interface GGDealsPricesResponse {
  success: boolean;
  data: Record<
    string,
    {
      title: string;
      url: string;
      prices: {
        currentRetail?: string;
        currentKeyshops?: string;
        historicalRetail?: string;
        historicalKeyshops?: string;
        currency: string;
      };
    }
  >;
}

function lowestOf(...values: Array<string | undefined>): string | null {
  const numeric = values
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => ({ raw: v, n: Number(v) }))
    .filter((v) => !Number.isNaN(v.n));
  if (numeric.length === 0) return null;
  return numeric.reduce((min, cur) => (cur.n < min.n ? cur : min)).raw;
}

interface PriceEntry {
  price: GamePrice;
  ggDealsUrl: string | null;
}

async function fetchLiveEntry(steamAppId: number, region: string): Promise<PriceEntry> {
  const url = new URL('https://api.gg.deals/v1/prices/by-steam-app-id/');
  url.searchParams.set('ids', String(steamAppId));
  url.searchParams.set('key', env.GGDEALS_API_KEY);
  url.searchParams.set('region', region);

  const response = await fetch(url);
  if (!response.ok) {
    // Price API hiccup shouldn't break the whole card — degrade to "unavailable" and let a later refresh retry.
    return { price: { amount: null, currency: null, source: 'unavailable', historicalLow: null }, ggDealsUrl: null };
  }

  const body = (await response.json()) as GGDealsPricesResponse;
  const entry = body.data?.[String(steamAppId)];
  if (!entry) return { price: { amount: null, currency: null, source: 'unavailable', historicalLow: null }, ggDealsUrl: null };

  const amount = lowestOf(entry.prices.currentRetail, entry.prices.currentKeyshops);
  if (amount === null) {
    return {
      price: { amount: null, currency: null, source: 'unavailable', historicalLow: null },
      ggDealsUrl: entry.url ?? null,
    };
  }

  const historicalLowRaw = lowestOf(entry.prices.historicalRetail, entry.prices.historicalKeyshops);
  // Only worth showing when it's a real discount opportunity below the current price - if the
  // current price already is (or beats) the historic low, there's nothing extra to tell the user.
  const historicalLow = historicalLowRaw !== null && Number(historicalLowRaw) < Number(amount) ? historicalLowRaw : null;

  return {
    price: { amount, currency: entry.prices.currency, source: 'live', historicalLow },
    ggDealsUrl: entry.url ?? null,
  };
}

async function getEntry(
  steamAppId: number,
  opts: { region?: string; forceRefresh?: boolean } = {},
): Promise<PriceEntry> {
  const region = opts.region ?? env.GGDEALS_DEFAULT_REGION;
  const cacheKey = `${PRICE_CACHE_PREFIX}${steamAppId}:${region}`;

  if (!opts.forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as PriceEntry;
  }

  const entry = await fetchLiveEntry(steamAppId, region);
  await redis.set(cacheKey, JSON.stringify(entry), 'EX', PRICE_CACHE_TTL_SECONDS);
  return entry;
}

export async function getSteamPrice(
  steamAppId: number,
  opts: { region?: string; forceRefresh?: boolean } = {},
): Promise<GamePrice> {
  const entry = await getEntry(steamAppId, opts);
  return entry.price;
}

/** Batched version of getSteamPrice — one Redis MGET for all cache hits, one Promise.all of live
 * fetches for the misses, instead of a round trip per game. Use this whenever pricing more than
 * one game at a time (e.g. serializing a room's game list). */
export async function getSteamPrices(
  steamAppIds: number[],
  opts: { region?: string; forceRefresh?: boolean } = {},
): Promise<Map<number, GamePrice>> {
  const region = opts.region ?? env.GGDEALS_DEFAULT_REGION;
  const uniqueIds = [...new Set(steamAppIds)];
  const result = new Map<number, GamePrice>();
  if (uniqueIds.length === 0) return result;

  const cacheKeys = uniqueIds.map((id) => `${PRICE_CACHE_PREFIX}${id}:${region}`);
  const cachedValues = opts.forceRefresh ? uniqueIds.map(() => null) : await redis.mget(cacheKeys);

  const misses: number[] = [];
  uniqueIds.forEach((id, i) => {
    const cached = cachedValues[i];
    if (cached) {
      result.set(id, (JSON.parse(cached) as PriceEntry).price);
    } else {
      misses.push(id);
    }
  });

  if (misses.length > 0) {
    const fetched = await Promise.all(misses.map((id) => fetchLiveEntry(id, region)));
    const pipeline = redis.pipeline();
    misses.forEach((id, i) => {
      const entry = fetched[i];
      result.set(id, entry.price);
      pipeline.set(`${PRICE_CACHE_PREFIX}${id}:${region}`, JSON.stringify(entry), 'EX', PRICE_CACHE_TTL_SECONDS);
    });
    await pipeline.exec();
  }

  return result;
}

/** Used only during intake — also returns the canonical gg.deals URL for the game. */
export async function getSteamPriceAndUrl(
  steamAppId: number,
  opts: { region?: string; forceRefresh?: boolean } = {},
): Promise<PriceEntry> {
  return getEntry(steamAppId, opts);
}
