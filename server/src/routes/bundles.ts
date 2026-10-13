import type { FastifyInstance } from 'fastify';
import type { RoomPlatform, SplitBundleRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { parseBundleIgdbIds } from '../services/bundleImport.js';
import { suggestBundleGames } from '../services/bundleSuggestions.js';
import { createGameForUser } from '../services/gameIntake.js';
import { markOwned, unionOwnershipPlatforms } from '../services/gameOwnership.js';

/** A bundle card on the Personal Shelf, or a 404. Only the shelf: a room's games are the room's. */
async function loadShelfGame(userId: string, id: string) {
  const game = await prisma.game.findFirst({ where: { id, roomId: null, addedBy: userId, archivedAt: null } });
  if (!game) throw new HttpError(404, 'That game is not on your shelf');
  return game;
}

/** "This game is a bundle" (issues #857, #1169): suggests the games inside it, adds them, and links them to the bundle, which stays on the list. */
export default async function bundleRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/games/:id/bundle-suggestions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadShelfGame(userId, request.params.id);
      return { suggestions: await suggestBundleGames({ igdbId: game.igdbId, title: game.title }) };
    },
  );

  /** Adds every chosen game to the shelf the way the bundle was (wishlisted stays wishlisted; owned
   * platforms carry over), then links them to the bundle card, which stays. Games already on the shelf only gain the
   * platforms. Safe to retry after a failure part way. */
  app.post<{ Params: { id: string }; Body: SplitBundleRequest }>(
    '/api/games/:id/split-bundle',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const game = await loadShelfGame(userId, request.params.id);
      const igdbIds = parseBundleIgdbIds(request.body?.igdbIds).filter((i) => i !== game.igdbId);
      if (igdbIds.length === 0) throw new HttpError(400, 'Pick at least one game from the bundle');

      const wishlist = game.status === 'wishlist';
      const ownership = wishlist ? null : await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId: game.igdbId } }, select: { platforms: true } });
      const owned: RoomPlatform[] = ownership?.platforms ?? [];

      for (const igdbId of igdbIds) {
        const existing = await prisma.game.findFirst({ where: { roomId: null, addedBy: userId, igdbId }, select: { status: true } });
        if (!existing) {
          await createGameForUser(userId, null, igdbId, wishlist ? { status: 'wishlist' } : { status: 'backlog', ownedPlatforms: owned });
        } else if (existing.status !== 'wishlist' && owned.length > 0) {
          await unionOwnershipPlatforms(userId, igdbId, owned);
        }
      }
      // Owned on a platform nobody recorded: the games inside are owned too.
      if (ownership && owned.length === 0) await markOwned(userId, igdbIds);
      // The bundle stays on the shelf, and its games point back at it (a game already inside another bundle stays there).
      await prisma.game.updateMany({ where: { roomId: null, addedBy: userId, igdbId: { in: igdbIds }, bundleGameId: null, id: { not: game.id } }, data: { bundleGameId: game.id } });
      reply.status(204);
    },
  );
}
