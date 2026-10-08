import type { FastifyInstance } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { aiScanDuplicates, countDuplicateCandidates, dismissDuplicatePair, listDuplicateCandidates, markDuplicateBundle } from '../services/ai/aiDuplicates.js';
import type { AiDuplicateScanResponse, DismissDuplicateRequest, MarkBundleRequest, DuplicateCandidateCountResponse, DuplicateCandidatesResponse } from '@queueup/shared';

/** AI duplicate scan for the personal shelf (issue #824). The merge itself is the existing
 * POST /api/games/:id/merge; nothing here merges anything. */
export default async function duplicateSuggestionRoutes(app: FastifyInstance) {
  /** Looks for cards on the person's shelf that are probably the same game. Needs AI set up (400 if not). */
  app.post<{ Body: { fresh?: boolean } | undefined }>(
    '/api/games/duplicates/ai-scan',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request): Promise<AiDuplicateScanResponse> => {
      const userId = await request.requireAuth();
      // `fresh`: "Scan again", asking the AI afresh instead of reusing its earlier answers.
      return aiScanDuplicates(userId, { fresh: request.body?.fresh === true });
    },
  );

  /** How many pairs might be the same game, by title alone - no AI, so it's free to ask. Drives the
   * "possible duplicates" nudge on the shelf. */
  app.get(
    '/api/games/duplicates/count',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<DuplicateCandidateCountResponse> => {
      const userId = await request.requireAuth();
      return { count: await countDuplicateCandidates(userId) };
    },
  );

  /** The pairs behind that count, for the duplicates dialog to list. Also free. */
  app.get(
    '/api/games/duplicates',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<DuplicateCandidatesResponse> => {
      const userId = await request.requireAuth();
      return listDuplicateCandidates(userId);
    },
  );

  /** "These are not duplicates": the pair is not suggested again. */
  app.post<{ Body: DismissDuplicateRequest }>(
    '/api/games/duplicates/dismiss',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { gameIdA, gameIdB } = request.body ?? {};
      if (typeof gameIdA !== 'string' || typeof gameIdB !== 'string') throw new HttpError(400, 'gameIdA and gameIdB are required');
      await dismissDuplicatePair(userId, gameIdA, gameIdB);
      reply.status(204);
    },
  );

  /** "This is a bundle": the card is hidden from the shelf and leaves every duplicate pair it was in. */
  app.post<{ Body: MarkBundleRequest }>(
    '/api/games/duplicates/bundle',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { gameId } = request.body ?? {};
      if (typeof gameId !== 'string') throw new HttpError(400, 'gameId is required');
      await markDuplicateBundle(userId, gameId);
      reply.status(204);
    },
  );
}
