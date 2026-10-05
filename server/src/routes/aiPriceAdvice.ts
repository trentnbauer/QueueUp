import type { FastifyInstance } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { loadGameOr404, requireGameReadAccess } from '../services/gameAccess.js';
import { serializeGame } from '../services/gameSerializer.js';
import { getPriceHistory } from '../services/priceHistory.js';
import { aiPriceAdvice } from '../services/ai/aiPriceAdvice.js';
import type { AiPriceAdviceResponse } from '@queueup/shared';

/** Buy-or-wait advice for a game's price (issue #829). Changes nothing; the person sets the
 * suggested alert with the ordinary target-price route. */
export default async function aiPriceAdviceRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    '/api/games/:id/ai-price-advice',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request): Promise<AiPriceAdviceResponse> => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const price = (await serializeGame(game, userId)).price;
      const current = price.amount !== null ? Number(price.amount) : NaN;
      if (price.source !== 'live' || !price.currency || !Number.isFinite(current) || current <= 0 || game.steamAppid == null) {
        throw new HttpError(400, 'There is no live price for this game to advise on.');
      }
      const points = await getPriceHistory(game.steamAppid, price.currency);
      const historicalLow = price.historicalLow !== null && Number(price.historicalLow) > 0 ? Number(price.historicalLow) : null;
      return aiPriceAdvice(userId, game.roomId ?? undefined, points, current, price.currency, historicalLow);
    },
  );
}
