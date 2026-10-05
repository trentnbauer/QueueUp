import type { FastifyInstance } from 'fastify';
import type { ConnectPsnRequest, LibrarySyncProgress, PlayniteImportStarted, PsnStatusResponse } from '@queueup/shared';
import { getLibrarySyncProgress } from '../services/librarySync.js';
import { connectPsn, disconnectPsn, getPsnStatus, PSN_SOURCE, syncPsnLibrary } from '../services/psn/psnConnection.js';

/** Native PlayStation library sync: link an account with a one-off NPSSO code, then sync the
 * purchased PS4 and PS5 games with no Playnite in between (see services/psn/). Cookie-session only,
 * like the other account routes. The NPSSO is only ever read from the request body, traded for a
 * login and dropped; no route returns the saved login. */
export default async function psnRoutes(app: FastifyInstance) {
  app.get('/api/me/psn', async (request): Promise<PsnStatusResponse> => {
    const userId = await request.requireAuth();
    return getPsnStatus(userId);
  });

  // Makes live requests to Sony, and takes a credential, so tighter than the global default.
  app.put<{ Body: ConnectPsnRequest }>(
    '/api/me/psn',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<PsnStatusResponse> => {
      const userId = await request.requireAuth();
      return connectPsn(userId, request.body?.npsso);
    },
  );

  app.delete('/api/me/psn', async (request, reply) => {
    const userId = await request.requireAuth();
    await disconnectPsn(userId);
    reply.status(204);
    return null;
  });

  // Many requests to Sony plus a lot of IGDB lookups, so a low ceiling per hour.
  app.post('/api/me/psn/sync', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request): Promise<PlayniteImportStarted> => {
    const userId = await request.requireAuth();
    return syncPsnLibrary(userId, request.log);
  });

  // Polled about once a second while a sync runs.
  app.get('/api/me/psn/sync/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(PSN_SOURCE.source, userId) };
  });
}
