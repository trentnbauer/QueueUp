import type { FastifyInstance } from 'fastify';
import type { MiniGameScorePeriod, MiniGameScoreScope, SetMiniGameRatingRequest, SubmitMiniGameScoreRequest } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { isRatingValue, myRatings, setRating } from '../services/miniGameRatings.js';
import { isLobbyGameId, isPlausibleScore, leaderboard, myBests, myScores, recordRunScores } from '../services/miniGameScores.js';

/** Mini game high scores (see services/miniGameScores.ts). Runs in a room's lobby or waiting room are saved
 * by the lobby itself; a solo run is sent here by the player's own device when it ends. */
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

  app.post<{ Body: SubmitMiniGameScoreRequest }>(
    '/api/minigames/scores',
    // A solo run lasts at least a few seconds, so this is generous.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { game, score } = request.body ?? ({} as Partial<SubmitMiniGameScoreRequest>);
      if (!isLobbyGameId(game)) throw new HttpError(400, 'Unknown game');
      if (!isPlausibleScore(game, score)) throw new HttpError(400, 'Not a possible score');
      await recordRunScores(game, 'solo', [{ userId, score }]);
      return reply.code(204).send();
    },
  );
}
