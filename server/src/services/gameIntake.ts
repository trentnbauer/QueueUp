import { searchGames, getGameDetail, type IgdbGameDetail } from './igdbClient.js';
import { getSteamPriceAndUrl, getSteamPrice } from './priceService.js';
import { HttpError } from '../util/httpError.js';
import { ROOM_PLATFORM_LABELS, type GameSearchResult, type RoomPlatform } from '@squadqueue/shared';

export async function searchIntake(
  query: string,
  roomPlatform?: RoomPlatform,
  excludeIgdbIds?: Set<number>,
): Promise<GameSearchResult[]> {
  const results = await searchGames(query, roomPlatform);
  return excludeIgdbIds ? results.filter((r) => !excludeIgdbIds.has(r.igdbId)) : results;
}

function assertPlatformMatch(detail: IgdbGameDetail, roomPlatform?: RoomPlatform): void {
  if (!roomPlatform) return;
  if (!detail.platformFamilies.includes(roomPlatform)) {
    throw new HttpError(
      400,
      `${detail.title} isn't available on ${ROOM_PLATFORM_LABELS[roomPlatform]}, and this room is limited to that platform.`,
    );
  }
}

/** Fully resolves a game once the user confirms adding it. */
export async function resolveGameForCreation(
  igdbId: number,
  roomPlatform?: RoomPlatform,
): Promise<{
  title: string;
  platform: string;
  genre: string | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  steamAppId: number | null;
  maxCoopPlayers: number | null;
  releaseYear: number | null;
}> {
  const detail = await getGameDetail(igdbId);
  assertPlatformMatch(detail, roomPlatform);
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
  };
}

export async function refreshGamePricing(steamAppId: number | null): Promise<void> {
  if (!steamAppId) return;
  await getSteamPrice(steamAppId, { forceRefresh: true });
}
