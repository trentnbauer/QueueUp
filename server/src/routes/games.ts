import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoomPlatform, getRoom } from '../services/roomAccess.js';
import {
  loadGameOr404,
  requireGameReadAccess,
  requireGameDeleteAccess,
  requireNotDuplicate,
  existingIgdbIds,
  invalidateExistingIgdbIds,
} from '../services/gameAccess.js';
import { gameInclude, serializeGame, serializeGames } from '../services/gameSerializer.js';
import { searchIntake, resolveGameForCreation, refreshGamePricing } from '../services/gameIntake.js';
import { notifyRoom } from '../services/notifications.js';
import { platformFamilies, findIgdbIdBySteamAppId } from '../services/igdbClient.js';
import { getOwnedPlatforms } from '../services/userSettings.js';
import {
  resolveSteamId64,
  getOwnedSteamGames,
  getWishlistAppIds,
  getAchievementCounts,
  setSteamImportProgress,
  getSteamImportProgress,
} from '../services/steamLibrary.js';
import { setOwnership, markOwned } from '../services/gameOwnership.js';
import { toUserDto } from '../util/dto.js';
import { env } from '../config/env.js';
import type {
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CreateGameRequest,
  ImportSteamLibraryResult,
  ImportSteamWishlistResult,
  MoveGameRequest,
  PlayerAchievements,
  PriceRegion,
  SetGameOwnershipRequest,
  SetTargetPriceRequest,
  SteamImportProgress,
  UpdateGameStatusRequest,
  VoteRequest,
} from '@queueup/shared';
import { IGDB_PLATFORM_NAMES, PRICE_REGION_LABELS } from '@queueup/shared';

// Steam ownership only ever implies PC (see resolveGameForCreation's platformLabelOverride) -
// IGDB_PLATFORM_NAMES.pc[0] is the canonical "PC (Microsoft Windows)" label already used
// elsewhere for platform-filter matching (see ownedPlatformLabels in Header.tsx).
const STEAM_IMPORT_PLATFORM_LABEL = IGDB_PLATFORM_NAMES.pc[0];

const GAME_STATUSES = ['backlog', 'playing', 'done', 'dropped', 'wishlist'] as const;
const PRICE_REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
// Shelves/rooms are meant to hold an actively-curated backlog, not a lifetime game archive - this
// caps a single query so one runaway list can't pull unbounded rows (and unbounded price lookups)
// on every page load. Well above any real shelf/room size today.
const MAX_GAMES_PER_LIST = 500;

function parseRegion(region?: string): PriceRegion | undefined {
  return PRICE_REGIONS.includes(region as PriceRegion) ? (region as PriceRegion) : undefined;
}

export default async function gameRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; roomId?: string } }>('/api/games/search', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.query;
    if (roomId) await requireMembership(roomId, userId);
    const platforms = roomId ? [await getRoomPlatform(roomId)] : await getOwnedPlatforms(userId);
    const excludeIgdbIds = await existingIgdbIds(roomId ?? null, userId);

    const results = await searchIntake(request.query.q ?? '', platforms, excludeIgdbIds);
    return { results };
  });

  app.get<{ Querystring: { region?: string } }>('/api/games', async (request) => {
    const userId = await request.requireAuth();
    // Fetches one row past the cap rather than a separate COUNT query - if that extra row comes
    // back, the list was truncated, and it's dropped before serializing so the client only ever
    // sees at most MAX_GAMES_PER_LIST games.
    const games = await prisma.game.findMany({
      where: { roomId: null, addedBy: userId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_GAMES_PER_LIST + 1,
    });
    const truncated = games.length > MAX_GAMES_PER_LIST;
    return {
      games: await serializeGames(games.slice(0, MAX_GAMES_PER_LIST), userId, parseRegion(request.query.region)),
      truncated,
    };
  });

  app.get<{ Params: { roomId: string }; Querystring: { region?: string } }>('/api/rooms/:roomId/games', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const games = await prisma.game.findMany({
      where: { roomId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_GAMES_PER_LIST + 1,
    });
    const truncated = games.length > MAX_GAMES_PER_LIST;
    return {
      games: await serializeGames(games.slice(0, MAX_GAMES_PER_LIST), userId, parseRegion(request.query.region)),
      truncated,
    };
  });

  app.post<{ Body: CreateGameRequest }>('/api/games', async (request, reply) => {
    const userId = await request.requireAuth();
    const { igdbId, roomId } = request.body;
    if (!Number.isInteger(igdbId)) throw new HttpError(400, 'A valid igdbId is required');

    let room: Awaited<ReturnType<typeof getRoom>> | null = null;
    if (roomId) {
      await requireMembership(roomId, userId);
      room = await getRoom(roomId);
    }
    const platforms = room ? [room.platform] : await getOwnedPlatforms(userId);
    await requireNotDuplicate(roomId ?? null, userId, igdbId);

    const resolved = await resolveGameForCreation(igdbId, platforms);

    const created = await prisma.game.create({
      data: {
        roomId: roomId ?? null,
        addedBy: userId,
        igdbId,
        title: resolved.title,
        platform: resolved.platform,
        genre: resolved.genre,
        maxCoopPlayers: resolved.maxCoopPlayers,
        timeToBeatHours: resolved.timeToBeatHours,
        ggDealsUrl: resolved.ggDealsUrl,
        steamAppid: resolved.steamAppId,
        coverImageUrl: resolved.coverImageUrl,
        releaseYear: resolved.releaseYear,
      },
    });
    const game = await loadGameOr404(created.id);
    await invalidateExistingIgdbIds(roomId ?? null, userId);

    if (roomId && room) {
      await notifyRoom({
        roomId,
        roomName: room.name,
        actorId: userId,
        type: 'game_added',
        message: (actorName) => `${actorName} added "${resolved.title}" to the room`,
      });
    }

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
      const steamId64 = resolveSteamId64(user);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to import your library.');
      }

      const owned = await getOwnedSteamGames(steamId64, env.STEAM_API_KEY);

      const [existingIgdbIdSet, shelfGames] = await Promise.all([
        existingIgdbIds(null, userId),
        prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true, igdbId: true } }),
      ]);
      const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

      // No cap - a click imports the whole not-yet-shelved library in one go (issue #175). Ordered
      // most-played first purely for a nicer result ordering, not to bound the work done.
      const considered = owned
        .filter((game) => !existingSteamAppIds.has(game.appId))
        .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes);

      // Every game already on the shelf is, by definition, owned - mark those too (using the
      // igdbId already on file, no extra Steam/IGDB lookups needed) so ownership coverage isn't
      // limited to whatever a single import run actually creates (issue #176).
      const ownedIgdbIds: number[] = shelfGames.map((g) => g.igdbId);

      const totalOwned = owned.length;
      const consideredCount = considered.length;
      let imported = 0;
      let skipped = 0;
      // One IGDB lookup per unowned game can take a while for a big library - progress is written
      // to Redis after every game so the shelf UI can poll it and show live counts instead of a
      // bare "Importing…" for however long the whole batch takes (see SteamImportCard.tsx).
      await setSteamImportProgress(userId, { totalOwned, consideredCount, imported, skipped, done: false });

      for (const game of considered) {
        try {
          const igdbId = await findIgdbIdBySteamAppId(game.appId);
          if (igdbId === null) {
            skipped++;
            continue;
          }
          if (existingIgdbIdSet.has(igdbId)) {
            ownedIgdbIds.push(igdbId);
            skipped++;
            continue;
          }
          const resolved = await resolveGameForCreation(igdbId, undefined, STEAM_IMPORT_PLATFORM_LABEL);
          await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId,
              title: resolved.title,
              platform: resolved.platform,
              genre: resolved.genre,
              maxCoopPlayers: resolved.maxCoopPlayers,
              timeToBeatHours: resolved.timeToBeatHours,
              ggDealsUrl: resolved.ggDealsUrl,
              steamAppid: resolved.steamAppId,
              coverImageUrl: resolved.coverImageUrl,
              releaseYear: resolved.releaseYear,
            },
          });
          existingIgdbIdSet.add(igdbId);
          ownedIgdbIds.push(igdbId);
          imported++;
        } catch {
          // One game failing to resolve (IGDB hiccup, no match, etc.) shouldn't abort the batch.
          skipped++;
        } finally {
          await setSteamImportProgress(userId, { totalOwned, consideredCount, imported, skipped, done: false });
        }
      }
      if (imported > 0) await invalidateExistingIgdbIds(null, userId);
      await markOwned(userId, ownedIgdbIds);

      const result: ImportSteamLibraryResult = { totalOwned, consideredCount, imported, skipped };
      await setSteamImportProgress(userId, { ...result, done: true });
      return result;
    },
  );

  app.get(
    '/api/games/import-steam-library/progress',
    // Explicit per-route limit rather than relying on the global default - this is polled once a
    // second while an import runs (PROGRESS_POLL_INTERVAL_MS in useSteamImport.ts), so it needs
    // real headroom above that legitimate cadence rather than the tighter limits used elsewhere
    // in this file for one-off/rare actions.
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const progress: SteamImportProgress | null = await getSteamImportProgress(userId);
      return { progress };
    },
  );

  // Wishlist counterpart to the library import above (issue #228) - same dedup/skip logic, but
  // adds with status `wishlist` instead of the default, and never calls markOwned (a wishlisted
  // game is explicitly *not* owned yet - that's the whole point of tracking it here). No progress
  // polling: wishlists are typically much smaller than a full owned library, so a single request/
  // response round trip is fine for now.
  app.post(
    '/api/games/import-steam-wishlist',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      if (!env.STEAM_API_KEY) {
        throw new HttpError(400, 'Steam integration is not configured on this server.');
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const steamId64 = resolveSteamId64(user);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to import your wishlist.');
      }

      const wishlistAppIds = await getWishlistAppIds(steamId64, env.STEAM_API_KEY);

      const [existingIgdbIdSet, shelfGames] = await Promise.all([
        existingIgdbIds(null, userId),
        prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true } }),
      ]);
      const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

      const considered = wishlistAppIds.filter((appId) => !existingSteamAppIds.has(appId));

      const totalWishlisted = wishlistAppIds.length;
      const consideredCount = considered.length;
      let imported = 0;
      let skipped = 0;

      for (const appId of considered) {
        try {
          const igdbId = await findIgdbIdBySteamAppId(appId);
          if (igdbId === null || existingIgdbIdSet.has(igdbId)) {
            skipped++;
            continue;
          }
          const resolved = await resolveGameForCreation(igdbId, undefined, STEAM_IMPORT_PLATFORM_LABEL);
          await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId,
              title: resolved.title,
              platform: resolved.platform,
              genre: resolved.genre,
              maxCoopPlayers: resolved.maxCoopPlayers,
              timeToBeatHours: resolved.timeToBeatHours,
              ggDealsUrl: resolved.ggDealsUrl,
              steamAppid: resolved.steamAppId,
              coverImageUrl: resolved.coverImageUrl,
              releaseYear: resolved.releaseYear,
              status: 'wishlist',
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

      const result: ImportSteamWishlistResult = { totalWishlisted, consideredCount, imported, skipped };
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

  // Personal Shelf only (issue #205) - scoped by roomId: null + addedBy in the query itself rather
  // than a per-id requireGameReadAccess loop, so one request updates any number of shelf games in a
  // single query instead of N round trips (the shelf is exactly the case with 100s-800s of games).
  app.patch<{ Body: BulkUpdateGameStatusRequest; Querystring: { region?: string } }>(
    '/api/games/bulk-status',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { gameIds, status } = request.body ?? {};

      if (!Array.isArray(gameIds) || gameIds.length === 0) {
        throw new HttpError(400, 'gameIds must be a non-empty array');
      }
      if (gameIds.length > MAX_GAMES_PER_LIST) {
        throw new HttpError(400, `Cannot update more than ${MAX_GAMES_PER_LIST} games at once`);
      }
      if (!GAME_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');

      const where = { id: { in: gameIds }, roomId: null, addedBy: userId };
      await prisma.game.updateMany({ where, data: { status } });

      const updated = await prisma.game.findMany({ where, include: gameInclude });
      return { games: await serializeGames(updated, userId, parseRegion(request.query.region)) };
    },
  );

  // Personal Shelf only, same scoping/reasoning as bulk-status above. The `where` clause (roomId:
  // null, addedBy: userId) is itself the access check here - equivalent to requireGameDeleteAccess
  // for a shelf item (see that function), so no per-id check is needed.
  app.delete<{ Body: BulkRemoveGamesRequest }>(
    '/api/games/bulk',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { gameIds } = request.body ?? {};

      if (!Array.isArray(gameIds) || gameIds.length === 0) {
        throw new HttpError(400, 'gameIds must be a non-empty array');
      }
      if (gameIds.length > MAX_GAMES_PER_LIST) {
        throw new HttpError(400, `Cannot remove more than ${MAX_GAMES_PER_LIST} games at once`);
      }

      await prisma.game.deleteMany({ where: { id: { in: gameIds }, roomId: null, addedBy: userId } });
      await invalidateExistingIgdbIds(null, userId);
      reply.status(204);
      return null;
    },
  );

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    await requireGameDeleteAccess(game, userId);

    await prisma.game.delete({ where: { id: game.id } });
    await invalidateExistingIgdbIds(game.roomId, game.addedBy);
    reply.status(204);
    return null;
  });

  // Room members' (or, on the Personal Shelf, just the caller's) Steam achievement progress on
  // this game - fetched on demand when the detail modal opens rather than baked into every
  // shelf/room list load, since it's a live per-(player, game) Steam API call each. Players
  // without a usable Steam account (see resolveSteamId64), or with nothing to report (private
  // profile, or the game has no achievements), are simply omitted from the response.
  app.get<{ Params: { id: string } }>(
    '/api/games/:id/achievements',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      if (!env.STEAM_API_KEY || !game.steamAppid) {
        return { players: [] };
      }
      const steamAppid = game.steamAppid;

      const audienceIds = game.roomId
        ? (await prisma.roomMember.findMany({ where: { roomId: game.roomId }, select: { userId: true } })).map((m) => m.userId)
        : [userId];
      const audience = await prisma.user.findMany({ where: { id: { in: audienceIds } } });

      const players = (
        await Promise.all(
          audience.map(async (player): Promise<PlayerAchievements | null> => {
            const steamId64 = resolveSteamId64(player);
            if (!steamId64) return null;
            const counts = await getAchievementCounts(steamId64, steamAppid, env.STEAM_API_KEY!);
            return counts && { user: toUserDto(player), unlocked: counts.unlocked, total: counts.total };
          }),
        )
      ).filter((p): p is PlayerAchievements => p !== null);

      return { players };
    },
  );

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

  app.post<{ Params: { id: string }; Querystring: { region?: string } }>(
    '/api/games/:id/refresh-price',
    // Each call is a live outbound request to gg.deals, not just a DB read - a tight limit here
    // protects that upstream budget the same way the other per-route limits in this file protect
    // ours, on top of the global default.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      await refreshGamePricing(game.steamAppid);
      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId, parseRegion(request.query.region)) };
    },
  );

  app.patch<{ Params: { id: string }; Body: SetTargetPriceRequest }>(
    '/api/games/:id/target-price',
    // Only ever hit by a direct user action (setting/clearing one alert from the game card), same
    // class of route as the notification ones - not something a normal session comes close to.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const { targetPrice } = request.body;
      let normalized: string | null = null;
      if (targetPrice != null) {
        const parsed = Number(targetPrice);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new HttpError(400, 'Target price must be a positive number');
        }
        normalized = parsed.toFixed(2);
      }

      await prisma.game.update({ where: { id: game.id }, data: { targetPrice: normalized } });
      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId) };
    },
  );

  app.patch<{ Params: { id: string }; Body: SetGameOwnershipRequest }>(
    '/api/games/:id/ownership',
    // Same class of route as target-price - a direct user action toggling one game's state, not
    // something a normal session comes close to hitting.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const { owned } = request.body;
      await setOwnership(userId, game.igdbId, owned);

      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId) };
    },
  );

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
