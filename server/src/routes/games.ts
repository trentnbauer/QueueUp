import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoomPlatform } from '../services/roomAccess.js';
import {
  loadGameOr404,
  requireGameReadAccess,
  requireGameDeleteAccess,
  requireNotDuplicate,
  existingIgdbIds,
  invalidateExistingIgdbIds,
} from '../services/gameAccess.js';
import { gameInclude, serializeGame, serializeGames } from '../services/gameSerializer.js';
import { searchIntake, previewIntake, resolveGameForCreation, refreshGamePricing } from '../services/gameIntake.js';
import { platformFamilies, findIgdbIdBySteamAppId } from '../services/igdbClient.js';
import { extractSteamId64, getOwnedSteamGames } from '../services/steamLibrary.js';
import { env } from '../config/env.js';
import type {
  CreateGameRequest,
  ImportSteamLibraryResult,
  MoveGameRequest,
  PriceRegion,
  UpdateGameStatusRequest,
  VoteRequest,
} from '@squadqueue/shared';
import { PRICE_REGION_LABELS } from '@squadqueue/shared';

const GAME_STATUSES = ['backlog', 'playing', 'done'] as const;
const PRICE_REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
// Shelves/rooms are meant to hold an actively-curated backlog, not a lifetime game archive - this
// caps a single query so one runaway list can't pull unbounded rows (and unbounded price lookups)
// on every page load. Well above any real shelf/room size today.
const MAX_GAMES_PER_LIST = 500;
// A Steam library can run into the hundreds of games, each needing its own IGDB lookup - capping
// keeps one import from taking minutes or hammering IGDB. Most-played games are considered first.
const MAX_STEAM_IMPORT_CONSIDERED = 30;

function parseRegion(region?: string): PriceRegion | undefined {
  return PRICE_REGIONS.includes(region as PriceRegion) ? (region as PriceRegion) : undefined;
}

export default async function gameRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; roomId?: string } }>('/api/games/search', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.query;
    if (roomId) await requireMembership(roomId, userId);
    const roomPlatform = roomId ? await getRoomPlatform(roomId) : undefined;
    const excludeIgdbIds = await existingIgdbIds(roomId ?? null, userId);

    const results = await searchIntake(request.query.q ?? '', roomPlatform, excludeIgdbIds);
    return { results };
  });

  app.post<{ Body: { igdbId: number; roomId?: string | null } }>('/api/games/preview', async (request) => {
    const userId = await request.requireAuth();
    const { igdbId, roomId } = request.body;
    if (!Number.isInteger(igdbId)) throw new HttpError(400, 'A valid igdbId is required');
    if (roomId) await requireMembership(roomId, userId);
    const roomPlatform = roomId ? await getRoomPlatform(roomId) : undefined;

    const preview = await previewIntake(igdbId, roomPlatform);
    return { preview };
  });

  app.get<{ Querystring: { region?: string } }>('/api/games', async (request) => {
    const userId = await request.requireAuth();
    const games = await prisma.game.findMany({
      where: { roomId: null, addedBy: userId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_GAMES_PER_LIST,
    });
    return { games: await serializeGames(games, userId, parseRegion(request.query.region)) };
  });

  app.get<{ Params: { roomId: string }; Querystring: { region?: string } }>('/api/rooms/:roomId/games', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const games = await prisma.game.findMany({
      where: { roomId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_GAMES_PER_LIST,
    });
    return { games: await serializeGames(games, userId, parseRegion(request.query.region)) };
  });

  app.post<{ Body: CreateGameRequest }>('/api/games', async (request, reply) => {
    const userId = await request.requireAuth();
    const { igdbId, roomId } = request.body;
    if (!Number.isInteger(igdbId)) throw new HttpError(400, 'A valid igdbId is required');

    if (roomId) {
      await requireMembership(roomId, userId);
    }
    const roomPlatform = roomId ? await getRoomPlatform(roomId) : undefined;
    await requireNotDuplicate(roomId ?? null, userId, igdbId);

    const resolved = await resolveGameForCreation(igdbId, roomPlatform);

    const created = await prisma.game.create({
      data: {
        roomId: roomId ?? null,
        addedBy: userId,
        igdbId,
        title: resolved.title,
        platform: resolved.platform,
        genre: resolved.genre,
        maxCoopPlayers: resolved.maxCoopPlayers,
        ggDealsUrl: resolved.ggDealsUrl,
        steamAppid: resolved.steamAppId,
        coverImageUrl: resolved.coverImageUrl,
      },
    });
    const game = await loadGameOr404(created.id);
    await invalidateExistingIgdbIds(roomId ?? null, userId);

    reply.status(201);
    return { game: await serializeGame(game, userId) };
  });

  app.post(
    '/api/games/import-steam-library',
    // This is an expensive operation (up to MAX_STEAM_IMPORT_CONSIDERED sequential IGDB lookups),
    // not something to allow hammering.
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      if (!env.STEAM_API_KEY) {
        throw new HttpError(400, 'Steam integration is not configured on this server.');
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const steamId64 = extractSteamId64(user.oidcSub);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to import your library.');
      }

      const owned = await getOwnedSteamGames(steamId64, env.STEAM_API_KEY);
      const considered = [...owned].sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes).slice(0, MAX_STEAM_IMPORT_CONSIDERED);

      const [existingIgdbIdSet, shelfGames] = await Promise.all([
        existingIgdbIds(null, userId),
        prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true } }),
      ]);
      const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

      let imported = 0;
      let skipped = 0;
      for (const game of considered) {
        if (existingSteamAppIds.has(game.appId)) {
          skipped++;
          continue;
        }
        try {
          const igdbId = await findIgdbIdBySteamAppId(game.appId);
          if (igdbId === null || existingIgdbIdSet.has(igdbId)) {
            skipped++;
            continue;
          }
          const resolved = await resolveGameForCreation(igdbId);
          await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId,
              title: resolved.title,
              platform: resolved.platform,
              genre: resolved.genre,
              maxCoopPlayers: resolved.maxCoopPlayers,
              ggDealsUrl: resolved.ggDealsUrl,
              steamAppid: resolved.steamAppId,
              coverImageUrl: resolved.coverImageUrl,
            },
          });
          existingIgdbIdSet.add(igdbId);
          imported++;
        } catch {
          // One game failing to resolve (IGDB hiccup, no match, etc.) shouldn't abort the batch.
          skipped++;
        }
      }
      if (imported > 0) await invalidateExistingIgdbIds(null, userId);

      const result: ImportSteamLibraryResult = {
        totalOwned: owned.length,
        consideredCount: considered.length,
        imported,
        skipped,
      };
      return result;
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateGameStatusRequest }>('/api/games/:id/status', async (request) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    await requireGameReadAccess(game, userId);

    const { status } = request.body;
    if (!GAME_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');

    await prisma.game.update({ where: { id: game.id }, data: { status } });
    const updated = await loadGameOr404(game.id);
    return { game: await serializeGame(updated, userId) };
  });

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    await requireGameDeleteAccess(game, userId);

    await prisma.game.delete({ where: { id: game.id } });
    await invalidateExistingIgdbIds(game.roomId, game.addedBy);
    reply.status(204);
    return null;
  });

  app.post<{ Params: { id: string }; Body: MoveGameRequest }>('/api/games/:id/move', async (request) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    // Moving is a relocate: you need rights to remove it from where it is...
    await requireGameDeleteAccess(game, userId);
    const { roomId: destRoomId } = request.body;

    if (destRoomId === game.roomId) {
      throw new HttpError(400, "That game is already there.");
    }

    // ...and, for a room destination, membership there (the shelf has no such gate).
    if (destRoomId) {
      await requireMembership(destRoomId, userId);
      const destPlatform = await getRoomPlatform(destRoomId);
      const families = platformFamilies(game.platform.split(',').map((name) => ({ name: name.trim() })));
      if (!families.includes(destPlatform)) {
        throw new HttpError(400, `${game.title} isn't available on this room's platform.`);
      }
    }
    await requireNotDuplicate(destRoomId ?? null, userId, game.igdbId);

    await prisma.game.update({
      where: { id: game.id },
      // The mover becomes the new "adder" - relevant when moving into the shelf, since a shelf
      // item is only visible/manageable by whoever added it.
      data: { roomId: destRoomId ?? null, addedBy: userId },
    });
    await invalidateExistingIgdbIds(game.roomId, game.addedBy);
    await invalidateExistingIgdbIds(destRoomId ?? null, userId);

    const updated = await loadGameOr404(game.id);
    return { game: await serializeGame(updated, userId) };
  });

  app.post<{ Params: { id: string } }>('/api/games/:id/refresh-price', async (request) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    await requireGameReadAccess(game, userId);

    await refreshGamePricing(game.steamAppid);
    const updated = await loadGameOr404(game.id);
    return { game: await serializeGame(updated, userId) };
  });

  app.put<{ Params: { id: string }; Body: VoteRequest }>('/api/games/:id/vote', async (request) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    await requireGameReadAccess(game, userId);

    const { value } = request.body;
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new HttpError(400, 'Vote value must be an integer from 1 to 5');
    }

    await prisma.vote.upsert({
      where: { gameId_userId: { gameId: game.id, userId } },
      update: { value },
      create: { gameId: game.id, userId, value },
    });

    const updated = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: gameInclude });
    return { game: await serializeGame(updated, userId) };
  });
}
