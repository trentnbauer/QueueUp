import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoomPlatform, getRoom } from '../services/roomAccess.js';
import {
  loadGameOr404,
  requireGameReadAccess,
  requireGameDeleteAccess,
  requireNotDuplicate,
  requireNotAlreadySuggested,
  rethrowAsDuplicateGame,
  existingIgdbIds,
  invalidateExistingIgdbIds,
} from '../services/gameAccess.js';
import { gameInclude, serializeGame, serializeGames } from '../services/gameSerializer.js';
import {
  searchIntake,
  searchCollectionsIntake,
  collectionGamesIntake,
  resolveGameForCreation,
  refreshGamePricing,
  backfillSteamAppId,
  setManualSteamMatch,
  defaultStatusForRelease,
  assertPlatformMatch,
  trendingIntake,
  dlcIntake,
  linkDlcToBaseGame,
  createGameForUser,
} from '../services/gameIntake.js';
import { notifyRoom } from '../services/notifications.js';
import {
  platformFamilies,
  findIgdbIdBySteamAppId,
  findIgdbIdByExactTitle,
  getGameDetail,
  isAddonCategory,
} from '../services/igdbClient.js';
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
  searchSteamStore,
} from '../services/steamLibrary.js';
import type { OwnedSteamGame } from '../services/steamLibrary.js';
import { toggleOwnershipForPlatform, setOwnershipPlatforms, markOwned } from '../services/gameOwnership.js';
import { recordStatusTransition } from '../services/playLog.js';
import { getCurrentPlaytimeMinutesForGames } from '../services/playtimeTracking.js';
import { summarizeTimeToBeat, summarizeActiveHoursToBeat, pickMostNeglectedGame, bucketBacklogAge } from '../services/backlogInsights.js';
import { unlockBadges } from '../services/badges.js';
import {
  logRoomActivity,
  logShelfActivity,
  getShelfActivityPage,
  encodeActivityCursor,
  decodeActivityCursor,
} from '../services/roomActivity.js';
import { lookupBarcodeGame } from '../services/barcodeService.js';
import { findDetectedSteamCompletions } from '../services/steamCompletionDetection.js';
import { toUserDto } from '../util/dto.js';
import { env } from '../config/env.js';
import type {
  BacklogInsights,
  BadgeDefinition,
  BadgeKey,
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CreateGameRequest,
  CreateGameResponse,
  CrossRoomBeaten,
  CrossRoomBeatenGroup,
  CrossRoomPlaying,
  CrossRoomPlayingGroup,
  GameStatus,
  MoveGameRequest,
  NextPickGame,
  NextPickResponse,
  NextPickSuggestion,
  PlayerAchievements,
  PlayLogEntry,
  PriceRegion,
  SetGameOwnershipRequest,
  SetGamePrerequisiteRequest,
  SetManualPriceRequest,
  SetSteamMatchRequest,
  SetTargetPriceRequest,
  ShelfActivityPage,
  ShelfActivityType,
  SteamImportProgress,
  SteamImportStarted,
  SteamCompletionsSyncResult,
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
import { collectionProgress, IGDB_PLATFORM_NAMES, isNeglectedBacklogGame, PRICE_REGION_LABELS, weightedPick } from '@queueup/shared';

// Steam ownership only ever implies PC (see resolveGameForCreation's platformLabelOverride) -
// IGDB_PLATFORM_NAMES.pc[0] is the canonical "PC (Microsoft Windows)" label already used
// elsewhere for platform-filter matching (see ownedPlatformLabels in Header.tsx).
const STEAM_IMPORT_PLATFORM_LABEL = IGDB_PLATFORM_NAMES.pc[0];

const GAME_STATUSES = ['backlog', 'playing', 'done', 'dropped', 'wishlist', 'replay', 'play_next', 'wont_play'] as const;
// Mirrors web/src/components/gameGridLogic.ts's GAME_STATUS_LABEL - kept as a separate copy since
// that file lives in the web package, not something the server can import from.
const STATUS_LABELS: Record<GameStatus, string> = {
  backlog: 'Backlog',
  play_next: 'Play Next',
  playing: 'Playing',
  done: 'Beaten',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
  replay: 'Replay',
  wont_play: "Won't Play",
};
const PRICE_REGIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];
// Shelves/rooms are meant to hold an actively-curated backlog, not a lifetime game archive - this
// caps a single query so one runaway list can't pull unbounded rows (and unbounded price lookups)
// on every page load. Well above any real shelf/room size today.
const MAX_GAMES_PER_LIST = 500;

function parseRegion(region?: string): PriceRegion | undefined {
  return PRICE_REGIONS.includes(region as PriceRegion) ? (region as PriceRegion) : undefined;
}

/** Builds the "mark it Beaten on your Personal Shelf too?" suggestion (see ShelfSyncSuggestion's
 * doc comment) - null when the same game (by igdbId) is already marked Beaten on the shelf, since
 * there's nothing to suggest then. */
async function buildShelfSyncSuggestion(
  userId: string,
  igdbId: number,
  title: string,
): Promise<{ shelfGameId: string | null; igdbId: number; title: string } | undefined> {
  const shelfGame = await prisma.game.findFirst({
    where: { roomId: null, addedBy: userId, igdbId },
    select: { id: true, status: true },
  });
  if (shelfGame?.status === 'done') return undefined;
  return { shelfGameId: shelfGame?.id ?? null, igdbId, title };
}

/** Which badge (issue #489), if any, a status transition should attempt to unlock - `done` splits
 * on `roomId` since "beat it solo" and "beat it in a room" are separate badges, the rest are the
 * same regardless of where the game lives. Statuses with no badge (backlog, playing, play_next)
 * return an empty array rather than null, so every call site can just spread the result. */
function statusBadgeKeys(status: GameStatus, roomId: string | null): BadgeKey[] {
  switch (status) {
    case 'done':
      return [roomId === null ? 'first_solo_beat' : 'first_room_beat'];
    case 'dropped':
      return ['first_drop'];
    case 'replay':
      return ['first_replay'];
    case 'wishlist':
      return ['first_wishlist'];
    default:
      return [];
  }
}

/** Franchise Finisher / Full Package (issue: "what other achievements can you think of") - both
 * only apply the moment a game actually *becomes* Done (checked by the caller, not here - a
 * no-op re-save of an already-Done game shouldn't re-run this), and both need to look past this
 * one Game row at its siblings in the same shelf/room scope, which single-game-status-change's
 * own gameInclude doesn't fetch. `game` only needs the handful of scalar fields used below, not a
 * full GameWithRelations, so this takes exactly those rather than importing that type here too.
 *
 * Only wired into the single-game status route (games.ts' PATCH /:id/status), not bulk-status -
 * bulk-status is Personal-Shelf-only mass cleanup, not the "I just finished the whole trilogy"
 * moment this is meant to catch, and re-deriving a per-game scope for up to MAX_GAMES_PER_LIST
 * games in one bulk call isn't worth it for a bonus achievement. */
async function completionBadgeKeys(
  userId: string,
  game: { id: string; roomId: string | null; igdbCollectionId: number | null; baseGameId: string | null },
): Promise<BadgeKey[]> {
  const keys: BadgeKey[] = [];
  const scopeWhere: Prisma.GameWhereInput = game.roomId !== null ? { roomId: game.roomId } : { roomId: null, addedBy: userId };

  // Franchise Finisher - every entry sharing this igdbCollectionId in the same scope is Beaten,
  // and there's more than one entry to have actually "finished" - same >= 2 threshold as the
  // client's own franchiseProgress display (gameGridLogic.ts' collectionProgress), recomputed
  // here since that logic is client-only.
  if (game.igdbCollectionId !== null) {
    const collection = await prisma.game.findMany({
      where: { ...scopeWhere, igdbCollectionId: game.igdbCollectionId },
      select: { status: true },
    });
    if (collection.length >= 2 && collection.every((g) => g.status === 'done')) keys.push('first_franchise_finished');
  }

  // Full Package - the base game and every DLC linked to it (in the same scope) are all Beaten,
  // and there's at least one DLC entry beyond the base game itself to have completed.
  const baseGameId = game.baseGameId ?? game.id;
  const family = await prisma.game.findMany({
    where: { ...scopeWhere, OR: [{ id: baseGameId }, { baseGameId }] },
    select: { status: true },
  });
  if (family.length >= 2 && family.every((g) => g.status === 'done')) keys.push('first_dlc_completionist');

  return keys;
}

/** Backlog Buster (issue: "what other achievements can you think of") - was this game neglected
 * *before* the status change the caller is currently applying, i.e. does `game` (the pre-update
 * row, with its pre-update status/createdAt/updatedAt/votes) read as neglected right now. Thin
 * Date->ISO-string adapter over the shared `isNeglectedBacklogGame` (packages/shared) - this used
 * to be its own hand-duplicated copy of that function's date math, back when the client-side
 * version it was mirroring wasn't reachable from server code; it's been importable from
 * @queueup/shared for a while now (see the /api/me/next-pick route below, which already imports
 * it directly), so this just forwards instead of maintaining a second copy of the same bug-prone
 * date arithmetic (issue #522) to keep in sync by hand. */
function wasNeglectedBacklogGame(game: { status: GameStatus; createdAt: Date; updatedAt: Date; votes: { createdAt: Date }[] }): boolean {
  return isNeglectedBacklogGame({
    status: game.status,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    votes: game.votes.map((v) => ({ createdAt: v.createdAt.toISOString() })),
  });
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
        // Issue #373: IGDB's external_games Steam link is crowd-sourced and sometimes just never
        // gets filled in for a title that's genuinely live on Steam (seen with Wolfenstein: The
        // New Order, The Old Blood, and The New Colossus) - that game would otherwise be silently
        // skipped on every import run forever. Falls back to an exact-title IGDB search using
        // Steam's own name for the app before giving up on it.
        const igdbId = (await findIgdbIdBySteamAppId(game.appId)) ?? (await findIgdbIdByExactTitle(game.name));
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
        const created = await prisma.game.create({
          data: {
            roomId: null,
            addedBy: userId,
            igdbId,
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
            // Issue #370: a pre-purchased/pre-loaded but not-yet-released Steam game defaults into
            // the wishlist instead of the backlog, same as the manual add path.
            status: defaultStatusForRelease(resolved.releaseDate),
          },
        });
        // Issue #338: a Steam library commonly includes DLC entries alongside their base game -
        // ensure the base game is present on the shelf too and link this row back to it. Same
        // platform-label override as this DLC's own row above (Steam ownership only ever means
        // PC), and the base game counts as owned/already-considered too - or the loop would try
        // (and fail) to re-create it when it later reaches the base game's own considered entry,
        // silently losing its owned mark in the process.
        if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
          const base = await linkDlcToBaseGame(
            created.id,
            resolved.parentGameIgdbId,
            null,
            userId,
            undefined,
            STEAM_IMPORT_PLATFORM_LABEL,
          );
          if (base && !existingIgdbIdSet.has(base.baseIgdbId)) {
            existingIgdbIdSet.add(base.baseIgdbId);
            ownedIgdbIds.push(base.baseIgdbId);
          }
        }
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
    // Unconditional, not gated on imported > 0 (issue #489) - once a library is fully synced,
    // every later re-sync considers zero games (see the route's `considered` filter above) and
    // would otherwise never import anything again, permanently locking this badge out for exactly
    // the users most likely to have already synced before this badge existed. Reaching this
    // function at all already means a real sync ran (Steam-linked, considered set built, loop
    // attempted) - that's "you synced your library from Steam," independent of whether this
    // particular run happened to find anything new.
    const unlockedBadges = await unlockBadges(userId, ['first_library_sync']);
    await setSteamImportProgress(userId, { totalOwned, consideredCount, imported, skipped, done: true, unlockedBadges });
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
        const created = await prisma.game.create({
          data: {
            roomId: null,
            addedBy: userId,
            igdbId,
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
            status: 'wishlist',
          },
        });
        // Issue #338: same base-game-ensure/link as the library import loop above, and same
        // bookkeeping fix (existingIgdbIdSet) so the loop doesn't re-attempt creating the base
        // game if it's also independently on the wishlist. Deliberately wishlist, not
        // defaultStatusForRelease's release-date guess - matches every sibling row this loop
        // creates (a wishlisted DLC's base game reads as "also on the wishlist," not "in the
        // backlog," until the person actually goes and gets it).
        if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
          const base = await linkDlcToBaseGame(
            created.id,
            resolved.parentGameIgdbId,
            null,
            userId,
            undefined,
            STEAM_IMPORT_PLATFORM_LABEL,
            'wishlist',
          );
          if (base) existingIgdbIdSet.add(base.baseIgdbId);
        }
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
    // first_wishlist genuinely requires having added a row (every row this loop creates is
    // status: 'wishlist', see above) - stays gated on imported > 0. first_library_sync doesn't:
    // same reasoning as runSteamLibraryImportLoop's own fix above, reaching this function at all
    // already means a real wishlist sync ran, so it's unconditional here too rather than
    // permanently unreachable once someone's wishlist is already fully synced (issue #489).
    const badgeKeys: BadgeKey[] = imported > 0 ? ['first_wishlist', 'first_library_sync'] : ['first_library_sync'];
    const unlockedBadges = await unlockBadges(userId, badgeKeys);
    await setSteamWishlistImportProgress(userId, { totalWishlisted, consideredCount, imported, skipped, done: true, unlockedBadges });
  }
}

export default async function gameRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; roomId?: string; offset?: string; hideAddons?: string; includeOwned?: string } }>(
    '/api/games/search',
    // Tighter than the global default (200/min) - matches the collections/:id sibling route below.
    // Worth calling out for this one specifically: infinite-scroll paging means a single search
    // session can now fire several requests in quick succession as the user scrolls, on top of the
    // debounced-typing requests, so this endpoint sees more traffic per legitimate use than before.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.query;
      if (roomId) await requireMembership(roomId, userId);
      // A platform-less room (issue #473) falls back to the caller's own owned platforms, same as
      // no room at all.
      const roomPlatform = roomId ? await getRoomPlatform(roomId) : null;
      const platforms = roomPlatform ? [roomPlatform] : await getOwnedPlatforms(userId);
      // Opt-in (pending-import review's "search manually" fallback needs to match an already-owned
      // game onto a new platform - the normal already-added exclusion below would hide it from
      // every result, leaving only its unowned DLC/add-ons visible). Every other caller leaves this
      // off and keeps the normal dedupe behavior.
      const includeOwned = request.query.includeOwned === 'true';
      const excludeIgdbIds = includeOwned ? undefined : await existingIgdbIds(roomId ?? null, userId);
      const query = request.query.q ?? '';
      const offset = Math.max(0, Number.parseInt(request.query.offset ?? '0', 10) || 0);
      // Opt-out (issue #345): hidden unless the caller explicitly asks to see everything.
      const hideAddons = request.query.hideAddons !== 'false';

      // Collections are shown once, above the (paginated) game list itself - re-searching them on
      // every "load more" page would just repeat the same franchise buttons for no benefit.
      const [searchPage, collections] = await Promise.all([
        searchIntake(query, platforms, excludeIgdbIds, offset, hideAddons),
        offset === 0 ? searchCollectionsIntake(query) : Promise.resolve([]),
      ]);
      return { ...searchPage, collections };
    },
  );

  // Issue #363: "Popular" browse tab in Add Game, alongside search - lets a group discover
  // something nobody had already thought to search for. Same room/platform scoping and
  // already-added exclusion as /api/games/search, no query string of its own.
  app.get<{ Querystring: { roomId?: string; hideAddons?: string } }>(
    '/api/games/trending',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.query;
      if (roomId) await requireMembership(roomId, userId);
      // A platform-less room (issue #473) falls back to the caller's own owned platforms, same as
      // no room at all.
      const roomPlatform = roomId ? await getRoomPlatform(roomId) : null;
      const platforms = roomPlatform ? [roomPlatform] : await getOwnedPlatforms(userId);
      const excludeIgdbIds = await existingIgdbIds(roomId ?? null, userId);
      const hideAddons = request.query.hideAddons !== 'false';

      const results = await trendingIntake(platforms, excludeIgdbIds, hideAddons);
      return { results };
    },
  );

  // Personal Shelf only (issue #402) - "scan a physical game's barcode" on Add Game. Not scoped to
  // a room/existing-igdb-id exclusion the way search/trending are above: a barcode identifies one
  // specific title, not a browsable list, and duplicate-adding is already guarded at create time
  // the same way a manual search-and-add is (see requireNotDuplicate).
  app.get<{ Querystring: { value?: string } }>(
    '/api/games/barcode-lookup',
    // Each call is a live outbound request to ScanDex, same class of route as steam-search.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      await request.requireAuth();
      const barcode = (request.query.value ?? '').trim();
      if (!barcode || !/^\d{6,14}$/.test(barcode)) {
        throw new HttpError(400, 'A valid UPC/EAN barcode is required');
      }

      const result = await lookupBarcodeGame(barcode);
      return { result };
    },
  );

  // Drill-down from a collection search result (issue #272) - lets Add Game add a whole
  // franchise/series at once instead of one title at a time. Filtered/deduped the same way normal
  // search results are, so the review checklist the frontend shows never offers a game that's
  // already in this room/shelf or unavailable on its platform.
  app.get<{ Params: { id: string }; Querystring: { roomId?: string; hideAddons?: string } }>(
    '/api/games/collections/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const collectionId = Number(request.params.id);
      if (!Number.isInteger(collectionId) || collectionId <= 0) {
        throw new HttpError(400, 'Invalid collection id');
      }
      const { roomId } = request.query;
      if (roomId) await requireMembership(roomId, userId);
      // A platform-less room (issue #473) falls back to the caller's own owned platforms, same as
      // no room at all.
      const roomPlatform = roomId ? await getRoomPlatform(roomId) : null;
      const platforms = roomPlatform ? [roomPlatform] : await getOwnedPlatforms(userId);
      const excludeIgdbIds = await existingIgdbIds(roomId ?? null, userId);
      // Same opt-out as /api/games/search (issue #354) - the collection review screen otherwise
      // ignored the "Hide DLC & add-ons" checkbox entirely.
      const hideAddons = request.query.hideAddons !== 'false';

      const collection = await collectionGamesIntake(collectionId, platforms, excludeIgdbIds, hideAddons);
      return collection;
    },
  );

  // Issue #338: backs the game modal's "View DLC" button - every DLC/expansion IGDB has on file
  // for this game, filtered/deduped the same way search results are (already-added entries
  // excluded, scoped to this game's own room/shelf platform). Shown regardless of whether this
  // particular game turns out to have any (an empty list just means IGDB has none on file).
  app.get<{ Params: { id: string } }>(
    '/api/games/:id/dlc',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      // A platform-less room (issue #473) falls back to the caller's own owned platforms, same as
      // no room at all.
      const roomPlatform = game.roomId ? await getRoomPlatform(game.roomId) : null;
      const platforms = roomPlatform ? [roomPlatform] : await getOwnedPlatforms(userId);
      const excludeIgdbIds = await existingIgdbIds(game.roomId, userId);
      const results = await dlcIntake(game.igdbId, platforms, excludeIgdbIds);
      return { results };
    },
  );

  // Same tightened default as /api/games/search and /api/games/collections/:id above - these are
  // both authenticated list reads with no per-route override previously, relying only on the
  // global 200/min default.
  const gamesListRateLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  const PLAYING_STATUSES: Prisma.GameWhereInput['status'] = { in: ['playing', 'play_next'] };
  // #480: same class of bug as #459 below, but for Beaten/Dropped - a bulk import's flood of
  // freshly-created backlog rows can just as easily push an old Beaten or Dropped game past the
  // recency window's cutoff, silently dropping it from the shelf view even though its `status` was
  // never actually touched (a user reported this as "losing" their beaten queue after a Playnite
  // import - the games were still marked done/dropped on file, just no longer in the returned set).
  const FINISHED_STATUSES: Prisma.GameWhereInput['status'] = { in: ['done', 'dropped', 'wont_play'] };
  const RECENCY_CAPPED_STATUSES: Prisma.GameWhereInput['status'] = {
    notIn: ['playing', 'play_next', 'done', 'dropped', 'wont_play'],
  };

  // #459/#480: a plain createdAt-desc top-MAX_GAMES_PER_LIST query can push a user's actual
  // in-progress, Beaten, or Dropped games out of the returned set entirely once enough other games
  // exist more recently - a bulk Playnite import (QueueUpPlayniteExtension#7) is the case that
  // surfaced this, bulk-creating hundreds of freshly-added backlog rows that flood the top of the
  // recency window. PlayingStrip (and, for #480, the Beaten/Dropped ribbons/filters) then read an
  // array that no longer contains the real games in those statuses. Each of these is inherently a
  // small subset of anyone's games in practice (same reasoning as CROSS_ROOM_PLAYING_LIMIT below),
  // so fetching them separately and merging is cheap, and guarantees none of them is ever a
  // casualty of how much else was recently added - only the recency-capped bucket (backlog/
  // wishlist/replay, where a cap is actually the point) can end up truncated.
  async function findGamesWithPlayingPriority(where: Prisma.GameWhereInput, region?: string) {
    const [priority, finished, rest] = await Promise.all([
      prisma.game.findMany({ where: { ...where, status: PLAYING_STATUSES }, include: gameInclude, take: MAX_GAMES_PER_LIST + 1 }),
      prisma.game.findMany({ where: { ...where, status: FINISHED_STATUSES }, include: gameInclude, take: MAX_GAMES_PER_LIST + 1 }),
      prisma.game.findMany({
        where: { ...where, status: RECENCY_CAPPED_STATUSES },
        include: gameInclude,
        orderBy: { createdAt: 'desc' },
        take: MAX_GAMES_PER_LIST + 1,
      }),
    ]);
    const combined = [...priority, ...finished, ...rest];
    const truncated = combined.length > MAX_GAMES_PER_LIST;
    return { games: combined.slice(0, MAX_GAMES_PER_LIST), truncated };
  }

  app.get<{ Querystring: { region?: string; q?: string } }>('/api/games', gamesListRateLimit, async (request) => {
    const userId = await request.requireAuth();
    const q = (request.query.q ?? '').trim();
    const baseWhere: Prisma.GameWhereInput = { roomId: null, addedBy: userId, archivedAt: null };

    if (q) {
      // A title search isn't the "browse your recently-added backlog" case MAX_GAMES_PER_LIST/
      // createdAt-desc was built for - it should find a match regardless of status (Playing/Beaten/
      // Dropped included, not just what the main grid shows) or how long ago it was added, so it
      // gets its own where/order instead of reusing the recency window. Still capped at the same
      // size and still fetches one row past it to detect truncation, same reasoning as above.
      const [games, totalCount] = await Promise.all([
        prisma.game.findMany({
          where: { ...baseWhere, title: { contains: q, mode: 'insensitive' } },
          include: gameInclude,
          orderBy: { title: 'asc' },
          take: MAX_GAMES_PER_LIST + 1,
        }),
        // #588: the count badge is "how many games do I have," which reads as the whole shelf's
        // total regardless of an active search box, not the search-filtered match count.
        prisma.game.count({ where: baseWhere }),
      ]);
      const truncated = games.length > MAX_GAMES_PER_LIST;
      return {
        games: await serializeGames(games.slice(0, MAX_GAMES_PER_LIST), userId, parseRegion(request.query.region)),
        truncated,
        totalCount,
      };
    }

    const [{ games, truncated }, totalCount] = await Promise.all([
      findGamesWithPlayingPriority(baseWhere),
      prisma.game.count({ where: baseWhere }),
    ]);
    return { games: await serializeGames(games, userId, parseRegion(request.query.region)), truncated, totalCount };
  });

  app.get<{ Params: { roomId: string }; Querystring: { region?: string; q?: string } }>(
    '/api/rooms/:roomId/games',
    gamesListRateLimit,
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);
      const q = (request.query.q ?? '').trim();
      const baseWhere: Prisma.GameWhereInput = { roomId, archivedAt: null };

      if (q) {
        const [games, totalCount] = await Promise.all([
          prisma.game.findMany({
            where: { ...baseWhere, title: { contains: q, mode: 'insensitive' } },
            include: gameInclude,
            orderBy: { title: 'asc' },
            take: MAX_GAMES_PER_LIST + 1,
          }),
          // #588: same reasoning as /api/games above - the count badge reflects the whole room's
          // total, not the search-filtered match count.
          prisma.game.count({ where: baseWhere }),
        ]);
        const truncated = games.length > MAX_GAMES_PER_LIST;
        return {
          games: await serializeGames(games.slice(0, MAX_GAMES_PER_LIST), userId, parseRegion(request.query.region)),
          truncated,
          totalCount,
        };
      }

      const [{ games, truncated }, totalCount] = await Promise.all([
        findGamesWithPlayingPriority(baseWhere),
        prisma.game.count({ where: baseWhere }),
      ]);
      return { games: await serializeGames(games, userId, parseRegion(request.query.region)), truncated, totalCount };
    },
  );

  app.post<{ Body: CreateGameRequest }>('/api/games', async (request, reply) => {
    const userId = await request.requireAuth();
    const { igdbId, roomId, status, ownedPlatforms } = request.body;
    const response = await createGameForUser(userId, roomId ?? null, igdbId, { status, ownedPlatforms });
    reply.status(201);
    // Only the 'game' branch is a real, immediately-live game - a room's approval-required
    // 'suggestion' branch hasn't actually been added to anything yet, so nothing to unlock there.
    const unlockedBadges =
      'game' in response ? await unlockBadges(userId, response.game.status === 'wishlist' ? ['first_wishlist'] : []) : [];
    return { ...response, unlockedBadges };
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
          prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { steamAppid: true, igdbId: true, status: true } }),
        ]);
        const existingSteamAppIds = new Set(shelfGames.map((g) => g.steamAppid).filter((id): id is number => id != null));

        // No cap - a click imports the whole not-yet-shelved library in one go (issue #175).
        // Ordered most-played first purely for a nicer result ordering, not to bound the work done.
        const considered = owned
          .filter((game) => !existingSteamAppIds.has(game.appId))
          .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes);

        // Every non-wishlist game already on the shelf is, by definition, owned - mark those too
        // (using the igdbId already on file, no extra Steam/IGDB lookups needed) so ownership
        // coverage isn't limited to whatever a single import run actually creates (issue #176).
        // Wishlist games are excluded - a wishlisted game is explicitly *not* owned yet (see
        // GameStatus.wishlist's doc comment and runSteamWishlistImportLoop below), so bulk-marking
        // it here just because it happens to already be on the shelf was mislabeling every
        // wishlist-imported game as owned the next time a library import ran (bug report: wishlist
        // imports showing as owned when they aren't).
        const ownedIgdbIds: number[] = shelfGames.filter((g) => g.status !== 'wishlist').map((g) => g.igdbId);

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
    const closedEntries = await recordStatusTransition(game.id, game.status, status);
    const updated = await loadGameOr404(game.id);

    // Offered only when marking a *room* game Beaten - never the reverse (marking Beaten on the
    // Personal Shelf doesn't prompt about any room copies of the same game).
    const shelfSync =
      status === 'done' && game.roomId !== null ? await buildShelfSyncSuggestion(userId, game.igdbId, updated.title) : undefined;

    // Shared by completionBadgeKeys/Marathoner/Comeback below - all three only apply on an actual
    // transition *into* Done, not a no-op re-save of an already-Done game (game.status here is
    // still the pre-update value).
    const enteringDone = status === 'done' && game.status !== 'done';
    const completionKeys = enteringDone ? await completionBadgeKeys(userId, updated) : [];
    // Backlog Buster - "dealt with" means actually resolved (Done, Dropped, or Won't Play), not
    // just picked up (Playing) - a neglected game finally getting *started* isn't the same
    // achievement as finally getting it off the list one way or the other.
    const backlogBusterKeys: BadgeKey[] =
      (status === 'done' || status === 'dropped' || status === 'wont_play') && wasNeglectedBacklogGame(game)
        ? ['first_backlog_buster']
        : [];
    // Marathoner (issue: "what other achievements can you think of") - one of the entries this
    // transition just closed sat open 30+ days before finishing, i.e. a genuine long haul rather
    // than a same-day clear. Only closedEntries created by an actual Playing→Done stretch can hit
    // this (the "jumped straight to Done" fallback in recordStatusTransition always has a zero
    // duration), which is exactly the case worth rewarding.
    const MARATHONER_MS = 30 * 24 * 60 * 60 * 1000;
    const marathonerKeys: BadgeKey[] =
      enteringDone && closedEntries.some((entry) => entry.finishedAt.getTime() - entry.startedAt.getTime() >= MARATHONER_MS)
        ? ['first_marathoner']
        : [];
    // Comeback - this game now has 2+ finished play-journal entries, meaning it was beaten,
    // left Done at some point (the only way a second entry can ever open), and beaten again.
    const comebackKeys: BadgeKey[] =
      enteringDone && (await prisma.playLog.count({ where: { gameId: game.id, finishedAt: { not: null } } })) >= 2
        ? ['first_comeback']
        : [];
    // Not For Me - mirror image of Marathoner: one of the entries this transition just closed was
    // a genuine (non-zero-duration) play stretch that ended in a drop inside a day. Zero-duration
    // closedEntries only come from recordStatusTransition's "jumped straight to Dropped without
    // ever playing" fallback, which isn't "gave it a shot" - excluded via durationMs > 0.
    const enteringDropped = status === 'dropped' && game.status !== 'dropped';
    const QUICK_DROP_MS = 24 * 60 * 60 * 1000;
    const quickDropKeys: BadgeKey[] =
      enteringDropped &&
      closedEntries.some((entry) => {
        const durationMs = entry.finishedAt.getTime() - entry.startedAt.getTime();
        return durationMs > 0 && durationMs < QUICK_DROP_MS;
      })
        ? ['first_quick_drop']
        : [];
    const unlockedBadges = await unlockBadges(userId, [
      ...statusBadgeKeys(status, game.roomId),
      ...completionKeys,
      ...backlogBusterKeys,
      ...marathonerKeys,
      ...comebackKeys,
      ...quickDropKeys,
    ]);

    // Activity feed (issue #509 for rooms, #580 for the Personal Shelf) - only on an actual
    // transition, matching enteringDone/enteringDropped's own "not a no-op re-save" gating above.
    if (game.status !== status) {
      if (game.roomId !== null) {
        void logRoomActivity({
          roomId: game.roomId,
          actorId: userId,
          type: 'status_changed',
          message: (actorName) => `${actorName} marked "${updated.title}" as ${STATUS_LABELS[status]}`,
        });
      } else {
        void logShelfActivity({
          recipientId: userId,
          actorId: userId,
          type: 'status_changed',
          message: `Marked "${updated.title}" as ${STATUS_LABELS[status]}`,
        });
      }
    }

    return { game: await serializeGame(updated, userId), shelfSync, unlockedBadges };
  });

  app.post<{ Params: { id: string } }>(
    '/api/games/:id/sync-shelf-beaten',
    // Same class of route as steam-match/target-price/ownership above - a direct, occasional user
    // action, not something a normal session comes close to hitting at volume.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const shelfGame = await prisma.game.findFirst({ where: { roomId: null, addedBy: userId, igdbId: game.igdbId } });
      if (shelfGame) {
        await prisma.game.update({ where: { id: shelfGame.id }, data: { status: 'done' } });
        await recordStatusTransition(shelfGame.id, shelfGame.status, 'done');
      } else {
        const resolved = await resolveGameForCreation(game.igdbId, await getOwnedPlatforms(userId));
        try {
          const created = await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId: game.igdbId,
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
              status: 'done',
            },
          });
          await recordStatusTransition(created.id, 'backlog', 'done');
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
          // Lost a race with an identical concurrent sync (e.g. a double-click on the confirm
          // dialog) - the other request already created it, so just make sure it's marked Beaten
          // the same way the "already exists" branch above does, instead of surfacing an error for
          // what is, from the caller's point of view, a successful sync.
          await prisma.game.updateMany({ where: { roomId: null, addedBy: userId, igdbId: game.igdbId }, data: { status: 'done' } });
        }
        await invalidateExistingIgdbIds(null, userId);
      }

      // Every branch above lands the Personal Shelf copy at status 'done', and this route is
      // Personal-Shelf-only (roomId: null throughout) - same first_solo_beat condition as
      // statusBadgeKeys('done', null) below, just not routed through that helper since this isn't
      // a status-change request body (issue #489 - this hook point was missed when the badge
      // system first shipped, so marking Beaten via "sync to shelf" never unlocked it).
      const unlockedBadges = await unlockBadges(userId, ['first_solo_beat']);
      return { ok: true, unlockedBadges };
    },
  );

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
      const before = await prisma.game.findMany({ where, select: { id: true, status: true, addedBy: true, steamAppid: true } });
      // Bug fix (issue #562): batched once here rather than left to recordStatusTransition's own
      // per-game lookup below - see getCurrentPlaytimeMinutesForGames' doc comment for why that
      // matters at this route's scale (up to MAX_GAMES_PER_LIST games in one request).
      const playtimeByGameId = await getCurrentPlaytimeMinutesForGames(before);
      // Per-game conditional update (matched on the status just fetched), not one blind bulk
      // updateMany - a concurrent request changing one of these games' status in between (another
      // bulk call, or a single-game status change) used to mean recordStatusTransition logged a
      // transition against a stale `previousStatus`, which could silently no-op (the stale-vs-new
      // pair happening to match the guard at the top of that function) and leave a play-journal
      // entry open/closed incorrectly. If this game's status no longer matches what was just
      // fetched, this update simply doesn't apply and nothing is (re-)logged - the other request
      // already recorded its own accurate transition.
      let anyTransitioned = false;
      await Promise.all(
        before.map(async (g) => {
          const result = await prisma.game.updateMany({ where: { id: g.id, status: g.status }, data: { status } });
          if (result.count > 0) {
            anyTransitioned = true;
            await recordStatusTransition(g.id, g.status, status, playtimeByGameId.get(g.id) ?? null);
          }
        }),
      );

      const updated = await prisma.game.findMany({ where, include: gameInclude });
      // roomId is always null here (Personal Shelf only) - first_room_beat never applies. Only
      // attempted once per request (not once per game) since these are all one-shot unlocks.
      const unlockedBadges = anyTransitioned ? await unlockBadges(userId, statusBadgeKeys(status, null)) : [];
      return { games: await serializeGames(updated, userId, parseRegion(request.query.region)), unlockedBadges };
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
        return { players: [], unlockedBadges: [] };
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

      // Persisted the first time any player is observed at 100% (issue: "Clocked" ribbon) - not
      // computed live on every grid render, which would mean a Steam API call per Steam-linked
      // game per page view. Sticky (never cleared back to false here) - see the schema comment.
      const anyoneFullyCompleted = players.some((p) => p.total > 0 && p.unlocked === p.total);
      if (anyoneFullyCompleted && !game.steamFullyCompleted) {
        await prisma.game.update({ where: { id: game.id }, data: { steamFullyCompleted: true } });
      }

      // Same persist-on-observe treatment, but per player rather than per game - powers the
      // member-list "100%'d" count, which needs to know *who* cleared a title, not just whether
      // anyone did. See AchievementCompletion's schema comment.
      const fullyCompletedPlayerIds = players.filter((p) => p.total > 0 && p.unlocked === p.total).map((p) => p.user.id);
      if (fullyCompletedPlayerIds.length > 0) {
        await prisma.achievementCompletion.createMany({
          data: fullyCompletedPlayerIds.map((completedUserId) => ({ userId: completedUserId, igdbId: game.igdbId })),
          skipDuplicates: true,
        });
      }

      // Issue #489: only the caller's own 100% counts toward *their* badge - this route can
      // observe and persist AchievementCompletion for other room members too (see above), but
      // "you 100%'d a game" shouldn't unlock just because a roommate's Steam profile happened to
      // be checked in the same request.
      const unlockedBadges = await unlockBadges(userId, fullyCompletedPlayerIds.includes(userId) ? ['first_100_percent'] : []);

      return { players, unlockedBadges };
    },
  );

  // Dated per-playthrough history for one game (issue #361), fetched on demand when the detail
  // modal opens - same reasoning as achievements above, though this is a plain DB read (no live
  // per-player API call), so there's no per-player audience to build. Newest attempt first.
  app.get<{ Params: { id: string } }>(
    '/api/games/:id/play-log',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const entries = await prisma.playLog.findMany({
        where: { gameId: game.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, startedAt: true, finishedAt: true, startPlaytimeMinutes: true, finishPlaytimeMinutes: true },
      });

      const response: { entries: PlayLogEntry[] } = {
        entries: entries.map((e) => ({
          id: e.id,
          startedAt: e.startedAt.toISOString(),
          finishedAt: e.finishedAt ? e.finishedAt.toISOString() : null,
          minutesPlayed:
            e.startPlaytimeMinutes != null && e.finishPlaytimeMinutes != null
              ? Math.max(0, e.finishPlaytimeMinutes - e.startPlaytimeMinutes)
              : null,
        })),
      };
      return response;
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
      // A platform-less destination room (issue #473) has nothing to check the game against - any
      // platform is fine there.
      if (destPlatform) {
        const families = platformFamilies(game.platform.split(',').map((name) => ({ name: name.trim() })));
        if (!families.includes(destPlatform)) {
          throw new HttpError(400, `${game.title} isn't available on this room's platform.`);
        }
      }
    }
    await requireNotDuplicate(destRoomId ?? null, userId, game.igdbId);

    try {
      await prisma.game.update({
        where: { id: game.id },
        // The mover becomes the new "adder" - relevant when moving into the shelf, since a shelf
        // item is only visible/manageable by whoever added it.
        data: { roomId: destRoomId ?? null, addedBy: userId },
      });
    } catch (err) {
      rethrowAsDuplicateGame(err, destRoomId ?? null, game.title);
    }
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

      // gg.deals (our only price source) is Steam-App-ID-based, i.e. PC-only - a room on any
      // other platform never shows a price fetched here at all (see gameSerializer.ts's platform-
      // scoped pricing), so there's no point spending a live gg.deals call on one; just re-
      // serialize as-is, which already resolves to "unavailable" for that room.
      // A platform-less room (issue #473) is treated as 'pc' here too, same as
      // gameSerializer.ts's resolvePricingPlatform - null isn't evidence the game is non-PC.
      const platform = game.roomId ? ((await getRoomPlatform(game.roomId)) ?? 'pc') : 'pc';
      if (platform === 'pc') {
        const steamAppId = game.steamAppid ?? (await backfillSteamAppId(game.id, game.igdbId));
        await refreshGamePricing(game.id, steamAppId);
      }
      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId, parseRegion(request.query.region)) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    '/api/games/:id/steam-search',
    // A live outbound request to Steam's public store search, same class of route as
    // refresh-price above.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const query = request.query.q?.trim() || game.title;
      return { results: await searchSteamStore(query) };
    },
  );

  app.patch<{ Params: { id: string }; Body: SetSteamMatchRequest }>(
    '/api/games/:id/steam-match',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const { steamAppId } = request.body;
      if (steamAppId !== null && (!Number.isInteger(steamAppId) || steamAppId <= 0)) {
        throw new HttpError(400, 'A valid steamAppId (or null to clear) is required');
      }

      await setManualSteamMatch(game.id, steamAppId);
      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId) };
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

  app.patch<{ Params: { id: string }; Body: SetManualPriceRequest }>(
    '/api/games/:id/manual-price',
    // Same class of route as target-price above - a direct, occasional user action, not something
    // a normal session comes close to.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const { manualPrice } = request.body;
      let normalized: string | null = null;
      if (manualPrice != null) {
        const parsed = Number(manualPrice);
        // 0 is allowed (issue #425) - a free-to-play game has a real price of $0, not "no price
        // data"; only negative/non-numeric input is actually invalid here.
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new HttpError(400, 'Manual price must be zero or a positive number');
        }
        normalized = parsed.toFixed(2);
      }

      await prisma.game.update({ where: { id: game.id }, data: { manualPrice: normalized } });
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

      // Room-only: this toggle means "I own this on this room's platform" specifically (see
      // toggleOwnershipForPlatform/getOwnershipInfo), which needs a room to infer a platform from -
      // there's no equivalent single-platform toggle on the Personal Shelf (see the Add Game modal
      // instead, which lets someone pick platform(s) explicitly).
      if (!game.roomId) {
        throw new HttpError(400, 'Ownership can only be toggled for a game in a room');
      }
      const room = await prisma.room.findUniqueOrThrow({ where: { id: game.roomId }, select: { platform: true } });
      // Same reasoning, for a platform-less room (issue #473): GameOwnership is keyed globally by
      // (userId, igdbId), not per room, so there's no single platform here to safely write a claim
      // against - marking "owned" would either claim every platform the title's ever shipped on
      // (via game.platform's full IGDB label) or none, both wrong. Ownership still works for these
      // rooms via the Add Game modal's own platform picker; only this shortcut is unavailable.
      if (!room.platform) {
        throw new HttpError(400, "This room has no platform restriction, so ownership can't be toggled here");
      }

      const { owned } = request.body;
      const unlockedBadges = await toggleOwnershipForPlatform(userId, game.igdbId, room.platform, owned);

      const updated = await loadGameOr404(game.id);
      return { game: await serializeGame(updated, userId), unlockedBadges };
    },
  );

  app.patch<{ Params: { id: string }; Body: SetGamePrerequisiteRequest }>(
    '/api/games/:id/prerequisite',
    // Same class of route as target-price/ownership - a direct user action from the detail modal.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);

      const { prerequisiteGameId } = request.body;
      if (prerequisiteGameId !== null) {
        if (!game.roomId) {
          throw new HttpError(400, '"Play after" is only available for games in a room');
        }
        if (prerequisiteGameId === game.id) {
          throw new HttpError(400, 'A game cannot be set to play after itself');
        }
        const prerequisite = await loadGameOr404(prerequisiteGameId);
        if (prerequisite.roomId !== game.roomId) {
          throw new HttpError(400, 'The prerequisite must be another game in the same room');
        }

        // Walk the prerequisite chain from the candidate to make sure it doesn't loop
        // back to this game (a direct A<->B cycle, or a longer chain closing the loop).
        const visited = new Set<string>([game.id]);
        let cursor: string | null = prerequisite.id;
        while (cursor !== null) {
          if (visited.has(cursor)) {
            throw new HttpError(400, 'That would create a "play after" cycle');
          }
          visited.add(cursor);
          const cursorGame = await loadGameOr404(cursor);
          cursor = cursorGame.prerequisiteGameId;
        }
      }

      await prisma.game.update({ where: { id: game.id }, data: { prerequisiteGameId } });
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

    const existingVote = await prisma.vote.findUnique({ where: { gameId_userId: { gameId: game.id, userId } } });
    await prisma.vote.upsert({
      where: { gameId_userId: { gameId: game.id, userId } },
      update: { value },
      create: { gameId: game.id, userId, value },
    });

    const updated = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: gameInclude });

    // Full House (issue: "what other achievements can you think of") - only meaningful for a room
    // with more than one member (a solo room trivially has "everyone" vote on their own first
    // cast, which isn't the "we're all aligned" signal this is meant to celebrate). Always
    // credited to the caller: nobody else's vote could have landed in this same request, so
    // whoever's vote just completed the count is unambiguous.
    let unlockedBadges: BadgeDefinition[] = [];
    if (game.roomId !== null) {
      const memberCount = await prisma.roomMember.count({ where: { roomId: game.roomId } });
      if (memberCount >= 2 && updated.votes.length === memberCount) {
        unlockedBadges = await unlockBadges(userId, ['first_full_house']);
      }
      // Room activity feed (issue #509) - skip a re-click of the same value (double-clicking your
      // own already-cast star, a retried request, ...): only a genuine value change is feed-worthy.
      if (existingVote?.value !== value) {
        void logRoomActivity({
          roomId: game.roomId,
          actorId: userId,
          type: 'vote_cast',
          message: (actorName) => `${actorName} rated "${updated.title}" ${value}/5`,
        });
      }
    }

    return { game: await serializeGame(updated, userId), unlockedBadges };
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
      // Plain `setFullYear(getFullYear() - 1)` rolls a Feb 29 (leap day) over to March 1 of the
      // prior year whenever that year isn't itself a leap year - it has no Feb 29 to land on
      // (issue #540, same overflow shape fixed for the room-scoped Year in Review in #527 and for
      // isNeglectedBacklogGame in #522). Shifting to day 1 first avoids the day-doesn't-exist
      // mismatch, then the original day is restored, clamped to the target year's actual last day
      // of that month so it can't overflow forward again.
      const originalDate = windowStart.getUTCDate();
      windowStart.setUTCDate(1);
      windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
      const lastDayOfTargetMonth = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 0)).getUTCDate();
      windowStart.setUTCDate(Math.min(originalDate, lastDayOfTargetMonth));
      const windowStartSeconds = Math.floor(windowStart.getTime() / 1000);
      const windowEndSeconds = Math.floor(windowEnd.getTime() / 1000);

      const [user, doneGamesRaw, memberships] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        // Prefer PlayLog.finishedAt (set exactly on the done/dropped transition, see
        // recordStatusTransition) over updatedAt as the completion date - updatedAt is bumped by
        // ANY edit (a target price change, a manual price, ...), not just a status change, so a
        // game Done years ago with one unrelated edit this year would otherwise wrongly land in
        // this year's recap. Fetches every Done game rather than filtering by date in the query,
        // since which date to check depends on whether a PlayLog row exists - filtered in memory
        // below instead. A game can still lack any closed PlayLog row (completed before issue
        // #361 added this table, or completed some other way that doesn't go through
        // recordStatusTransition) - updatedAt remains the fallback for exactly those.
        prisma.game.findMany({
          where: { addedBy: userId, status: 'done' },
          select: {
            id: true,
            title: true,
            genre: true,
            timeToBeatHours: true,
            steamAppid: true,
            roomId: true,
            updatedAt: true,
            playLogs: { where: { finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' }, take: 1, select: { finishedAt: true } },
          },
        }),
        prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } }),
      ]);

      const doneGames: YearInReviewGameRow[] = doneGamesRaw
        .map(({ playLogs, updatedAt, ...g }) => ({ ...g, completedAt: playLogs[0]?.finishedAt ?? updatedAt }))
        .filter((g) => g.completedAt >= windowStart && g.completedAt <= windowEnd);

      const steamId64 = resolveSteamId64(user);

      // The app's Done status is opt-in (see the nudge in GameDetailModal.tsx), so relying on it
      // alone undercounts anyone who tracks completion via Steam instead - check not-yet-Done
      // games with a linked Steam app id for 100% achievement completion within the window, and
      // fold in whatever that turns up alongside the manually-marked games above. Candidate
      // scanning itself is shared with the all-time "Sync completions from Steam" action below -
      // see findDetectedSteamCompletions.
      let autoDetected: YearInReviewGameRow[] = [];
      if (steamId64 && env.STEAM_API_KEY) {
        const { completions } = await findDetectedSteamCompletions(userId, steamId64, env.STEAM_API_KEY, {
          limit: YEAR_IN_REVIEW_AUTODETECT_CANDIDATE_LIMIT,
        });
        autoDetected = completions.filter((g) => g.lastUnlockedAt >= windowStartSeconds && g.lastUnlockedAt <= windowEndSeconds);
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

  // Safety cap on the cross-room Currently Playing dashboard below, same reasoning as
  // MAX_GAMES_PER_LIST elsewhere - Playing/Play Next is inherently a small subset of anyone's
  // games in practice, so this is a defensive ceiling, not an expected real-world limit.
  const CROSS_ROOM_PLAYING_LIMIT = 200;

  app.get(
    '/api/me/currently-playing',
    // Same class of route as year-in-review above - an on-demand dashboard view, not something a
    // normal session comes close to hitting often.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      const [personalGames, memberships] = await Promise.all([
        prisma.game.findMany({
          where: { roomId: null, addedBy: userId, archivedAt: null, status: { in: ['playing', 'play_next'] } },
          include: gameInclude,
          take: CROSS_ROOM_PLAYING_LIMIT,
        }),
        prisma.roomMember.findMany({ where: { userId }, include: { room: true }, orderBy: { joinedAt: 'asc' } }),
      ]);

      const roomIds = memberships.map((m) => m.roomId);
      const roomGamesRaw =
        roomIds.length > 0
          ? await prisma.game.findMany({
              where: { roomId: { in: roomIds }, archivedAt: null, status: { in: ['playing', 'play_next'] } },
              include: gameInclude,
              take: CROSS_ROOM_PLAYING_LIMIT,
            })
          : [];

      // Playing sorts first, Play Next after - same convention as PlayingStrip.tsx.
      const byPlayNextLast = (a: { status: string }, b: { status: string }) =>
        Number(a.status === 'play_next') - Number(b.status === 'play_next');

      const [personalSerialized, roomSerialized] = await Promise.all([
        serializeGames([...personalGames].sort(byPlayNextLast), userId),
        serializeGames([...roomGamesRaw].sort(byPlayNextLast), userId),
      ]);

      const gamesByRoomId = new Map<string, (typeof roomSerialized)[number][]>();
      for (const g of roomSerialized) {
        const list = gamesByRoomId.get(g.roomId as string) ?? [];
        list.push(g);
        gamesByRoomId.set(g.roomId as string, list);
      }

      const groups: CrossRoomPlayingGroup[] = [];
      if (personalSerialized.length > 0) groups.push({ roomId: null, roomName: null, games: personalSerialized });
      for (const m of memberships) {
        const games = gamesByRoomId.get(m.roomId) ?? [];
        if (games.length > 0) groups.push({ roomId: m.roomId, roomName: m.room.name, games });
      }

      const result: CrossRoomPlaying = { groups };
      return result;
    },
  );

  // Beaten libraries can genuinely run into the hundreds over years of play, unlike Playing/Play
  // Next which is inherently small - same cap MAX_GAMES_PER_LIST uses for the main shelf list,
  // not CROSS_ROOM_PLAYING_LIMIT's much smaller "defensive ceiling on something tiny" reasoning.
  const CROSS_ROOM_BEATEN_LIMIT = MAX_GAMES_PER_LIST;
  const BEATEN_STATUSES: Prisma.GameWhereInput['status'] = { in: ['done', 'replay'] };

  // Issue #481: "an easy way to display my beaten list, including communal rooms" - same shape/
  // reasoning as /api/me/currently-playing above, just for Beaten+Replay instead of Playing+Play
  // Next (Replay joins Done here for the same reason BeatenStrip.tsx groups them together: a
  // Replay is by definition already-beaten).
  app.get(
    '/api/me/beaten',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      const [personalGames, memberships] = await Promise.all([
        prisma.game.findMany({
          where: { roomId: null, addedBy: userId, archivedAt: null, status: BEATEN_STATUSES },
          include: gameInclude,
          orderBy: { updatedAt: 'desc' },
          take: CROSS_ROOM_BEATEN_LIMIT,
        }),
        prisma.roomMember.findMany({ where: { userId }, include: { room: true }, orderBy: { joinedAt: 'asc' } }),
      ]);

      const roomIds = memberships.map((m) => m.roomId);
      const roomGamesRaw =
        roomIds.length > 0
          ? await prisma.game.findMany({
              where: { roomId: { in: roomIds }, archivedAt: null, status: BEATEN_STATUSES },
              include: gameInclude,
              orderBy: { updatedAt: 'desc' },
              take: CROSS_ROOM_BEATEN_LIMIT,
            })
          : [];

      const [personalSerialized, roomSerialized] = await Promise.all([
        serializeGames(personalGames, userId),
        serializeGames(roomGamesRaw, userId),
      ]);

      const gamesByRoomId = new Map<string, (typeof roomSerialized)[number][]>();
      for (const g of roomSerialized) {
        const list = gamesByRoomId.get(g.roomId as string) ?? [];
        list.push(g);
        gamesByRoomId.set(g.roomId as string, list);
      }

      const groups: CrossRoomBeatenGroup[] = [];
      if (personalSerialized.length > 0) groups.push({ roomId: null, roomName: null, games: personalSerialized });
      for (const m of memberships) {
        const games = gamesByRoomId.get(m.roomId) ?? [];
        if (games.length > 0) groups.push({ roomId: m.roomId, roomName: m.room.name, games });
      }

      const result: CrossRoomBeaten = { groups };
      return result;
    },
  );

  type NextPickGameRow = {
    id: string;
    title: string;
    coverImageUrl: string | null;
    platform: string;
    status: GameStatus;
    timeToBeatHours: number | null;
    igdbCollectionId: number | null;
    createdAt: Date;
    updatedAt: Date;
  };

  function toNextPickGame(row: NextPickGameRow): NextPickGame {
    return {
      id: row.id,
      title: row.title,
      coverImageUrl: row.coverImageUrl,
      platform: row.platform,
      status: row.status,
      timeToBeatHours: row.timeToBeatHours,
      createdAt: row.createdAt.toISOString(),
    };
  }

  const nextPickDays = (from: Date, now: number) => Math.floor((now - from.getTime()) / (1000 * 60 * 60 * 24));

  // Issue #508 - a personal "what should I play next" picker over the caller's own Personal Shelf,
  // distinct from the existing "🎲 Pick a Game" Spin the Wheel button (SpinPickerButton.tsx /
  // packages/shared/src/spinPicker.ts): Spin the Wheel is a mostly-random draw the caller
  // explicitly spins for fun; this tries a handful of deterministic heuristics in order and only
  // falls back to a random pick when none of the earlier ones have anything to offer, so it reads
  // as an actual recommendation rather than a wheel spin. No server-side state - "try again" is
  // just calling this again, which can land on a different heuristic/game if the shelf has
  // multiple viable candidates.
  app.get(
    '/api/me/next-pick',
    // Same class of route as year-in-review/currently-playing above - an on-demand personal view,
    // not something a normal session comes close to hitting often.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      // Whole Personal Shelf, not just backlog/wishlist - collectionProgress below needs Done
      // entries too, to know how far into a series the caller already is. Same MAX_GAMES_PER_LIST
      // cap as the shelf's own listing query - a defensive ceiling, not an expected real-world size.
      const rows = await prisma.game.findMany({
        where: { roomId: null, addedBy: userId, archivedAt: null },
        select: {
          id: true,
          title: true,
          coverImageUrl: true,
          platform: true,
          status: true,
          timeToBeatHours: true,
          igdbCollectionId: true,
          createdAt: true,
          updatedAt: true,
        },
        take: MAX_GAMES_PER_LIST,
      });

      const backlog = rows.filter((g) => g.status === 'backlog');
      const wishlist = rows.filter((g) => g.status === 'wishlist');
      const now = Date.now();
      let suggestion: NextPickSuggestion | null = null;

      // 1. Shortest game in the backlog, among those with time-to-beat data on file.
      const withTimeToBeat = backlog.filter((g): g is NextPickGameRow & { timeToBeatHours: number } => g.timeToBeatHours !== null);
      if (withTimeToBeat.length > 0) {
        const shortest = withTimeToBeat.reduce((best, g) => (g.timeToBeatHours < best.timeToBeatHours ? g : best));
        suggestion = {
          game: toNextPickGame(shortest),
          reason: 'shortest',
          detail: `Shortest game in your backlog - about ${shortest.timeToBeatHours}h to beat.`,
        };
      }

      // 2. Oldest wishlist entry - for when nothing backlog-side has time-to-beat data.
      if (!suggestion && wishlist.length > 0) {
        const oldest = wishlist.reduce((best, g) => (g.createdAt.getTime() < best.createdAt.getTime() ? g : best));
        const days = nextPickDays(oldest.createdAt, now);
        suggestion = {
          game: toNextPickGame(oldest),
          reason: 'oldest_wishlist',
          detail: `On your wishlist for ${days} day${days === 1 ? '' : 's'} - your oldest wishlist entry.`,
        };
      }

      // 3. The backlog game furthest into an already-started franchise - reuses the same
      // beaten/total logic the client's franchise-progress UI (GameCard.tsx) already shows per
      // card, just picking the single best candidate instead of displaying every one.
      if (!suggestion) {
        let best: { game: NextPickGameRow; progress: { beaten: number; total: number } } | null = null;
        for (const g of backlog) {
          const progress = collectionProgress(g, rows);
          if (!progress || progress.beaten === 0 || progress.beaten >= progress.total) continue;
          if (!best || progress.beaten / progress.total > best.progress.beaten / best.progress.total) best = { game: g, progress };
        }
        if (best) {
          suggestion = {
            game: toNextPickGame(best.game),
            reason: 'franchise_progress',
            detail: `${best.progress.beaten} of ${best.progress.total} in this series already beaten - keep going.`,
          };
        }
      }

      // 4. Last resort: a weighted-random pick, favoring backlog games that have sat untouched the
      // longest (see isNeglectedBacklogGame) - falls back to a flat random pick across the whole
      // backlog when nothing qualifies as neglected yet (e.g. every backlog game is recent).
      if (!suggestion && backlog.length > 0) {
        const neglected = backlog.filter((g) =>
          isNeglectedBacklogGame({ status: g.status, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() }, now),
        );
        const pool = neglected.length > 0 ? neglected : backlog;
        const picked = weightedPick(pool, (g) => Math.max(1, nextPickDays(g.createdAt, now)), Math.random);
        if (picked) {
          const days = nextPickDays(picked.createdAt, now);
          suggestion = {
            game: toNextPickGame(picked),
            reason: 'neglected',
            detail:
              neglected.length > 0
                ? `Sitting in your backlog for ${days} day${days === 1 ? '' : 's'} - give it a shot.`
                : 'Picked at random from your backlog.',
          };
        }
      }

      const result: NextPickResponse = { suggestion };
      return result;
    },
  );

  // Defensive ceiling on the PlayLog scan below, same reasoning/value as MAX_GAMES_PER_LIST - a
  // genuinely active account's play history is expected to stay well under this in practice.
  const BACKLOG_INSIGHTS_PLAYLOG_LIMIT = MAX_GAMES_PER_LIST;

  // Issue #512 - "an insights view beyond the existing year-in-review": average time-to-beat,
  // most-neglected backlog game, and a backlog age distribution, all now genuinely possible since
  // PlayLog records real per-session start/finish timestamps (added for the Marathoner/Comeback
  // badges, issue #489) rather than only current status. Same class of route as year-in-review/
  // currently-playing/next-pick above - an on-demand personal view, not something a normal session
  // comes close to hitting often - and same scope as year-in-review's Done games: every game the
  // caller personally added, Personal Shelf or any room, not just the Personal Shelf.
  app.get(
    '/api/me/backlog-insights',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const now = Date.now();

      const [backlogGames, finishedEntries] = await Promise.all([
        // archivedAt: null - this is a *current* backlog view (unlike year-in-review's historical
        // Done games), so an archived game would inflate both the distribution and backlogCount
        // for something no longer actually sitting there. votes selected (createdAt only) so
        // pickMostNeglectedGame can check the same three neglect signals isNeglectedBacklogGame
        // always checks, even for room games (which, unlike Personal Shelf games, can have votes).
        // orderBy updatedAt ascending (least-recently-touched first) so that if the cap below ever
        // bites, the games it truncates away are the freshest ones - not the neglected candidates
        // this route exists to surface.
        prisma.game.findMany({
          where: { addedBy: userId, status: 'backlog', archivedAt: null },
          select: { id: true, title: true, coverImageUrl: true, status: true, createdAt: true, updatedAt: true, votes: { select: { createdAt: true } } },
          orderBy: { updatedAt: 'asc' },
          take: MAX_GAMES_PER_LIST,
        }),
        // Done/Replay only (BEATEN_STATUSES, same set BeatenStrip/CrossRoomBeaten group together) -
        // a PlayLog entry's finishedAt is also set on a Dropped transition (see
        // recordStatusTransition), which isn't "time to beat" at all, and PlayLog itself has no
        // outcome column of its own to filter on directly. The game's *current* status is the only
        // signal available, so a game Done then later re-Dropped (status now 'dropped') would drop
        // out of this - an accepted approximation, same tolerance as year-in-review's own
        // updatedAt-as-completion-date fallback for games predating this table. orderBy finishedAt
        // descending + the cap below means "your most recent N playthroughs" if it ever bites.
        prisma.playLog.findMany({
          where: { finishedAt: { not: null }, game: { addedBy: userId, archivedAt: null, status: BEATEN_STATUSES } },
          select: { startedAt: true, finishedAt: true, startPlaytimeMinutes: true, finishPlaytimeMinutes: true },
          orderBy: { finishedAt: 'desc' },
          take: BACKLOG_INSIGHTS_PLAYLOG_LIMIT,
        }),
      ]);

      const closedEntries = finishedEntries.filter(
        (e): e is { startedAt: Date; finishedAt: Date; startPlaytimeMinutes: number | null; finishPlaytimeMinutes: number | null } =>
          e.finishedAt !== null,
      );
      const { averageDaysToBeat, finishedEntryCount } = summarizeTimeToBeat(closedEntries);
      const { averageHoursToBeat, hoursTrackedEntryCount } = summarizeActiveHoursToBeat(closedEntries);

      const result: BacklogInsights = {
        averageDaysToBeat,
        finishedEntryCount,
        averageHoursToBeat,
        hoursTrackedEntryCount,
        backlogCount: backlogGames.length,
        mostNeglectedGame: pickMostNeglectedGame(backlogGames, now),
        ageDistribution: bucketBacklogAge(backlogGames, now),
      };
      return result;
    },
  );

  const SHELF_ACTIVITY_PAGE_SIZE = 30;

  // Issue #580 - the Personal Shelf's counterpart to GET /api/rooms/:roomId/activity, scoped by
  // recipientId instead of membership (the shelf has exactly one owner, so there's no separate
  // access check beyond requireAuth). Same cursor-pagination shape as the room route.
  app.get<{ Querystring: { before?: string } }>(
    '/api/me/activity',
    // Same tier as the room route's own rate limit - a caller scrolling back via `before` can fire
    // several requests in a row, well within this ceiling.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      const before = request.query.before ? decodeActivityCursor(request.query.before) : undefined;
      const rows = await getShelfActivityPage(userId, { before, take: SHELF_ACTIVITY_PAGE_SIZE + 1 });
      const hasMore = rows.length > SHELF_ACTIVITY_PAGE_SIZE;
      const page = hasMore ? rows.slice(0, SHELF_ACTIVITY_PAGE_SIZE) : rows;
      const last = page[page.length - 1];

      const result: ShelfActivityPage = {
        entries: page.map((row) => ({
          id: row.id,
          type: row.type as ShelfActivityType,
          message: row.message,
          createdAt: row.createdAt.toISOString(),
        })),
        nextBefore: hasMore ? encodeActivityCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
      return result;
    },
  );

  // How many not-yet-Done Personal Shelf games (with a linked Steam app id) get checked per sync
  // run - same reasoning as YEAR_IN_REVIEW_AUTODETECT_CANDIDATE_LIMIT (each check costs two Steam
  // Web API calls), just its own constant since this scans all time rather than a 12-month window
  // and is triggered independently, from a different part of the UI.
  const STEAM_COMPLETIONS_SYNC_CANDIDATE_LIMIT = 40;

  // "Sync completions from Steam" (issue #244) - a shelf-level counterpart to the one-game-at-a-time
  // nudge in GameDetailModal.tsx (issue #227) and to the Year in Review recap's auto-detection
  // (issue #230/#238) it shares candidate-scanning logic with, but run on demand, across all time,
  // and surfaced as a batch the caller reviews rather than folded into a summary or requiring each
  // game to be opened individually. Never changes a game's status itself - the client applies Done
  // to whichever candidates the caller picks via the existing bulk-status endpoint, same opt-in-by-
  // design pattern as the single-game nudge.
  app.post(
    '/api/games/sync-steam-completions',
    // A scan, not a read - each candidate costs two Steam Web API calls (see
    // findDetectedSteamCompletions), so this is capped the same way the Steam imports and Year in
    // Review are, not left at the default rate limit.
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      if (!env.STEAM_API_KEY) {
        throw new HttpError(400, 'Steam integration is not configured on this server.');
      }
      const apiKey = env.STEAM_API_KEY;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const steamId64 = resolveSteamId64(user);
      if (!steamId64) {
        throw new HttpError(400, 'Sign in with Steam to sync completions.');
      }

      // personalShelfOnly: true - the client applies Done through /api/games/bulk-status, which is
      // scoped to the Personal Shelf (roomId: null); a room-game candidate would otherwise be
      // suggested here but silently fail to update there.
      const { consideredCount, completions, unlockedBadges } = await findDetectedSteamCompletions(userId, steamId64, apiKey, {
        limit: STEAM_COMPLETIONS_SYNC_CANDIDATE_LIMIT,
        personalShelfOnly: true,
      });

      const result: SteamCompletionsSyncResult = {
        consideredCount,
        candidates: completions.map((g) => ({
          id: g.id,
          title: g.title,
          coverImageUrl: g.coverImageUrl,
          lastUnlockedAt: new Date(g.lastUnlockedAt * 1000).toISOString(),
        })),
        unlockedBadges,
      };
      return result;
    },
  );
}
