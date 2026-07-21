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
  getAchievementDetails,
  getGlobalAchievementRarity,
  setSteamImportProgress,
  getSteamImportProgress,
  acquireSteamImportLock,
  releaseSteamImportLock,
  setSteamWishlistImportProgress,
  getSteamWishlistImportProgress,
  acquireSteamWishlistImportLock,
  releaseSteamWishlistImportLock,
} from '../services/steamLibrary.js';
import type { OwnedSteamGame } from '../services/steamLibrary.js';
import { setOwnership, markOwned } from '../services/gameOwnership.js';
import { toUserDto } from '../util/dto.js';
import { env } from '../config/env.js';
import type {
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CreateGameRequest,
  MoveGameRequest,
  PlayerAchievements,
  PriceRegion,
  SetGameOwnershipRequest,
  SetTargetPriceRequest,
  SteamImportProgress,
  SteamImportStarted,
  SteamWishlistImportProgress,
  SteamWishlistImportStarted,
  UpdateGameStatusRequest,
  VoteRequest,
  YearInReview,
  YearInReviewGenreCount,
  YearInReviewGameHours,
  YearInReviewGroupCompletion,
  YearInReviewRareAchievement,
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

/** The slow part of a Steam library import - one IGDB lookup (and possibly a create) per unowned
 * game, which can take minutes for a big library. Run in the background by the route below rather
 * than awaited inline, since a reverse proxy/CDN in front of this server won't hold a connection
 * open that long (seen in production as a Cloudflare 524). `existingIgdbIdSet`/`ownedIgdbIds` are
 * mutated in place as games are processed. Always leaves SteamImportProgress `done: true` when it
 * returns, even on an unexpected error, so a client polling for completion doesn't spin forever. */
async function runSteamLibraryImportLoop(
  userId: string,
  considered: OwnedSteamGame[],
  existingIgdbIdSet: Set<number>,
  ownedIgdbIds: number[],
  totalOwned: number,
  consideredCount: number,
): Promise<void> {
  let imported = 0;
  let skipped = 0;
  try {
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
  } finally {
    await setSteamImportProgress(userId, { totalOwned, consideredCount, imported, skipped, done: true });
  }
}

/** Wishlist counterpart to runSteamLibraryImportLoop above (issue #245) - same reasoning (one IGDB
 * lookup, and possibly a create, per considered game; run in the background rather than awaited
 * inline so a big wishlist can't run past a reverse proxy/CDN's connection timeout), minus the
 * ownership bookkeeping: a wishlisted game is explicitly *not* owned yet, so there's no
 * ownedIgdbIds/markOwned equivalent here. `existingIgdbIdSet` is mutated in place as games are
 * processed. Always leaves SteamWishlistImportProgress `done: true` when it returns, even on an
 * unexpected error, so a client polling for completion doesn't spin forever. */
async function runSteamWishlistImportLoop(
  userId: string,
  considered: number[],
  existingIgdbIdSet: Set<number>,
  totalWishlisted: number,
  consideredCount: number,
): Promise<void> {
  let imported = 0;
  let skipped = 0;
  try {
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
      } finally {
        await setSteamWishlistImportProgress(userId, { totalWishlisted, consideredCount, imported, skipped, done: false });
      }
    }
    if (imported > 0) await invalidateExistingIgdbIds(null, userId);
  } finally {
    await setSteamWishlistImportProgress(userId, { totalWishlisted, consideredCount, imported, skipped, done: true });
  }
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
    async (request, reply) => {
      const userId = await request.requireAuth();
      if (!env.STEAM_API_KEY) {
        throw new HttpError(400, 'Steam integration is not configured on this server.');
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const steamId64 = resolveSteamId64(user);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to import your library.');
      }

      // Without this, a retried click (e.g. after a slow reverse proxy/CDN times out the request
      // below before the import is actually done - see runSteamLibraryImportLoop) starts a second
      // run that independently decides the same not-yet-shelved games are new, creating duplicates.
      if (!(await acquireSteamImportLock(userId))) {
        throw new HttpError(409, 'A Steam library import is already running for your account.');
      }

      try {
        const owned = await getOwnedSteamGames(steamId64, env.STEAM_API_KEY);

        const [existingIgdbIdSet, shelfGames] = await Promise.all([
          existingIgdbIds(null, userId),
          prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true, igdbId: true } }),
        ]);
        const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

        // No cap - a click imports the whole not-yet-shelved library in one go (issue #175).
        // Ordered most-played first purely for a nicer result ordering, not to bound the work done.
        const considered = owned
          .filter((game) => !existingSteamAppIds.has(game.appId))
          .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes);

        // Every game already on the shelf is, by definition, owned - mark those too (using the
        // igdbId already on file, no extra Steam/IGDB lookups needed) so ownership coverage isn't
        // limited to whatever a single import run actually creates (issue #176).
        const ownedIgdbIds: number[] = shelfGames.map((g) => g.igdbId);

        const totalOwned = owned.length;
        const consideredCount = considered.length;
        // Progress is written to Redis before the slow loop starts (and after every game once it's
        // running) so the shelf UI can poll it for live counts instead of a bare "Importing…" for
        // however long the whole batch takes (see SteamImportCard.tsx).
        await setSteamImportProgress(userId, { totalOwned, consideredCount, imported: 0, skipped: 0, done: false });

        runSteamLibraryImportLoop(userId, considered, existingIgdbIdSet, ownedIgdbIds, totalOwned, consideredCount)
          .catch((err) => request.log.error({ err }, 'Steam library import failed'))
          .finally(() => releaseSteamImportLock(userId));

        reply.status(202);
        const started: SteamImportStarted = { totalOwned, consideredCount };
        return started;
      } catch (err) {
        await releaseSteamImportLock(userId);
        throw err;
      }
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

  // Wishlist counterpart to the library import above (issue #228 added it, #245 moved it to this
  // same background-and-poll shape once it turned out wishlists aren't reliably small enough for a
  // single request/response round trip either) - same dedup/skip logic and backgrounding/locking
  // pattern as library import, but adds with status `wishlist` instead of the default, and never
  // calls markOwned (a wishlisted game is explicitly *not* owned yet - that's the whole point of
  // tracking it here).
  app.post(
    '/api/games/import-steam-wishlist',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      if (!env.STEAM_API_KEY) {
        throw new HttpError(400, 'Steam integration is not configured on this server.');
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const steamId64 = resolveSteamId64(user);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to import your wishlist.');
      }

      // Without this, a retried click (e.g. after a slow reverse proxy/CDN times out the request
      // below before the import is actually done - see runSteamWishlistImportLoop) starts a second
      // run that independently decides the same not-yet-shelved games are new, creating duplicates.
      if (!(await acquireSteamWishlistImportLock(userId))) {
        throw new HttpError(409, 'A Steam wishlist import is already running for your account.');
      }

      try {
        const wishlistAppIds = await getWishlistAppIds(steamId64, env.STEAM_API_KEY);

        const [existingIgdbIdSet, shelfGames] = await Promise.all([
          existingIgdbIds(null, userId),
          prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true } }),
        ]);
        const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

        const considered = wishlistAppIds.filter((appId) => !existingSteamAppIds.has(appId));

        const totalWishlisted = wishlistAppIds.length;
        const consideredCount = considered.length;
        // Progress is written to Redis before the slow loop starts (and after every game once it's
        // running) so the shelf UI can poll it for live counts instead of a bare "Importing…" for
        // however long the whole batch takes (see SteamWishlistImportCard.tsx).
        await setSteamWishlistImportProgress(userId, { totalWishlisted, consideredCount, imported: 0, skipped: 0, done: false });

        runSteamWishlistImportLoop(userId, considered, existingIgdbIdSet, totalWishlisted, consideredCount)
          .catch((err) => request.log.error({ err }, 'Steam wishlist import failed'))
          .finally(() => releaseSteamWishlistImportLock(userId));

        reply.status(202);
        const started: SteamWishlistImportStarted = { totalWishlisted, consideredCount };
        return started;
      } catch (err) {
        await releaseSteamWishlistImportLock(userId);
        throw err;
      }
    },
  );

  app.get(
    '/api/games/import-steam-wishlist/progress',
    // Same reasoning/limit as the library import progress route above - polled once a second while
    // an import runs (PROGRESS_POLL_INTERVAL_MS in useSteamImport.ts).
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const progress: SteamWishlistImportProgress | null = await getSteamWishlistImportProgress(userId);
      return { progress };
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

  // On-demand only (issue #230) - no scheduled job, no delivery mechanism, just a summary
  // generated from data that's already sitting in the DB whenever someone asks for it.
  const YEAR_IN_REVIEW_TOP_VOTED_LIMIT = 5;

  // Capped so a chatty account (lots of Done games with linked Steam app ids) doesn't blow up the
  // number of Steam Web API calls one recap triggers - same reasoning as MAX_STEAM_IMPORT_CONSIDERED.
  const YEAR_IN_REVIEW_MOST_TIME_CONSUMING_LIMIT = 5;
  const YEAR_IN_REVIEW_RAREST_ACHIEVEMENTS_LIMIT = 5;
  const YEAR_IN_REVIEW_STEAM_GAMES_LIMIT = 25;
  // How many not-yet-Done games (with a linked Steam app id) get checked against Steam
  // achievements to auto-detect a completion the caller never clicked "Done" for in the app.
  // Ordered most-recently-touched first, same reasoning as the other caps in this route.
  const YEAR_IN_REVIEW_AUTODETECT_CANDIDATE_LIMIT = 40;

  type YearInReviewGameRow = { id: string; title: string; genre: string | null; timeToBeatHours: number | null; steamAppid: number | null; roomId: string | null };

  app.get(
    '/api/me/year-in-review',
    // Same class of route as bulk-status/target-price - a direct user action from Profile
    // Settings, not something a normal session comes close to hitting.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      const windowEnd = new Date();
      const windowStart = new Date(windowEnd);
      windowStart.setFullYear(windowStart.getFullYear() - 1);
      const windowStartSeconds = Math.floor(windowStart.getTime() / 1000);
      const windowEndSeconds = Math.floor(windowEnd.getTime() / 1000);

      const [user, doneGames, memberships] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        // updatedAt is a proxy for "when this was marked Done" - there's no dedicated completedAt
        // timestamp, and any edit bumps updatedAt, so this can overcount slightly (e.g. a stray
        // status flip-flop) rather than undercount. Good enough for a rough yearly summary.
        prisma.game.findMany({
          where: { addedBy: userId, status: 'done', updatedAt: { gte: windowStart } },
          select: { id: true, title: true, genre: true, timeToBeatHours: true, steamAppid: true, roomId: true },
        }),
        prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } }),
      ]);

      const steamId64 = resolveSteamId64(user);

      // The app's Done status is opt-in (see the nudge in GameDetailModal.tsx), so relying on it
      // alone undercounts anyone who tracks completion via Steam instead - check not-yet-Done
      // games with a linked Steam app id for 100% achievement completion within the window, and
      // fold in whatever that turns up alongside the manually-marked games above.
      let autoDetected: YearInReviewGameRow[] = [];
      if (steamId64 && env.STEAM_API_KEY) {
        const apiKey = env.STEAM_API_KEY;
        const candidates = await prisma.game.findMany({
          where: { addedBy: userId, status: { notIn: ['done', 'dropped'] }, steamAppid: { not: null } },
          select: { id: true, title: true, genre: true, timeToBeatHours: true, steamAppid: true, roomId: true },
          orderBy: { updatedAt: 'desc' },
          take: YEAR_IN_REVIEW_AUTODETECT_CANDIDATE_LIMIT,
        });

        const detected = await Promise.all(
          candidates.map(async (g): Promise<YearInReviewGameRow | null> => {
            const appId = g.steamAppid!;
            const [counts, unlocked] = await Promise.all([
              getAchievementCounts(steamId64, appId, apiKey),
              getAchievementDetails(steamId64, appId, apiKey),
            ]);
            if (!counts || counts.total === 0 || counts.unlocked < counts.total) return null;
            const lastUnlock = Math.max(...unlocked.map((a) => a.unlockTime));
            if (lastUnlock < windowStartSeconds || lastUnlock > windowEndSeconds) return null;
            return g;
          }),
        );
        autoDetected = detected.filter((g): g is YearInReviewGameRow => g !== null);
      }

      const combinedDone: YearInReviewGameRow[] = [...doneGames, ...autoDetected];
      const doneCount = combinedDone.length;
      const steamAutoDetectedCount = autoDetected.length;
      const estimatedHours = combinedDone.reduce((sum, g) => sum + (g.timeToBeatHours ?? 0), 0);

      const genreCounts = new Map<string, number>();
      for (const g of combinedDone) {
        if (!g.genre) continue;
        genreCounts.set(g.genre, (genreCounts.get(g.genre) ?? 0) + 1);
      }
      const genreSpread: YearInReviewGenreCount[] = Array.from(genreCounts.entries())
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

      const mostTimeConsuming: YearInReviewGameHours[] = combinedDone
        .filter((g) => g.timeToBeatHours != null)
        .map((g) => ({ id: g.id, title: g.title, hours: g.timeToBeatHours! }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, YEAR_IN_REVIEW_MOST_TIME_CONSUMING_LIMIT);

      // "Completed with ..." - the same combinedDone games, bucketed by which room (if any) they
      // belong to, so the recap can name the room and who's currently in it rather than just a
      // flat list. Personal Shelf games (roomId null) land in one "solo" bucket with no members.
      const completedRoomIds = Array.from(new Set(combinedDone.map((g) => g.roomId).filter((id): id is string => id != null)));
      const [rooms, roomMembers] = await Promise.all([
        completedRoomIds.length > 0
          ? prisma.room.findMany({ where: { id: { in: completedRoomIds } }, select: { id: true, name: true } })
          : Promise.resolve([]),
        completedRoomIds.length > 0
          ? prisma.roomMember.findMany({
              where: { roomId: { in: completedRoomIds } },
              select: { roomId: true, userId: true, user: { select: { displayName: true } } },
            })
          : Promise.resolve([]),
      ]);
      const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
      const memberNamesByRoomId = new Map<string, string[]>();
      for (const m of roomMembers) {
        if (m.userId === userId) continue;
        const names = memberNamesByRoomId.get(m.roomId) ?? [];
        names.push(m.user.displayName);
        memberNamesByRoomId.set(m.roomId, names);
      }
      const gamesByGroupKey = new Map<string, { roomId: string | null; games: { id: string; title: string }[] }>();
      for (const g of combinedDone) {
        const key = g.roomId ?? '';
        const existing = gamesByGroupKey.get(key);
        if (existing) existing.games.push({ id: g.id, title: g.title });
        else gamesByGroupKey.set(key, { roomId: g.roomId, games: [{ id: g.id, title: g.title }] });
      }
      const completedByGroup: YearInReviewGroupCompletion[] = Array.from(gamesByGroupKey.values()).map((group) => ({
        roomId: group.roomId,
        roomName: group.roomId != null ? (roomNameById.get(group.roomId) ?? null) : null,
        memberNames: group.roomId != null ? (memberNamesByRoomId.get(group.roomId) ?? []) : [],
        games: group.games,
      }));

      // "What did the squad like" across every room the caller is in right now - every game in
      // those rooms, not just ones the caller added or voted on themselves, ranked by vote weight
      // cast within the window (regardless of who cast it).
      const roomIds = memberships.map((m) => m.roomId);
      const votes =
        roomIds.length > 0
          ? await prisma.vote.findMany({
              where: { createdAt: { gte: windowStart }, game: { roomId: { in: roomIds } } },
              select: { value: true, game: { select: { id: true, title: true, coverImageUrl: true } } },
            })
          : [];

      const scoreByGame = new Map<string, { title: string; coverImageUrl: string | null; voteScore: number }>();
      for (const v of votes) {
        const existing = scoreByGame.get(v.game.id);
        if (existing) existing.voteScore += v.value;
        else scoreByGame.set(v.game.id, { title: v.game.title, coverImageUrl: v.game.coverImageUrl, voteScore: v.value });
      }
      const topVoted = Array.from(scoreByGame.entries())
        .map(([id, g]) => ({ id, ...g }))
        .sort((a, b) => b.voteScore - a.voteScore)
        .slice(0, YEAR_IN_REVIEW_TOP_VOTED_LIMIT);

      let achievementsUnlocked = 0;
      let rarestAchievements: YearInReviewRareAchievement[] = [];

      const steamGames = combinedDone.filter((g) => g.steamAppid != null).slice(0, YEAR_IN_REVIEW_STEAM_GAMES_LIMIT);
      if (steamId64 && env.STEAM_API_KEY && steamGames.length > 0) {
        const apiKey = env.STEAM_API_KEY;

        const rareCandidates: YearInReviewRareAchievement[] = [];
        await Promise.all(
          steamGames.map(async (g) => {
            const appId = g.steamAppid!;
            const unlocked = (await getAchievementDetails(steamId64, appId, apiKey)).filter(
              (a) => a.unlockTime >= windowStartSeconds && a.unlockTime <= windowEndSeconds,
            );
            if (unlocked.length === 0) return;
            achievementsUnlocked += unlocked.length;

            const rarity = await getGlobalAchievementRarity(appId);
            for (const a of unlocked) {
              const globalUnlockPercent = rarity.get(a.apiname);
              if (globalUnlockPercent === undefined) continue;
              rareCandidates.push({
                gameTitle: g.title,
                achievementName: a.displayName,
                globalUnlockPercent,
                unlockedAt: new Date(a.unlockTime * 1000).toISOString(),
              });
            }
          }),
        );

        rarestAchievements = rareCandidates
          .sort((a, b) => a.globalUnlockPercent - b.globalUnlockPercent)
          .slice(0, YEAR_IN_REVIEW_RAREST_ACHIEVEMENTS_LIMIT);
      }

      const result: YearInReview = {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        doneCount,
        steamAutoDetectedCount,
        estimatedHours,
        topVoted,
        genreSpread,
        mostTimeConsuming,
        completedByGroup,
        achievementsUnlocked,
        rarestAchievements,
      };
      return result;
    },
  );
}
