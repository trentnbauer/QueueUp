import type { FastifyInstance } from 'fastify';
import { aiBacklogCoach } from '../services/ai/aiBacklogCoach.js';
import type { AiBacklogCoachResponse } from '@queueup/shared';

/** Backlog coach for the Personal Shelf (issue #827). Changes nothing: a suggestion is applied with
 * the ordinary status change when the person accepts it. */
export default async function aiBacklogCoachRoutes(app: FastifyInstance) {
  app.post('/api/games/ai-backlog-coach', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request): Promise<AiBacklogCoachResponse> => {
    const userId = await request.requireAuth();
    return aiBacklogCoach(userId);
  });
}
