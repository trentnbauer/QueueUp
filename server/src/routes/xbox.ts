import type { FastifyInstance } from 'fastify';
import type { LibrarySyncProgress, PlayniteImportStarted, XboxConnectPollResponse, XboxConnectStartResponse, XboxStatusResponse } from '@queueup/shared';
import { getLibrarySyncProgress } from '../services/librarySync.js';
import { disconnectXbox, getXboxStatus, pollXboxConnect, startXboxConnect, syncXboxLibrary, XBOX_SOURCE } from '../services/xbox/xboxConnection.js';

/** Native Xbox library sync: link a Microsoft account with the device-code login, then sync the
 * library with no Playnite in between (see services/xbox/). Cookie-session only, like the other
 * account routes. The Microsoft login is never returned: the browser only ever sees the short code
 * to type at Microsoft's link, whether it is linked, and the gamertag. */
export default async function xboxRoutes(app: FastifyInstance) {
  app.get('/api/me/xbox', async (request): Promise<XboxStatusResponse> => {
    const userId = await request.requireAuth();
    return getXboxStatus(userId);
  });

  // Each of these makes live requests to Microsoft, so tighter than the global default.
  app.post('/api/me/xbox/connect', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request): Promise<XboxConnectStartResponse> => {
    const userId = await request.requireAuth();
    return startXboxConnect(userId);
  });

  // Polled by the browser every few seconds while the person approves the code.
  app.post('/api/me/xbox/connect/poll', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (request): Promise<XboxConnectPollResponse> => {
    const userId = await request.requireAuth();
    return pollXboxConnect(userId);
  });

  app.delete('/api/me/xbox', async (request, reply) => {
    const userId = await request.requireAuth();
    await disconnectXbox(userId);
    reply.status(204);
    return null;
  });

  // Expensive (a lot of IGDB lookups for a big library), so a low ceiling per hour.
  app.post('/api/me/xbox/sync', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (request): Promise<PlayniteImportStarted> => {
    const userId = await request.requireAuth();
    return syncXboxLibrary(userId, request.log);
  });

  // Polled about once a second while a sync runs.
  app.get('/api/me/xbox/sync/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(XBOX_SOURCE.source, userId) };
  });
}
