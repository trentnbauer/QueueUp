import { Prisma } from '@prisma/client';
import { BADGE_DEFINITIONS, type BadgeDefinition, type BadgeKey } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Records a user unlocking a QueueUp badge (issue #489), idempotently - the unique constraint on
 * (userId, badgeKey) is the single source of truth for "was this already unlocked", same
 * create-and-catch-P2002 idiom already used for room joins (routes/rooms.ts), rather than a
 * check-then-insert that could race. Returns the badge's definition when this call is the one that
 * newly unlocked it (so the caller can surface a toast/animation), or null when the user already
 * had it - never throws for the "already unlocked" case, only for a genuine, unexpected DB error.
 * Callers should wrap this in try/catch and swallow failures (matching notifications.ts's own
 * defensive style) - a badge-unlock failure must never break the real action that triggered it. */
export async function unlockBadge(userId: string, key: BadgeKey): Promise<BadgeDefinition | null> {
  try {
    await prisma.userBadge.create({ data: { userId, badgeKey: key } });
    return BADGE_DEFINITIONS[key];
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/** Convenience for a hook point that may unlock more than one badge from a single action (e.g. a
 * status change can be a solo-beat and nothing else, but keeps the call sites uniform) - runs each
 * unlock independently (allSettled, not all) so one key's unexpected failure can't discard another
 * key's successful unlock in the same batch, and filters out the nulls/rejections, so callers can
 * just spread the result into their response's `unlockedBadges` without checking each one
 * individually. Failures are swallowed and logged here (not left to each call site to remember)
 * since a badge unlock should never fail the request that triggered it. */
export async function unlockBadges(userId: string, keys: BadgeKey[]): Promise<BadgeDefinition[]> {
  const results = await Promise.allSettled(keys.map((key) => unlockBadge(userId, key)));
  const unlocked: BadgeDefinition[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      if (result.value) unlocked.push(result.value);
    } else {
      console.error('[badges] failed to unlock badge', { userId, key: keys[i], err: result.reason });
    }
  });
  return unlocked;
}
