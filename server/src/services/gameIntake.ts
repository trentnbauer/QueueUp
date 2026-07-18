import { searchGames, getGameDetail, type IgdbGameDetail } from './igdbClient.js';
import { getSteamPriceAndUrl, refreshSteamPriceForced } from './priceService.js';
import { HttpError } from '../util/httpError.js';
import { ROOM_PLATFORM_LABELS, type GameSearchResult, type RoomPlatform } from '@queueup/shared';

export async function searchIntake(
  query: string,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<GameSearchResult[]> {
  const results = await searchGames(query, platforms);
  return excludeIgdbIds ? results.filter((r) => !excludeIgdbIds.has(r.igdbId)) : results;
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

/** Fully resolves a game once the user confirms adding it. */
export async function resolveGameForCreation(
  igdbId: number,
  allowedPlatforms?: RoomPlatform[],
): Promise<{
  title: string;
  platform: string;
  genre: string | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  steamAppId: number | null;
  maxCoopPlayers: number | null;
  releaseYear: number | null;
  timeToBeatHours: number | null;
}> {
  const detail = await getGameDetail(igdbId);
  assertPlatformMatch(detail, allowedPlatforms);
  const ggDealsUrl = detail.steamAppId ? (await getSteamPriceAndUrl(detail.steamAppId)).ggDealsUrl : null;

  return {
    title: detail.title,
    platform: detail.platform,
    genre: detail.genre,
    ggDealsUrl,
    coverImageUrl: detail.coverImageUrl,
    steamAppId: detail.steamAppId,
    maxCoopPlayers: detail.maxCoopPlayers,
    releaseYear: detail.releaseYear,
    timeToBeatHours: detail.timeToBeatHours,
  };
}

/** Manual/"forced" refresh path (issue #67) - subject to a once-an-hour-per-game cooldown,
 * enforced in priceService (throws HttpError(429) if still cooling down). */
export async function refreshGamePricing(steamAppId: number | null): Promise<void> {
  if (!steamAppId) return;
  await refreshSteamPriceForced(steamAppId);
}
