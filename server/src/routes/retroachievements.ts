import type { FastifyInstance } from 'fastify';
import type { ConnectRetroAchievementsRequest, LibrarySyncProgress, PlayniteImportStarted, RetroAchievementsStatusResponse } from '@queueup/shared';
import { getLibrarySyncProgress } from '../services/librarySync.js';
import {
  connectRetroAchievements,
  disconnectRetroAchievements,
  getRetroAchievementsStatus,
  RETROACHIEVEMENTS_SOURCE,
  syncRetroAchievementsLibrary,
} from '../services/retroachievements/raConnection.js';

/** RetroAchievements sync: link a username and personal web API key, then sync the retro games on the
 * profile (see services/retroachievements/). Cookie-session only, like the other account routes. The
 * key is only ever read from the request body, checked and stored encrypted; no route returns it. */
export default async function retroAchievementsRoutes(app: FastifyInstance) {
  app.get('/api/me/retroachievements', async (request): Promise<RetroAchievementsStatusResponse> => {
    const userId = await request.requireAuth();
    return getRetroAchievementsStatus(userId);
  });

  // Makes a live request to RetroAchievements and takes a credential, so tighter than the global default.
  app.put<{ Body: ConnectRetroAchievementsRequest }>(
    '/api/me/retroachievements',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<RetroAchievementsStatusResponse> => {
      const userId = await request.requireAuth();
      return connectRetroAchievements(userId, request.body?.username, request.body?.apiKey);
    },
  );

  app.delete('/api/me/retroachievements', async (request, reply) => {
    const userId = await request.requireAuth();
    await disconnectRetroAchievements(userId);
    reply.status(204);
    return null;
  });

  // Several requests to RetroAchievements plus a lot of IGDB lookups, so a low ceiling per hour.
  app.post('/api/me/retroachievements/sync', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request): Promise<PlayniteImportStarted> => {
    const userId = await request.requireAuth();
    return syncRetroAchievementsLibrary(userId, request.log);
  });

  // Polled about once a second while a sync runs.
  app.get('/api/me/retroachievements/sync/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(RETROACHIEVEMENTS_SOURCE.source, userId) };
  });
}
