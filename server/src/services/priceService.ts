import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import { getConfigValue } from './configResolver.js';
import { HttpError } from '../util/httpError.js';
import { FORCED_REFRESH_COOLDOWN_MS, cooldownRemainingMs, formatCooldownMessage } from './refreshCooldown.js';
import type { GamePrice } from '@queueup/shared';

const PRICE_CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h — prices/sales move faster than metadata
const PRICE_CACHE_PREFIX = 'gg:price:v3:steam:'; // v3: GamePrice now also carries historicalLow
// Deliberately keyed by steamAppId ALONE - no roomId, no region. That means a manual refresh
// of a given Steam game is shared by every room/shelf that happens to show it (issue #67's
// "sync prices across rooms" falls out of this for free, same as the price cache itself already
// being steamAppId-keyed), and the once-an-hour cooldown applies globally to that game rather
// than per-room.
const LAST_FORCED_REFRESH_PREFIX = 'gg:price:v3:steam:lastforced:';

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
  // Resolved env-first with a DB fallback (see configResolver.ts) - gg.deals is no longer
  // required at boot, so an unset key here is a real (if unusual) runtime state, not just a
  // hypothetical. Degrade to "unavailable" the same way an API-side hiccup would, rather than
  // throwing and breaking the whole game card.
  const fetchedAt = new Date().toISOString();
  const apiKey = await getConfigValue('GGDEALS_API_KEY', env.GGDEALS_API_KEY);
  if (!apiKey) {
    return {
      price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: fetchedAt },
      ggDealsUrl: null,
    };
  }

  const url = new URL('https://api.gg.deals/v1/prices/by-steam-app-id/');
  url.searchParams.set('ids', String(steamAppId));
  url.searchParams.set('key', apiKey);
  url.searchParams.set('region', region);

  const response = await fetch(url);
  if (!response.ok) {
    // Price API hiccup shouldn't break the whole card — degrade to "unavailable" and let a later refresh retry.
    return {
      price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: fetchedAt },
      ggDealsUrl: null,
    };
  }

  const body = (await response.json()) as GGDealsPricesResponse;
  const entry = body.data?.[String(steamAppId)];
  if (!entry) {
    return {
      price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: fetchedAt },
      ggDealsUrl: null,
    };
  }

  const amount = lowestOf(entry.prices.currentRetail, entry.prices.currentKeyshops);
  if (amount === null) {
    return {
      price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: fetchedAt },
      ggDealsUrl: entry.url ?? null,
    };
  }

  // The raw value, whenever gg.deals has one at all - even when it equals (or is above) the
  // current price. Whether that's worth SHOWING as a discount callout ("hey, this is below the
  // historic low") is a display decision made by the caller (see GameCard.tsx), not baked in here
  // - a caller checking "did we just hit a new all-time low" (priceAlerts.ts) needs the real value
  // in that case too, and nulling it out at the source made "no historical data at all" and
  // "already at the historical low" indistinguishable from here.
  const historicalLow = lowestOf(entry.prices.historicalRetail, entry.prices.historicalKeyshops);

  return {
    price: { amount, currency: entry.prices.currency, source: 'live', historicalLow, lastRefreshedAt: fetchedAt },
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

/** Throws HttpError(429) if this steamAppId's price was force-refreshed within the cooldown
 * window. Keyed by steamAppId alone (see LAST_FORCED_REFRESH_PREFIX) so the cooldown is global
 * to the game, not per-room/per-region. */
async function assertForcedRefreshAllowed(steamAppId: number): Promise<void> {
  const raw = await redis.get(`${LAST_FORCED_REFRESH_PREFIX}${steamAppId}`);
  if (!raw) return;

  const remaining = cooldownRemainingMs(Number(raw));
  if (remaining > 0) throw new HttpError(429, formatCooldownMessage(remaining));
}

async function markForcedRefresh(steamAppId: number): Promise<void> {
  // TTL'd to the cooldown window itself so the key self-cleans - nothing else needs to know
  // about "expiry", just whether the key is currently present.
  await redis.set(
    `${LAST_FORCED_REFRESH_PREFIX}${steamAppId}`,
    String(Date.now()),
    'EX',
    Math.ceil(FORCED_REFRESH_COOLDOWN_MS / 1000),
  );
}

/** Entry point for a manual/"forced" price refresh (issue #67): rejects with HttpError(429) if
 * this Steam game was force-refreshed less than an hour ago, otherwise force-fetches a fresh
 * price and records the attempt so the next one is gated too. */
export async function refreshSteamPriceForced(steamAppId: number): Promise<GamePrice> {
  await assertForcedRefreshAllowed(steamAppId);
  const price = await getSteamPrice(steamAppId, { forceRefresh: true });
  await markForcedRefresh(steamAppId);
  return price;
}
