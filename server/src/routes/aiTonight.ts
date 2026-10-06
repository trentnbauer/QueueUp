import type { FastifyInstance } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { aiPickTonight } from '../services/ai/aiTonight.js';
import type { AiTonightRequest, AiTonightResponse } from '@queueup/shared';

/** "What should I play tonight?" (issue #825): an AI pick from the person's own backlog. Sits next
 * to Spin the Wheel. Changes nothing; marking the game Playing is the ordinary status change. */
export default async function aiTonightRoutes(app: FastifyInstance) {
  // Each call is a paid request to the person's own provider, so a tight limit.
  app.post<{ Body: AiTonightRequest }>(
    '/api/games/ai-tonight',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request): Promise<AiTonightResponse> => {
      const userId = await request.requireAuth();
      const { request: wish, excludeIds, roomId } = request.body ?? {};
      if (typeof wish !== 'string') throw new HttpError(400, 'request is required');
      if (excludeIds !== undefined && (!Array.isArray(excludeIds) || excludeIds.length > 200 || !excludeIds.every((i) => typeof i === 'string'))) {
        throw new HttpError(400, 'excludeIds must be a list of game ids');
      }
      if (roomId !== undefined && typeof roomId !== 'string') throw new HttpError(400, 'roomId must be text');
      return aiPickTonight(userId, wish, excludeIds ?? [], roomId ?? null);
    },
  );
}
