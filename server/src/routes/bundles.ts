import type { FastifyInstance } from 'fastify';
import type { RoomPlatform, SplitBundleRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { parseBundleIgdbIds } from '../services/bundleImport.js';
import { suggestBundleGames } from '../services/bundleSuggestions.js';
import { createGameForUser } from '../services/gameIntake.js';
import { markOwned, unionOwnershipPlatforms } from '../services/gameOwnership.js';
import { requireMembership } from '../services/roomAccess.js';

/** A bundle card the person can act on, or an error: on their own shelf, or in a room they are in where they added it or run the
 * room (issue #1170). */
async function loadBundleGame(userId: string, id: string) {
  const game = await prisma.game.findFirst({ where: { id, archivedAt: null } });
  if (!game) throw new HttpError(404, 'That game was not found');
  if (game.roomId === null) {
    if (game.addedBy !== userId) throw new HttpError(404, 'That game is not on your shelf');
  } else {
    const membership = await requireMembership(game.roomId, userId);
    if (game.addedBy !== userId && membership.role === 'member') throw new HttpError(403, 'Only whoever added this game, or a Room Master or Moderator, can turn it into a bundle');
  }
  return game;
}

/** "This game is a bundle" (issues #857, #1169): suggests the games inside it, adds them, and links them to the bundle, which stays on the list. */
export default async function bundleRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/games/:id/bundle-suggestions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadBundleGame(userId, request.params.id);
      return { suggestions: await suggestBundleGames({ igdbId: game.igdbId, title: game.title }) };
    },
  );

  /** Adds every chosen game to the shelf or room the way the bundle was (on the shelf wishlisted stays wishlisted and owned
   * platforms carry over), then links them to the bundle card, which stays. Games already there only gain the
   * platforms. Safe to retry after a failure part way. */
  app.post<{ Params: { id: string }; Body: SplitBundleRequest }>(
    '/api/games/:id/split-bundle',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadBundleGame(userId, request.params.id);
      const igdbIds = parseBundleIgdbIds(request.body?.igdbIds).filter((i) => i !== game.igdbId);
      if (igdbIds.length === 0) throw new HttpError(400, 'Pick at least one game from the bundle');

      const inRoom = game.roomId !== null;
      // Where each game lives: the person's own shelf, or the bundle's room.
      const scopeWhere = inRoom ? { roomId: game.roomId } : { roomId: null, addedBy: userId };
      const wishlist = !inRoom && game.status === 'wishlist';
      const ownership = inRoom || wishlist ? null : await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId: game.igdbId } }, select: { platforms: true } });
      const owned: RoomPlatform[] = ownership?.platforms ?? [];

      for (const igdbId of igdbIds) {
        const existing = await prisma.game.findFirst({ where: { ...scopeWhere, igdbId }, select: { status: true } });
        if (!existing) {
          // A room that asks for approval may turn this into a suggestion instead of a game; those can't be linked yet.
          await createGameForUser(userId, game.roomId, igdbId, inRoom ? {} : wishlist ? { status: 'wishlist' } : { status: 'backlog', ownedPlatforms: owned });
        } else if (!inRoom && existing.status !== 'wishlist' && owned.length > 0) {
          await unionOwnershipPlatforms(userId, igdbId, owned);
        }
      }
      // Owned on a platform nobody recorded: the games inside are owned too.
      if (ownership && owned.length === 0) await markOwned(userId, igdbIds);
      // The bundle stays on the list, and its games point back at it (a game already inside another bundle stays there).
      await prisma.game.updateMany({ where: { ...scopeWhere, igdbId: { in: igdbIds }, bundleGameId: null, id: { not: game.id } }, data: { bundleGameId: game.id } });
      // Which games are now inside the bundle (the client offers to review them when the bundle was Beaten).
      const linked = await prisma.game.findMany({ where: { bundleGameId: game.id }, select: { id: true, igdbId: true } });
      return { linked };
    },
  );
}
