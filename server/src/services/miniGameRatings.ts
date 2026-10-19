import { LOBBY_GAME_IDS, MINIGAME_WEEK_MS, type AdminMiniGameRating, type LobbyGameId, type MiniGameRatingValue, type MiniGameRatingsResponse } from '@queueup/shared';
import { prisma } from '../db/client.js';

export function isRatingValue(v: unknown): v is MiniGameRatingValue {
  return v === 1 || v === -1;
}

/** Saves a person's thumbs up or down for a game. One row per person per game, so rating again replaces it. */
export async function setRating(userId: string, game: LobbyGameId, rating: MiniGameRatingValue): Promise<void> {
  await prisma.miniGameRating.upsert({
    where: { userId_gameId: { userId, gameId: game } },
    create: { userId, gameId: game, rating },
    update: { rating },
  });
}

/** The viewer's own ratings, so the thumbs can show which one they picked. */
export async function myRatings(userId: string): Promise<MiniGameRatingsResponse> {
  const rows = await prisma.miniGameRating.findMany({ where: { userId }, select: { gameId: true, rating: true } });
  const ratings: MiniGameRatingsResponse['ratings'] = {};
  for (const r of rows) if ((LOBBY_GAME_IDS as readonly string[]).includes(r.gameId) && (r.rating === 1 || r.rating === -1)) ratings[r.gameId as LobbyGameId] = r.rating;
  return { ratings };
}

/** Every game's ratings as counts, never who voted: all time, and for ratings given or changed in the last 7 days. */
export async function ratingTotals(now = Date.now()): Promise<AdminMiniGameRating[]> {
  const since = new Date(now - MINIGAME_WEEK_MS);
  const [all, week] = await Promise.all([
    prisma.miniGameRating.groupBy({ by: ['gameId', 'rating'], _count: { _all: true } }),
    prisma.miniGameRating.groupBy({ by: ['gameId', 'rating'], where: { updatedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = (rows: typeof all, game: string, rating: number) => rows.find((r) => r.gameId === game && r.rating === rating)?._count._all ?? 0;
  return LOBBY_GAME_IDS.map((game) => {
    const up = count(all, game, 1);
    const down = count(all, game, -1);
    const total = up + down;
    return { game, up, down, total, upShare: total > 0 ? up / total : null, upWeek: count(week, game, 1), downWeek: count(week, game, -1) };
  });
}
