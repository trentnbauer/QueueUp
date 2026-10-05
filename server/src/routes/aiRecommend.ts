import type { FastifyInstance } from 'fastify';
import { aiRecommendForShelf } from '../services/ai/aiRecommend.js';
import type { AiRecommendResponse } from '@queueup/shared';

/** AI game recommendations for the Personal Shelf wishlist (issue #820). Nothing is added: the
 * person adds a pick with the ordinary Add button. */
export default async function aiRecommendRoutes(app: FastifyInstance) {
  // One paid AI call plus several IGDB lookups, so a tight limit.
  app.post('/api/games/ai-recommend', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request): Promise<AiRecommendResponse> => {
    const userId = await request.requireAuth();
    return aiRecommendForShelf(userId);
  });
}
