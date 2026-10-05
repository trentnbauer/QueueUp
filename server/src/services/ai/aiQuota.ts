import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';

/** What a call to the server-wide AI key costs the person, so it can be given back if the call
 * fails (a provider outage shouldn't use up someone's day). */
export interface AiCharge {
  refund: () => Promise<void>;
}

const NO_CHARGE: AiCharge = { refund: async () => {} };

// A little over a day, so a counter always outlives the UTC date it counts and then disappears.
const COUNTER_TTL_SECONDS = 26 * 60 * 60;

/** Counts one use of the server's own AI key against this person's daily allowance
 * (AI_SERVER_DAILY_LIMIT) and refuses with a 429 once it's used up. Without this, anyone signed in
 * - or one person with several accounts - could run up the operator's provider bill, since the
 * route limits are per IP and per minute only.
 *
 * Only calls that would use the server's key come here: a person's own key (or a room sponsor's)
 * costs the operator nothing. Administrators and a limit of 0 are exempt. Loaded lazily, like
 * aiConfig's env, so this stays importable without a parsed env or a Redis connection (unit tests).
 * If Redis is unreachable it lets the call through rather than taking AI down - the same
 * trade-off the rate limiter makes. */
export async function chargeServerAiUse(userId: string): Promise<AiCharge> {
  const { env } = await import('../../config/env.js');
  const limit = env.AI_SERVER_DAILY_LIMIT;
  if (limit === 0) return NO_CHARGE;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (user?.isAdmin) return NO_CHARGE;

  const { redis } = await import('../redisClient.js');
  const key = `ai:server-use:${userId}:${new Date().toISOString().slice(0, 10)}`;
  let count: number;
  try {
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, COUNTER_TTL_SECONDS);
  } catch (err) {
    console.error('[ai-quota] could not count a server AI use, letting it through', err instanceof Error ? err.message : err);
    return NO_CHARGE;
  }

  if (count > limit) {
    await redis.decr(key).catch(() => {});
    throw new HttpError(429, `You've used today's ${limit} requests on the shared AI. Add your own provider in your account settings for more, or try again tomorrow.`);
  }
  return { refund: async () => void (await redis.decr(key).catch(() => {})) };
}
