import type { FastifyInstance } from 'fastify';
import { limitsFor } from '../services/librarySyncLimits.js';

/** Which library sources are rate limiting QueueUp right now, and until when (issue #864), so the
 * Libraries dialog can show it and "Sync all libraries" can skip them. */
export default async function libraryLimitsRoutes(app: FastifyInstance) {
  app.get('/api/me/library-limits', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request): Promise<{ limits: Record<string, string | null> }> => {
    const userId = await request.requireAuth();
    return { limits: await limitsFor(['exophase', 'retroachievements'], userId) };
  });
}
