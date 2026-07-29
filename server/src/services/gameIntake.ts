import {
  searchGames,
  searchCollections,
  getGameDetail,
  getCollectionGames,
  getTrendingGames,
  getGameDlcs,
  isAddonCategory,
  type GameSearchPage,
  type IgdbGameDetail,
} from './igdbClient.js';
import { getSteamPriceAndUrl, refreshSteamPriceForced } from './priceService.js';
import { findSteamAppIdByTitle } from './steamLibrary.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import {
  duplicateScopeWhere,
  loadGameOr404,
  requireNotDuplicate,
  requireNotAlreadySuggested,
  rethrowAsDuplicateGame,
  invalidateExistingIgdbIds,
} from './gameAccess.js';
import { getRoom, requireMembership } from './roomAccess.js';
import { serializeGame } from './gameSerializer.js';
import { setOwnershipPlatforms } from './gameOwnership.js';
import { getOwnedPlatforms } from './userSettings.js';
import { notifyRoom } from './notifications.js';
import { toUserDto } from '../util/dto.js';
import { Prisma } from '@prisma/client';
import {
  ROOM_PLATFORM_LABELS,
  type CollectionGamesResult,
  type CollectionSearchResult,
  type CreateGameResponse,
  type GameSearchResult,
  type GameStatus,
  type RoomPlatform,
} from '@queueup/shared';

export async function searchIntake(
  query: string,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
  offset = 0,
  hideAddons = true,
): Promise<GameSearchPage> {
  const page = await searchGames(query, platforms, offset, hideAddons);
  return {
    ...page,
    results: excludeIgdbIds ? page.results.filter((r) => !excludeIgdbIds.has(r.igdbId)) : page.results,
  };
}

export async function searchCollectionsIntake(query: string): Promise<CollectionSearchResult[]> {
  return searchCollections(query);
}

/** Backs the Add Game modal's "Popular" browse tab (issue #363) - see getTrendingGames for why
 * this is ranked by IGDB's total_rating_count rather than its popularity_primitives endpoint. */
export async function trendingIntake(
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
  hideAddons = true,
): Promise<GameSearchResult[]> {
  return getTrendingGames(platforms, excludeIgdbIds, hideAddons);
}

export async function collectionGamesIntake(
  collectionId: number,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
  hideAddons = true,
): Promise<CollectionGamesResult> {
  return getCollectionGames(collectionId, platforms, excludeIgdbIds, hideAddons);
}

/** Backs the game modal's "View DLC" browse-and-add list (issue #338). */
export async function dlcIntake(
  igdbId: number,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<GameSearchResult[]> {
  return getGameDlcs(igdbId, platforms, excludeIgdbIds);
}

/** Validates a resolved game against an allowed-platforms set. Used both for a room (always a
 * single-element array - its one platform) and the Personal Shelf (the user's ticked "owned
 * systems", which can be any size, or empty/undefined to mean "no filter opted into yet"). */
export function assertPlatformMatch(detail: IgdbGameDetail, allowedPlatforms?: RoomPlatform[]): void {
  if (!allowedPlatforms || allowedPlatforms.length === 0) return;
  if (detail.platformFamilies.some((f) => allowedPlatforms.includes(f))) return;

  const labels = allowedPlatforms.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ');
  const message =
    allowedPlatforms.length === 1
      ? `${detail.title} isn't available on ${labels}, and this room is limited to that platform.`
      : `${detail.title} isn't available on any of your owned systems (${labels}).`;
  throw new HttpError(400, message);
}

/** IGDB's external_games (its crowd-sourced Steam-appid link) is sometimes just never filled in
 * for a title, even one that's genuinely live on Steam right now - seen with Borderlands 4 at the
 * time this was written, well after release. Falls back to a direct Steam store search by title
 * (see findSteamAppIdByTitle) rather than leaving pricing permanently unavailable for those. */
async function resolveSteamAppId(detail: IgdbGameDetail): Promise<number | null> {
  return detail.steamAppId ?? (await findSteamAppIdByTitle(detail.title));
}

/** Issue #370: a game whose IGDB release date is still in the future read oddly sitting in the
 * backlog next to titles someone can actually sit down and play right now - defaults it into the
 * wishlist instead, the same status a manually-wishlisted or Steam-wishlist-imported game gets. A
 * game with no known release date at all (IGDB just doesn't have one on file) keeps the ordinary
 * 'backlog' default - there's no signal here that it's actually unreleased. */
export function defaultStatusForRelease(releaseDate: Date | null): GameStatus {
  return releaseDate !== null && releaseDate.getTime() > Date.now() ? 'wishlist' : 'backlog';
}

/** Fully resolves a game once the user confirms adding it.
 * `platformLabelOverride` replaces IGDB's full "everywhere this title has ever released" platform
 * string with a specific one - used by the Steam library import (see games.ts), where owning a
 * game on Steam only ever means owning it on PC, regardless of what other systems IGDB lists the
 * title as also being available on (issue: Steam sync was tagging games as PlayStation/Xbox). */
export async function resolveGameForCreation(
  igdbId: number,
  allowedPlatforms?: RoomPlatform[],
  platformLabelOverride?: string,
): Promise<{
  title: string;
  platform: string;
  genre: string | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  steamAppId: number | null;
  maxCoopPlayers: number | null;
  releaseYear: number | null;
  releaseDate: Date | null;
  timeToBeatHours: number | null;
  timeToBeatRushedHours: number | null;
  timeToBeatCompletionistHours: number | null;
  igdbCollectionId: number | null;
  reviewScore: number | null;
  /** IGDB's raw category enum value (issue #338) - see isAddonCategory. Paired with
   * parentGameIgdbId below to auto-link a newly-created DLC row back to its base game via
   * linkDlcToBaseGame, right after the caller's own prisma.game.create succeeds. */
  category: number | null;
  parentGameIgdbId: number | null;
}> {
  const detail = await getGameDetail(igdbId);
  assertPlatformMatch(detail, allowedPlatforms);
  const steamAppId = await resolveSteamAppId(detail);
  const ggDealsUrl = steamAppId ? (await getSteamPriceAndUrl(steamAppId)).ggDealsUrl : null;

  return {
    title: detail.title,
    platform: platformLabelOverride ?? detail.platform,
    genre: detail.genre,
    ggDealsUrl,
    coverImageUrl: detail.coverImageUrl,
    steamAppId,
    maxCoopPlayers: detail.maxCoopPlayers,
    releaseYear: detail.releaseYear,
    releaseDate: detail.releaseDate,
    timeToBeatHours: detail.timeToBeatHours,
    timeToBeatRushedHours: detail.timeToBeatRushedHours,
    timeToBeatCompletionistHours: detail.timeToBeatCompletionistHours,
    igdbCollectionId: detail.igdbCollectionId,
    reviewScore: detail.reviewScore,
    category: detail.category,
    parentGameIgdbId: detail.parentGameIgdbId,
  };
}

/** Resolves (or, for the base game only, creates) the row a newly-added DLC's baseGameId should
 * point at, and sets it (issue #338's "when adding a DLC, ensure the base game is added" + "link
 * DLC back to the main game"). Scoped the same way duplicate-detection is (same room, or the same
 * user's Personal Shelf) - a DLC's base game must live alongside it, not in some other room.
 *
 * Callers pass this the *already-created* DLC row's id and check isAddonCategory/parentGameIgdbId
 * themselves first - this never fails the caller's own game creation if anything here goes wrong
 * (base game creation failing, IGDB hiccuping on the parent lookup): a DLC still gets added even
 * if it can't be linked, since the alternative (rolling back a perfectly good DLC add over a
 * best-effort backlink) would be worse.
 *
 * `platformLabelOverride`/`statusOverride` exist so a Steam import loop's base-game auto-create
 * matches every sibling row it creates directly (Steam ownership only ever means PC, regardless of
 * what else IGDB lists a title as available on; a wishlist import's rows are unconditionally
 * `wishlist`, not run through defaultStatusForRelease at all) - a caller that already has that
 * context passes it through rather than this falling back to resolveGameForCreation's own
 * IGDB-derived platform string and defaultStatusForRelease's release-date guess.
 *
 * Returns the base game's id/igdbId on success (including when it already existed and needed no
 * create) so a caller with its own in-memory "already accounted for" bookkeeping (existingIgdbIdSet/
 * ownedIgdbIds in the Steam import loops) can update it - this function creates rows directly via
 * Prisma, bypassing whatever loop-local tracking the caller is keeping. Returns null on any
 * failure, best-effort as documented above. */
export async function linkDlcToBaseGame(
  dlcGameId: string,
  parentGameIgdbId: number,
  roomId: string | null,
  userId: string,
  allowedPlatforms?: RoomPlatform[],
  platformLabelOverride?: string,
  statusOverride?: GameStatus,
): Promise<{ baseGameId: string; baseIgdbId: number } | null> {
  try {
    const scopeWhere = duplicateScopeWhere(roomId, userId);
    let base = await prisma.game.findFirst({ where: { ...scopeWhere, igdbId: parentGameIgdbId } });

    if (!base) {
      const resolved = await resolveGameForCreation(parentGameIgdbId, allowedPlatforms, platformLabelOverride);
      try {
        base = await prisma.game.create({
          data: {
            roomId,
            addedBy: userId,
            igdbId: parentGameIgdbId,
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
            status: statusOverride ?? defaultStatusForRelease(resolved.releaseDate),
          },
        });
      } catch (err) {
        // Lost a race against a concurrent add of the same base game (e.g. two DLC entries for the
        // same title importing at once) - the partial unique index backstop (see
        // rethrowAsDuplicateGame) means the loser here just re-fetches the winner's row instead of
        // failing the whole DLC add over it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          base = await prisma.game.findFirst({ where: { ...scopeWhere, igdbId: parentGameIgdbId } });
        } else {
          throw err;
        }
      }
    }

    if (!base) return null;
    await prisma.game.update({ where: { id: dlcGameId }, data: { baseGameId: base.id } });
    return { baseGameId: base.id, baseIgdbId: base.igdbId };
  } catch {
    // Best-effort, as documented above - an unlinked DLC entry is a fine fallback outcome.
    return null;
  }
}

/** The full "add a game by igdbId" flow - shared by the cookie-authenticated POST /api/games route
 * and the bearer-authenticated POST /api/v1 push routes (issue #435), so a script pushing a game
 * in gets exactly the same duplicate detection, DLC linking, approval-flow, and notification
 * behavior a real Add Game click would, rather than a second, driftable copy of it. Membership
 * (and, for the approval-flow decision, role) is resolved here rather than by the caller, since
 * both callers need it for the same reason. */
export async function createGameForUser(
  userId: string,
  roomId: string | null,
  igdbId: number,
  options: { status?: GameStatus; ownedPlatforms?: RoomPlatform[] } = {},
): Promise<CreateGameResponse> {
  const { status, ownedPlatforms } = options;
  if (!Number.isInteger(igdbId)) throw new HttpError(400, 'A valid igdbId is required');
  if (status !== undefined && status !== 'backlog' && status !== 'wishlist') {
    throw new HttpError(400, 'status must be "backlog" or "wishlist"');
  }
  // Owned-platforms only makes sense for a Personal Shelf add (see the Add Game modal) - a room
  // game's ownership is scoped to the room's own platform instead (see gameOwnership.ts), set via
  // its own toggle, not at intake time.
  if (ownedPlatforms !== undefined && roomId) {
    throw new HttpError(400, 'ownedPlatforms is only supported when adding to the Personal Shelf');
  }
  // The client only ever pairs ownedPlatforms with an explicit status: 'backlog' (the Add Game
  // modal's owned/platforms step) - enforced here too, not just by the client's own ternary, so a
  // game can't end up simultaneously wishlisted and flagged owned (e.g. "you own this" showing for
  // something that's still just on the wishlist) via a request that skips the normal UI.
  if (ownedPlatforms !== undefined && ownedPlatforms.length > 0 && status !== 'backlog') {
    throw new HttpError(400, 'ownedPlatforms is only supported when status is "backlog"');
  }

  let room: Awaited<ReturnType<typeof getRoom>> | null = null;
  let membershipRole: string | null = null;
  if (roomId) {
    const membership = await requireMembership(roomId, userId);
    membershipRole = membership.role;
    room = await getRoom(roomId);
  }

  // Issue #362: in a room with requireGameApproval on, a plain Member's add becomes a suggestion
  // for a Room Master/Moderator to approve or decline, instead of landing directly in the backlog.
  // Room Masters/Moderators (and, for the API, whichever role the pushing key's owner actually
  // holds in the room) always add directly - they're the ones who'd otherwise be approving their
  // own suggestion.
  if (roomId && room && room.requireGameApproval && membershipRole === 'member') {
    await requireNotDuplicate(roomId, userId, igdbId);
    await requireNotAlreadySuggested(roomId, igdbId);

    const detail = await getGameDetail(igdbId);
    assertPlatformMatch(detail, [room.platform]);

    const suggestion = await prisma.gameSuggestion.create({
      data: {
        roomId,
        igdbId,
        title: detail.title,
        platform: detail.platform,
        coverImageUrl: detail.coverImageUrl,
        releaseYear: detail.releaseYear,
        suggestedBy: userId,
      },
      include: { suggester: true },
    });
    await invalidateExistingIgdbIds(roomId, userId);
    await notifyRoom({
      roomId,
      roomName: room.name,
      actorId: userId,
      type: 'game_suggested',
      message: (actorName) => `${actorName} suggested "${detail.title}" for the room`,
    });

    return {
      suggestion: {
        id: suggestion.id,
        roomId: suggestion.roomId,
        igdbId: suggestion.igdbId,
        title: suggestion.title,
        platform: suggestion.platform,
        coverImageUrl: suggestion.coverImageUrl,
        releaseYear: suggestion.releaseYear,
        suggestedBy: toUserDto(suggestion.suggester),
        createdAt: suggestion.createdAt.toISOString(),
      },
    };
  }

  const platforms = room ? [room.platform] : await getOwnedPlatforms(userId);
  await requireNotDuplicate(roomId ?? null, userId, igdbId);

  const resolved = await resolveGameForCreation(igdbId, platforms);

  let created;
  try {
    created = await prisma.game.create({
      data: {
        roomId: roomId ?? null,
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
        // Explicit status (Personal Shelf's Add Game modal, or an API push) wins outright;
        // otherwise issue #370's release-date guess (an unreleased game defaults into the wishlist).
        status: status ?? defaultStatusForRelease(resolved.releaseDate),
      },
    });
  } catch (err) {
    rethrowAsDuplicateGame(err, roomId ?? null, resolved.title);
  }
  // Issue #338: this is DLC/an expansion IGDB has a parent link on file for - ensure that base
  // game is present in the same room/shelf (creating it if needed) and link this row back to it.
  if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
    await linkDlcToBaseGame(created.id, resolved.parentGameIgdbId, roomId ?? null, userId, platforms);
  }
  // Personal Shelf's Add Game modal (owned/platforms picker) - marks ownership at intake time
  // instead of a separate follow-up action, so "I own this on Switch" is recorded the moment the
  // game lands on the shelf.
  if (ownedPlatforms && ownedPlatforms.length > 0) {
    await setOwnershipPlatforms(userId, igdbId, ownedPlatforms);
  }
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

  return { game: await serializeGame(game, userId) };
}

/** Manual/"forced" refresh path (issue #67) - subject to a once-an-hour-per-game cooldown,
 * enforced in priceService (throws HttpError(429) if still cooling down). Also re-persists
 * ggDealsUrl on every refresh (not just once, at intake/backfill time) - a URL captured as null
 * during a prior outage or misconfiguration (bad key, bad region) would otherwise stay null
 * forever even after the price itself starts coming back live again. */
export async function refreshGamePricing(gameId: string, steamAppId: number | null): Promise<void> {
  if (!steamAppId) return;
  const { ggDealsUrl } = await refreshSteamPriceForced(steamAppId);
  if (ggDealsUrl) {
    await prisma.game.update({ where: { id: gameId }, data: { ggDealsUrl } });
  }
}

/** A game added before a Steam App ID could be resolved for it (IGDB had no link, and the direct
 * Steam store search fallback in resolveSteamAppId either wasn't in place yet or also came up
 * empty at the time) is stuck showing "price unavailable" forever - nothing else ever re-checks
 * after intake, and the UI's refresh button used to only appear once a price had already loaded.
 * A manual price refresh on such a game re-resolves the Steam App ID (IGDB, then the Steam store
 * search fallback) and backfills steamAppid/ggDealsUrl on the row if one is found, so pricing can
 * kick in without the user having to remove and re-add the game. Not gated by the gg.deals
 * cooldown below - these are separate, already cache-fronted lookups. */
export async function backfillSteamAppId(gameId: string, igdbId: number): Promise<number | null> {
  const detail = await getGameDetail(igdbId);
  const steamAppId = await resolveSteamAppId(detail);
  if (!steamAppId) return null;

  const { ggDealsUrl } = await getSteamPriceAndUrl(steamAppId);
  await prisma.game.update({ where: { id: gameId }, data: { steamAppid: steamAppId, ggDealsUrl } });
  return steamAppId;
}

/** Manually pins a game's Steam App ID (issue: manual gg.deals match) - for when neither the IGDB
 * link nor the exact-title Steam search fallback found the right release (or found none at all),
 * and the person looking at the card can see for themselves which Steam store result is actually
 * theirs. Passing null clears the match instead, reverting to "price unavailable" - a future
 * automatic or manual match can always try again from there. Not gated by the forced-refresh
 * cooldown in refreshGamePricing - this pins a specific, deliberately-chosen id for the first
 * time, not the "check this same id yet again" case that cooldown protects against. */
export async function setManualSteamMatch(gameId: string, steamAppId: number | null): Promise<void> {
  if (steamAppId === null) {
    await prisma.game.update({ where: { id: gameId }, data: { steamAppid: null, ggDealsUrl: null } });
    return;
  }

  const { ggDealsUrl } = await getSteamPriceAndUrl(steamAppId, { forceRefresh: true });
  await prisma.game.update({ where: { id: gameId }, data: { steamAppid: steamAppId, ggDealsUrl } });
}
