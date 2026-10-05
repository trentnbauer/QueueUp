import type { FastifyInstance } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { getUpcomingOwnedDlc, ignoreDlc } from '../services/upcomingDlc.js';
import type { UpcomingDlc } from '@queueup/shared';

/** Owned games' upcoming DLC for the shelf's Coming soon strip (issue #869). Adding one to the
 * wishlist is the ordinary POST /api/games with status "wishlist". */
export default async function upcomingDlcRoutes(app: FastifyInstance) {
  /** Looks up IGDB for each owned game (cached for a day), so a tighter limit than the default. */
  app.get('/api/games/upcoming-dlc', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<{ dlcs: UpcomingDlc[] }> => {
    const userId = await request.requireAuth();
    return { dlcs: await getUpcomingOwnedDlc(userId) };
  });

  /** "Ignore": this DLC is not offered again. */
  app.post<{ Params: { igdbId: string } }>(
    '/api/games/upcoming-dlc/:igdbId/ignore',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const igdbId = Number(request.params.igdbId);
      if (!Number.isInteger(igdbId) || igdbId <= 0) throw new HttpError(400, 'A valid IGDB id is required');
      await ignoreDlc(userId, igdbId);
      reply.status(204);
    },
  );
}
