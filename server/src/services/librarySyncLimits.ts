import { HttpError } from '../util/httpError.js';
import { redis } from './redisClient.js';

/** Remembers that a library source is rate limiting QueueUp (issue #864), so the Libraries dialog can
 * say so, "Sync all libraries" can skip it instead of hitting it again, and a sync started anyway
 * answers with when to try again. Exophase blocks by server address, so its limit is shared by
 * everyone; a key-based source (RetroAchievements) limits each person's key, so that one is theirs. */

/** How long to leave a source alone when it didn't say. */
export const DEFAULT_LIMIT_MS = 30 * 60 * 1000;
const SHARED = 'all';
const key = (source: string, scope: string) => `library-sync:limited-until:${source}:${scope}`;

/** Marks `source` as rate limited for `ms`. `userId` makes it that person's alone; null is everyone's. */
export async function markLimited(source: string, userId: string | null, ms: number = DEFAULT_LIMIT_MS, now: number = Date.now()): Promise<void> {
  const k = key(source, userId ?? SHARED);
  const until = now + ms;
  const current = Number(await redis.get(k));
  if (Number.isFinite(current) && current > until) return;
  await redis.set(k, String(until), 'PX', ms);
}

/** When `source` stops being rate limited for this person (epoch ms), or null when it isn't. */
export async function limitedUntilMs(source: string, userId: string, now: number = Date.now()): Promise<number | null> {
  const values = await Promise.all([redis.get(key(source, SHARED)), redis.get(key(source, userId))]);
  const until = Math.max(0, ...values.map((v) => Number(v)).filter((n) => Number.isFinite(n)));
  return until > now ? until : null;
}

/** For each source, an ISO time it is limited until, or null. */
export async function limitsFor(sources: string[], userId: string, now: number = Date.now()): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    sources.map(async (s) => {
      const until = await limitedUntilMs(s, userId, now);
      return [s, until ? new Date(until).toISOString() : null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function formatLimitMessage(label: string, untilMs: number, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((untilMs - now) / 60_000));
  return `${label} is limiting requests right now. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/** Throws a 429 (with when to try again) when `source` is currently rate limited for this person. */
export async function assertNotLimited(source: string, label: string, userId: string, now: number = Date.now()): Promise<void> {
  const until = await limitedUntilMs(source, userId, now);
  if (until) throw new HttpError(429, formatLimitMessage(label, until, now));
}
