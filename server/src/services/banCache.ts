import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

/** What a banned person gets from every route except the few they may still use. The `code` lets
 * the app tell a ban apart from any other 403. */
export class BannedError extends HttpError {
  code = 'banned';
  constructor() {
    super(403, 'Your account has been banned');
  }
}

const TTL_MS = 10_000;
const cache = new Map<string, { banned: boolean; at: number }>();

/** Whether the account is banned. Remembered for a few seconds so the check does not add a query to
 * every request; `forgetBan` makes a ban or unban made on this server take effect straight away. */
export async function isBanned(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.banned;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
  const banned = !!user?.bannedAt;
  cache.set(userId, { banned, at: Date.now() });
  return banned;
}

export function forgetBan(userId: string): void {
  cache.delete(userId);
}
