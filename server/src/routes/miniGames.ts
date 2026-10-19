import type { FastifyInstance } from 'fastify';
import type { MiniGameScorePeriod, MiniGameScoreScope, SetMiniGameRatingRequest } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { isRatingValue, myRatings, setRating } from '../services/miniGameRatings.js';
import { isLobbyGameId, leaderboard, myBests, myScores } from '../services/miniGameScores.js';

/** Mini game high scores (see services/miniGameScores.ts). Runs in a room's lobby or waiting room are saved
 * by the lobby itself, and so are practice runs (a private lobby of one): the server runs every game, so the only scores it
 * saves are ones it saw happen. There is no way to post a score. */
export default async function miniGameRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { game?: string; scope?: string; period?: string } }>(
    '/api/minigames/scores',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { game, scope = 'friends', period = 'all' } = request.query;
      if (!isLobbyGameId(game)) throw new HttpError(400, 'Unknown game');
      if (scope !== 'friends' && scope !== 'server') throw new HttpError(400, 'Unknown scope');
      if (period !== 'all' && period !== 'week') throw new HttpError(400, 'Unknown period');
      return leaderboard(userId, game, scope as MiniGameScoreScope, period as MiniGameScorePeriod);
    },
  );

  app.get<{ Querystring: { game?: string } }>('/api/minigames/me', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    if (!isLobbyGameId(request.query.game)) throw new HttpError(400, 'Unknown game');
    return myScores(userId, request.query.game);
  });

  // Thumbs up or down for a game, from the result card at the end of a run. One rating per person per game.
  app.get('/api/minigames/ratings', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => myRatings(await request.requireAuth()));

  app.put<{ Body: SetMiniGameRatingRequest }>('/api/minigames/rating', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = await request.requireAuth();
    const { game, rating } = request.body ?? ({} as Partial<SetMiniGameRatingRequest>);
    if (!isLobbyGameId(game)) throw new HttpError(400, 'Unknown game');
    if (!isRatingValue(rating)) throw new HttpError(400, 'Rating must be 1 or -1');
    await setRating(userId, game, rating);
    return reply.code(204).send();
  });

  app.get('/api/minigames/bests', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => myBests(await request.requireAuth()));
}
