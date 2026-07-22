import { searchGames, searchCollections, getGameDetail, getCollectionGames, type IgdbGameDetail } from './igdbClient.js';
import { getSteamPriceAndUrl, refreshSteamPriceForced } from './priceService.js';
import { findSteamAppIdByTitle } from './steamLibrary.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import {
  ROOM_PLATFORM_LABELS,
  type CollectionGamesResult,
  type CollectionSearchResult,
  type GameSearchResult,
  type RoomPlatform,
} from '@queueup/shared';

export async function searchIntake(
  query: string,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<GameSearchResult[]> {
  const results = await searchGames(query, platforms);
  return excludeIgdbIds ? results.filter((r) => !excludeIgdbIds.has(r.igdbId)) : results;
}

export async function searchCollectionsIntake(query: string): Promise<CollectionSearchResult[]> {
  return searchCollections(query);
}

export async function collectionGamesIntake(
  collectionId: number,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<CollectionGamesResult> {
  return getCollectionGames(collectionId, platforms, excludeIgdbIds);
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
  };
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
