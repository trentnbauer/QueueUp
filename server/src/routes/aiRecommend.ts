import type { FastifyInstance } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { requireMembership } from '../services/roomAccess.js';
import { aiRecommendForRoom, aiRecommendForShelf } from '../services/ai/aiRecommend.js';
import type { AiRecommendRequest, AiRecommendResponse } from '@queueup/shared';

/** AI game recommendations for the Personal Shelf wishlist (issue #820) or, with a roomId, for a
 * room (issue #821). Nothing is added: the person adds a pick with the ordinary Add button. */
export default async function aiRecommendRoutes(app: FastifyInstance) {
  // One paid AI call plus several IGDB lookups, so a tight limit.
  app.post<{ Body: AiRecommendRequest | undefined }>(
    '/api/games/ai-recommend',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request): Promise<AiRecommendResponse> => {
      const userId = await request.requireAuth();
      const roomId = request.body?.roomId;
      if (roomId === undefined || roomId === null) return aiRecommendForShelf(userId);
      if (typeof roomId !== 'string') throw new HttpError(400, 'roomId must be a room id');
      await requireMembership(roomId, userId);
      return aiRecommendForRoom(userId, roomId);
    },
  );
}
