import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { resolveApiKeyUserId } from '../services/apiKeys.js';
import { requireMembership } from '../services/roomAccess.js';
import { gameInclude, serializeGames } from '../services/gameSerializer.js';
import { createGameForUser } from '../services/gameIntake.js';
import type { CreateGameRequest } from '@queueup/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by this plugin's own preHandler (see below) - the userId a valid bearer API key
     * resolved to. Deliberately not the same decorator as requireAuth()/currentUserId(): those
     * stay cookie-session-only, so a leaked API key can never reach an app route (account
     * settings, admin, etc.) and a browser session can never reach these routes. */
    apiKeyUserId: string;
  }
}

// Same size limit as the app's own shelf/room views (see MAX_GAMES_PER_LIST in routes/games.ts) -
// a pull is meant for "give me my library," not an unbounded export; a script that needs more can
// page by asking again after removing/archiving older entries, same as the web UI's own guidance.
const MAX_LIBRARY_PULL = 500;

// A script/integration hitting this on its own schedule, not a browser - its own limits rather
// than the per-session ones the cookie-authenticated app routes use (config: rateLimit throughout
// routes/games.ts), so an integration syncing periodically isn't sized against browser traffic.
const apiV1RateLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

export default async function apiV1Routes(app: FastifyInstance) {
  // Scoped to this plugin instance only (Fastify's encapsulation model) - registering this hook
  // here, not on the top-level `app`, is what keeps bearer auth from ever applying to any
  // cookie-authenticated route registered outside this plugin.
  app.addHook('preHandler', async (request) => {
    request.apiKeyUserId = await resolveApiKeyUserId(request.headers.authorization);
  });

  app.get('/library', apiV1RateLimit, async (request) => {
    const userId = request.apiKeyUserId;
    const games = await prisma.game.findMany({
      where: { roomId: null, addedBy: userId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_LIBRARY_PULL,
    });
    return { games: await serializeGames(games, userId) };
  });

  app.post<{ Body: CreateGameRequest }>('/library/games', apiV1RateLimit, async (request, reply) => {
    const userId = request.apiKeyUserId;
    const { igdbId, status, ownedPlatforms } = request.body;
    const response = await createGameForUser(userId, null, igdbId, { status, ownedPlatforms });
    reply.status(201);
    return response;
  });

  app.get<{ Params: { roomId: string } }>('/rooms/:roomId/games', apiV1RateLimit, async (request) => {
    const userId = request.apiKeyUserId;
    const { roomId } = request.params;
    await requireMembership(roomId, userId);
    const games = await prisma.game.findMany({
      where: { roomId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_LIBRARY_PULL,
    });
    return { games: await serializeGames(games, userId) };
  });

  app.post<{ Params: { roomId: string }; Body: CreateGameRequest }>(
    '/rooms/:roomId/games',
    apiV1RateLimit,
    async (request, reply) => {
      const userId = request.apiKeyUserId;
      const { roomId } = request.params;
      const { igdbId, status } = request.body;
      // ownedPlatforms is a Personal Shelf-only concept (see createGameForUser) - a room push
      // never accepts it, same as the cookie-authenticated room add flow.
      const response = await createGameForUser(userId, roomId, igdbId, { status });
      reply.status(201);
      return response;
    },
  );
}
