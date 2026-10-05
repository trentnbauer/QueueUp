import type { FastifyInstance } from 'fastify';
import type { ConnectExophaseRequest, ExophaseStatusResponse, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';
import { getLibrarySyncProgress } from '../services/librarySync.js';
import { connectExophase, disconnectExophase, EXOPHASE_SOURCE, getExophaseStatus, syncExophaseLibrary } from '../services/exophase/exophaseConnection.js';

/** Exophase library sync: link a public Exophase profile, then sync the libraries Exophase has
 * gathered (PlayStation, Xbox, Steam, Epic, GOG and more). Cookie-session only, like the other
 * account routes. */
export default async function exophaseRoutes(app: FastifyInstance) {
  app.get('/api/me/exophase', async (request): Promise<ExophaseStatusResponse> => {
    const userId = await request.requireAuth();
    return getExophaseStatus(userId);
  });

  // Makes live requests to Exophase, so tighter than the global default.
  app.put<{ Body: ConnectExophaseRequest }>(
    '/api/me/exophase',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<ExophaseStatusResponse> => {
      const userId = await request.requireAuth();
      return connectExophase(userId, request.body?.profile);
    },
  );

  app.delete('/api/me/exophase', async (request, reply) => {
    const userId = await request.requireAuth();
    await disconnectExophase(userId);
    reply.status(204);
    return null;
  });

  // Many requests to Exophase plus a lot of IGDB lookups, so a low ceiling per hour.
  app.post('/api/me/exophase/sync', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request): Promise<PlayniteImportStarted> => {
    const userId = await request.requireAuth();
    return syncExophaseLibrary(userId, request.log);
  });

  // Polled about once a second while a sync runs.
  app.get('/api/me/exophase/sync/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(EXOPHASE_SOURCE.source, userId) };
  });
}
