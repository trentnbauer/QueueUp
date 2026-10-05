import type { FastifyInstance } from 'fastify';
import type { RoomPlatform } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { existingIgdbIds } from '../services/gameAccess.js';
import { getRoomPlatform, requireMembership } from '../services/roomAccess.js';
import { getOwnedPlatforms } from '../services/userSettings.js';
import { discoverGames } from '../services/igdbClient.js';
import { aiParseSearch, hasAnyFilter, sanitizeFilters } from '../services/ai/aiSearch.js';
import type { AiSearchRequest, AiSearchResponse, AiSearchRunRequest } from '@queueup/shared';

/** The platforms the normal Add Game search is scoped to: a room's own platform, else the person's
 * owned systems unless "owned systems only" is off. */
async function scopePlatforms(roomId: string | null, userId: string, allPlatforms: boolean): Promise<RoomPlatform[]> {
  const roomPlatform = roomId ? await getRoomPlatform(roomId) : null;
  if (roomPlatform) return [roomPlatform];
  return allPlatforms ? [] : getOwnedPlatforms(userId);
}

async function scopeFor(roomId: unknown, userId: string) {
  if (roomId === undefined || roomId === null) return null;
  if (typeof roomId !== 'string') throw new HttpError(400, 'roomId must be a room id');
  await requireMembership(roomId, userId);
  return roomId;
}

/** Plain-language search in Add Game (issue #823). The AI only turns the sentence into the app's own
 * filters; the games come from IGDB, so it cannot invent a title. */
export default async function aiSearchRoutes(app: FastifyInstance) {
  // One paid AI call plus up to two IGDB calls.
  app.post<{ Body: AiSearchRequest }>('/api/games/ai-search', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request): Promise<AiSearchResponse> => {
    const userId = await request.requireAuth();
    const { text, allPlatforms } = request.body ?? {};
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Say what you are looking for.');
    const roomId = await scopeFor(request.body?.roomId, userId);

    const { filters, unsupported, fallback } = await aiParseSearch(userId, roomId ?? undefined, text);
    if (!hasAnyFilter(filters)) return { filters, unsupported, results: [], fallback };
    const [platforms, exclude] = await Promise.all([scopePlatforms(roomId, userId, allPlatforms === true), existingIgdbIds(roomId, userId)]);
    return { filters, unsupported, results: await discoverGames(filters, platforms, exclude), fallback };
  });

  // No AI: re-runs filters the person edited (removing or changing a chip), so it is cheap.
  app.post<{ Body: AiSearchRunRequest }>('/api/games/ai-search/run', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    const roomId = await scopeFor(request.body?.roomId, userId);
    const filters = sanitizeFilters(request.body?.filters);
    if (!hasAnyFilter(filters)) return { results: [] };
    const [platforms, exclude] = await Promise.all([scopePlatforms(roomId, userId, request.body?.allPlatforms === true), existingIgdbIds(roomId, userId)]);
    return { results: await discoverGames(filters, platforms, exclude) };
  });
}
