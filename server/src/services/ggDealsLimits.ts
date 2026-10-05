import { redis } from './redisClient.js';

/** Keeps QueueUp inside gg.deals' quota ("you can fetch prices info only for 1000 games per hour",
 * issue #863) instead of finding out from a 429. Two guards, both shared by everyone on the server
 * (prices are fetched per game and region, never per person, so the quota is a server-wide thing):
 *
 * - a back-off: once gg.deals answers 429, no further requests are made until it is over (its
 *   Retry-After if it sent one, otherwise an hour), so a quota that is already spent isn't hit again
 *   every few minutes by page views;
 * - a budget: at most GGDEALS_HOURLY_BUDGET games are asked about in any clock hour, a little under
 *   gg.deals' own limit, so the back-off is the exception rather than the routine. */

export const GGDEALS_HOURLY_BUDGET = 900;
/** How long to stay away after a 429 that came with no Retry-After. gg.deals' quota is per hour. */
export const DEFAULT_BACKOFF_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 2 * 60 * 60 * 1000;
const BACKOFF_KEY = 'gg:price:v4:ratelimited-until';
const budgetKey = (now: number) => `gg:price:v4:budget:${new Date(now).toISOString().slice(0, 13)}`;

/** A Retry-After header (seconds, or an HTTP date) as milliseconds, or null when absent or unusable.
 * Capped so a silly value can't switch pricing off for days. */
export function parseRetryAfterMs(header: string | null | undefined, now: number = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, MAX_BACKOFF_MS);
}

/** Starts (or extends) the back-off after a 429. */
export async function startBackoff(retryAfterMs: number | null, now: number = Date.now()): Promise<void> {
  const ms = retryAfterMs ?? DEFAULT_BACKOFF_MS;
  const until = now + ms;
  const current = Number(await redis.get(BACKOFF_KEY));
  if (Number.isFinite(current) && current > until) return;
  await redis.set(BACKOFF_KEY, String(until), 'PX', ms);
}

/** Milliseconds left of the back-off, 0 when there isn't one. */
export async function backoffRemainingMs(now: number = Date.now()): Promise<number> {
  const until = Number(await redis.get(BACKOFF_KEY));
  return Number.isFinite(until) && until > now ? until - now : 0;
}

/** Counts `games` against this hour's budget. Returns how long to wait when it would go over (the
 * rest of the hour), or 0 when the lookup may go ahead. */
export async function reserveBudget(games: number, now: number = Date.now()): Promise<number> {
  const key = budgetKey(now);
  const used = await redis.incrby(key, games);
  if (used === games) await redis.expire(key, 2 * 60 * 60);
  if (used <= GGDEALS_HOURLY_BUDGET) return 0;
  // Over: give the games back so a smaller request later in the hour isn't blocked by this one.
  await redis.decrby(key, games);
  const nextHour = Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000;
  return nextHour - now;
}

/** How long gg.deals lookups should wait, 0 when they may go ahead: the back-off if one is on, else
 * whatever is left of the hour once the budget is spent. Reserves `games` against the budget. */
export async function waitBeforeLookup(games: number, now: number = Date.now()): Promise<number> {
  const backoff = await backoffRemainingMs(now);
  if (backoff > 0) return backoff;
  return reserveBudget(games, now);
}

export function formatWaitMessage(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return `GG.Deals is limiting price lookups right now. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
