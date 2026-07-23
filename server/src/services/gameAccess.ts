import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership } from './roomAccess.js';
import type { GameWithRelations } from './gameSerializer.js';
import { gameInclude } from './gameSerializer.js';
import { redis } from './redisClient.js';

export async function loadGameOr404(gameId: string): Promise<GameWithRelations> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game) throw new HttpError(404, 'Game not found');
  return game;
}

/** Any member can view/vote; a shelf item is only visible to its owner. */
export async function requireGameReadAccess(game: GameWithRelations, userId: string) {
  if (game.roomId === null) {
    if (game.addedBy !== userId) throw new HttpError(403, 'This is someone else\'s personal shelf item');
    return;
  }
  await requireMembership(game.roomId, userId);
}

/** Any room member can change status; a shelf item only its owner. Deleting someone else's room game needs elevation. */
export async function requireGameDeleteAccess(game: GameWithRelations, userId: string) {
  if (game.roomId === null) {
    if (game.addedBy !== userId) throw new HttpError(403, 'This is someone else\'s personal shelf item');
    return;
  }
  const membership = await requireMembership(game.roomId, userId);
  const isOwnGame = game.addedBy === userId;
  const isElevated = membership.role === 'room_master' || membership.role === 'moderator';
  if (!isOwnGame && !isElevated) {
    throw new HttpError(403, 'Only the Room Master or a Moderator can remove a game someone else added');
  }
}

/** Tags are a personal filing scheme (issue #247), not a room feature - only the person who added a
 * game may tag it, whether it's on their Personal Shelf or in a room, matching the issue's stated
 * scope ("a tag you create applies across your Personal Shelf and any room games you added"). This
 * is stricter than requireGameReadAccess/requireGameDeleteAccess (which any room member passes) -
 * being able to see or vote on a shared room game doesn't mean you get to organize it into somebody
 * else's tag scheme. */
export function requireGameTagAccess(game: { addedBy: string }, userId: string) {
  if (game.addedBy !== userId) {
    throw new HttpError(403, 'You can only tag games you added');
  }
}

/** A game's "audience" for duplicate purposes: everyone in the room, or just the shelf's own owner. */
export function duplicateScopeWhere(roomId: string | null, userId: string) {
  return roomId ? { roomId } : { roomId: null, addedBy: userId };
}

export async function requireNotDuplicate(roomId: string | null, userId: string, igdbId: number): Promise<void> {
  const existing = await prisma.game.findFirst({
    where: { ...duplicateScopeWhere(roomId, userId), igdbId },
  });
  if (existing) {
    throw new HttpError(
      400,
      `${existing.title} is already ${roomId ? 'in this room' : 'on your shelf'}.`,
    );
  }
}

/** requireNotDuplicate is a plain check-then-act with no transaction, so it only blocks the
 * common case - two concurrent requests for the same igdbId (a double-click, two tabs, two
 * overlapping "Re-sync Library" runs) can both pass it before either insert lands. The real
 * backstop is a pair of partial unique indexes on the games table (see ensureConstraints.ts),
 * which turn the loser of that race into a Prisma P2002 instead of a duplicate row. Callers wrap
 * their `prisma.game.create` in try/catch and pass the error here to convert it into the same
 * user-facing message requireNotDuplicate would have given if it had won the race - rethrows
 * anything else unchanged. */
export function rethrowAsDuplicateGame(err: unknown, roomId: string | null, title: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new HttpError(400, `${title} is already ${roomId ? 'in this room' : 'on your shelf'}.`);
  }
  throw err;
}

const EXISTING_IGDB_IDS_CACHE_TTL_SECONDS = 30;

function existingIgdbIdsCacheKey(roomId: string | null, userId: string): string {
  return roomId ? `existing-igdb-ids:room:${roomId}` : `existing-igdb-ids:shelf:${userId}`;
}

/** Backs the search dropdown's "already added" filter. Cached briefly since a user typically
 * fires several search requests in a row while picking a game, each needing this same set;
 * a short TTL keeps it cheap without risking real staleness (adding a real duplicate is still
 * blocked server-side by requireNotDuplicate regardless of what this set says). */
export async function existingIgdbIds(roomId: string | null, userId: string): Promise<Set<number>> {
  const cacheKey = existingIgdbIdsCacheKey(roomId, userId);
  const cached = await redis.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached) as number[]);

  const games = await prisma.game.findMany({
    where: duplicateScopeWhere(roomId, userId),
    select: { igdbId: true },
  });
  const ids = games.map((g) => g.igdbId);
  await redis.set(cacheKey, JSON.stringify(ids), 'EX', EXISTING_IGDB_IDS_CACHE_TTL_SECONDS);
  return new Set(ids);
}

/** Call after adding or removing a game so the next search reflects it immediately instead of
 * waiting out the cache TTL. */
export async function invalidateExistingIgdbIds(roomId: string | null, userId: string): Promise<void> {
  await redis.del(existingIgdbIdsCacheKey(roomId, userId));
}
