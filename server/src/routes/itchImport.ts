import type { FastifyInstance } from 'fastify';
import type { ItchImportRequest, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { getLibrarySyncProgress, startLibrarySync, type LibrarySyncSource } from '../services/librarySync.js';
import { fetchItchLibrary, ItchError } from '../services/itchClient.js';

export const ITCH_SOURCE: LibrarySyncSource = { source: 'itch', syncSource: 'itch', label: 'Your itch.io import' };

/** One-shot itch.io import (issue #1047): the person pastes a personal API key, QueueUp reads the
 * games they own and matches them like any other library. The key is used for this request only and
 * never stored or logged, so there is nothing to protect afterwards. Cookie-session only. */
export default async function itchImportRoutes(app: FastifyInstance) {
  app.post<{ Body: ItchImportRequest }>(
    '/api/me/import/itch',
    { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } },
    async (request): Promise<PlayniteImportStarted> => {
      const userId = await request.requireAuth();
      const apiKey = typeof request.body?.apiKey === 'string' ? request.body.apiKey.trim() : '';
      if (!apiKey || apiKey.length > 200) throw new HttpError(400, 'Paste your itch.io API key.');
      try {
        const entries = await fetchItchLibrary(apiKey);
        if (entries.length === 0) throw new HttpError(400, 'No games found on that itch.io account.');
        return await startLibrarySync(userId, ITCH_SOURCE, entries, request.log);
      } catch (err) {
        if (err instanceof ItchError) throw new HttpError(err.badKey ? 400 : 502, err.message);
        throw err;
      }
    },
  );

  app.get('/api/me/import/itch/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(ITCH_SOURCE.source, userId) };
  });
}
