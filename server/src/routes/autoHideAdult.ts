import type { FastifyInstance } from 'fastify';
import type { AutoHideAdultResponse } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { autoHideWaitingAdultGames } from '../services/adultHiding.js';

/** The "automatically hide adult games" setting. Turning it on also hides the adult games already waiting for an
 * answer; turning it off leaves everything as it is (games already hidden stay hidden until changed on the game). */
export default async function autoHideAdultRoutes(app: FastifyInstance) {
  app.get('/api/me/auto-hide-adult', async (request): Promise<AutoHideAdultResponse> => {
    const userId = await request.requireAuth();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { autoHideAdult: true } });
    return { enabled: user.autoHideAdult };
  });

  app.put<{ Body: { enabled?: unknown } }>('/api/me/auto-hide-adult', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request): Promise<AutoHideAdultResponse> => {
    const userId = await request.requireAuth();
    const enabled = request.body?.enabled;
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
    await prisma.user.update({ where: { id: userId }, data: { autoHideAdult: enabled } });
    if (enabled) await autoHideWaitingAdultGames(userId);
    return { enabled };
  });
}
