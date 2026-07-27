import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { toUserDto } from '../util/dto.js';
import { requireElevated, getRoom } from '../services/roomAccess.js';
import { loadGameOr404, requireNotDuplicate, rethrowAsDuplicateGame, invalidateExistingIgdbIds } from '../services/gameAccess.js';
import { resolveGameForCreation, defaultStatusForRelease, linkDlcToBaseGame } from '../services/gameIntake.js';
import { isAddonCategory } from '../services/igdbClient.js';
import { serializeGame } from '../services/gameSerializer.js';
import { notifyRoom } from '../services/notifications.js';
import type { GameSuggestion } from '@queueup/shared';

function toSuggestionDto(suggestion: {
  id: string;
  roomId: string;
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
  createdAt: Date;
  suggester: Parameters<typeof toUserDto>[0];
}): GameSuggestion {
  return {
    id: suggestion.id,
    roomId: suggestion.roomId,
    igdbId: suggestion.igdbId,
    title: suggestion.title,
    platform: suggestion.platform,
    coverImageUrl: suggestion.coverImageUrl,
    releaseYear: suggestion.releaseYear,
    suggestedBy: toUserDto(suggestion.suggester),
    createdAt: suggestion.createdAt.toISOString(),
  };
}

/** Approve/decline for a room's pending game suggestions (issue #362) - see GameSuggestion in
 * schema.prisma. Elevated (Room Master/Moderator) only, same gate as the rest of a room's
 * moderation actions - the suggestion's own creation happens in POST /api/games instead, since
 * that's where the "am I gated into suggesting instead of adding" check already lives. */
export default async function gameSuggestionRoutes(app: FastifyInstance) {
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/suggestions', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireElevated(roomId, userId);

    const suggestions = await prisma.gameSuggestion.findMany({
      where: { roomId },
      include: { suggester: true },
      orderBy: { createdAt: 'asc' },
    });
    return { suggestions: suggestions.map(toSuggestionDto) };
  });

  app.post<{ Params: { roomId: string; suggestionId: string } }>(
    '/api/rooms/:roomId/suggestions/:suggestionId/approve',
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId, suggestionId } = request.params;
      await requireElevated(roomId, userId);

      const suggestion = await prisma.gameSuggestion.findUnique({ where: { id: suggestionId } });
      if (!suggestion || suggestion.roomId !== roomId) throw new HttpError(404, 'Suggestion not found');

      const room = await getRoom(roomId);

      // Re-validates against *current* state rather than trusting what was true at suggest time -
      // the room's platform may have changed, or the game may since have been added directly by a
      // moderator. Either way, the stale suggestion is dropped rather than left wedged for someone
      // to keep re-declining.
      let resolved;
      try {
        await requireNotDuplicate(roomId, suggestion.suggestedBy, suggestion.igdbId);
        resolved = await resolveGameForCreation(suggestion.igdbId, [room.platform]);
      } catch (err) {
        await prisma.gameSuggestion.delete({ where: { id: suggestionId } });
        await invalidateExistingIgdbIds(roomId, suggestion.suggestedBy);
        throw err;
      }

      let created;
      try {
        created = await prisma.game.create({
          data: {
            roomId,
            addedBy: suggestion.suggestedBy,
            igdbId: suggestion.igdbId,
            title: resolved.title,
            platform: resolved.platform,
            genre: resolved.genre,
            maxCoopPlayers: resolved.maxCoopPlayers,
            timeToBeatHours: resolved.timeToBeatHours,
            timeToBeatRushedHours: resolved.timeToBeatRushedHours,
            timeToBeatCompletionistHours: resolved.timeToBeatCompletionistHours,
            ggDealsUrl: resolved.ggDealsUrl,
            steamAppid: resolved.steamAppId,
            coverImageUrl: resolved.coverImageUrl,
            releaseYear: resolved.releaseYear,
            releaseDate: resolved.releaseDate,
            igdbCollectionId: resolved.igdbCollectionId,
            reviewScore: resolved.reviewScore,
            status: defaultStatusForRelease(resolved.releaseDate),
          },
        });
      } catch (err) {
        rethrowAsDuplicateGame(err, roomId, resolved.title);
      }
      // Issue #338: same base-game-ensure/link as a direct add.
      if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
        await linkDlcToBaseGame(created.id, resolved.parentGameIgdbId, roomId, suggestion.suggestedBy, [room.platform]);
      }

      await prisma.gameSuggestion.delete({ where: { id: suggestionId } });
      await invalidateExistingIgdbIds(roomId, suggestion.suggestedBy);

      const game = await loadGameOr404(created.id);
      await notifyRoom({
        roomId,
        roomName: room.name,
        actorId: userId,
        type: 'game_added',
        message: (actorName) => `${actorName} approved "${resolved.title}" into the room`,
      });

      reply.status(201);
      return { game: await serializeGame(game, userId) };
    },
  );

  app.delete<{ Params: { roomId: string; suggestionId: string } }>(
    '/api/rooms/:roomId/suggestions/:suggestionId',
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId, suggestionId } = request.params;
      await requireElevated(roomId, userId);

      const suggestion = await prisma.gameSuggestion.findUnique({ where: { id: suggestionId } });
      if (!suggestion || suggestion.roomId !== roomId) throw new HttpError(404, 'Suggestion not found');

      await prisma.gameSuggestion.delete({ where: { id: suggestionId } });
      await invalidateExistingIgdbIds(roomId, suggestion.suggestedBy);

      reply.status(204);
      return null;
    },
  );
}
