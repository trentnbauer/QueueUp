import type { FastifyInstance } from 'fastify';
import type { ActivityVisibilityResponse, SetActivityVisibilityRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

/** Whether friends see your activity in their feed. Hiding keeps everything you do working as usual;
 * your friends just stop seeing it (new and old entries alike), and you can switch it back at any
 * time. Separate from the public profile switch and from hiding individual games. */
export default async function activityVisibilityRoutes(app: FastifyInstance) {
  app.get('/api/me/activity-visibility', async (request): Promise<ActivityVisibilityResponse> => {
    const userId = await request.requireAuth();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { activityHidden: true } });
    return { hidden: user.activityHidden };
  });

  app.put<{ Body: SetActivityVisibilityRequest }>(
    '/api/me/activity-visibility',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<ActivityVisibilityResponse> => {
      const userId = await request.requireAuth();
      const hidden = request.body?.hidden;
      if (typeof hidden !== 'boolean') throw new HttpError(400, 'hidden must be true or false');
      await prisma.user.update({ where: { id: userId }, data: { activityHidden: hidden } });
      return { hidden };
    },
  );
}
