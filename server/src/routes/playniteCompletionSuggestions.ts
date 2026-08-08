import type { FastifyInstance } from 'fastify';
import {
  getPendingPlayniteCompletionSuggestions,
  dismissPlayniteCompletionSuggestion,
} from '../services/playniteCompletionSuggestions.js';
import type { PlayniteCompletionSuggestionsResult } from '@queueup/shared';

/** Cookie-authenticated routes backing the "Playnite says this is Completed" review flow (issue
 * #577) - the Playnite-sourced counterpart to /api/games/sync-steam-completions
 * (steamCompletionDetection.ts), but reading persisted PlayniteCompletionSuggestion rows instead
 * of live-scanning an API, since Playnite pushes this fact once, at import time (see
 * routes/apiV1.ts), rather than exposing something to re-poll. Same
 * "nothing changes until the caller applies Done" contract as the Steam version: this never
 * touches a game's status itself. */
export default async function playniteCompletionSuggestionRoutes(app: FastifyInstance) {
  app.get(
    '/api/games/playnite-completion-suggestions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const result: PlayniteCompletionSuggestionsResult = { suggestions: await getPendingPlayniteCompletionSuggestions(userId) };
      return result;
    },
  );

  app.delete<{ Params: { gameId: string } }>(
    '/api/games/playnite-completion-suggestions/:gameId',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      await dismissPlayniteCompletionSuggestion(userId, request.params.gameId);
      reply.status(204);
    },
  );
}
