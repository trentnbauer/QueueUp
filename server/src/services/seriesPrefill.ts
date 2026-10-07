import { prisma } from '../db/client.js';
import { redis } from './redisClient.js';
import { getCollectionGames } from './igdbClient.js';
import type { CollectionGamesResult, GameSeriesResponse, GameStatus } from '@queueup/shared';

/** Saves "Play after" for games that belong to an IGDB series (#1082), from the series' release order.
 *
 * IGDB has no "sequel of" link, only the series (a "collection") with release dates, so the order is a guess: a
 * spin-off or a remaster can look like a predecessor. So it is deliberately cautious:
 *  - only between games already on the same list (the person's shelf, or one room), never invented;
 *  - only when the earlier game is not finished or set aside, and the later one is not either;
 *  - only when the two released at least MIN_GAP_DAYS apart (same-year or near-duplicate releases are the ambiguous ones);
 *  - never DLC/add-ons (they have a base game, not a predecessor);
 *  - never over a choice the person made: any "Play after" they set or cleared by hand is theirs for good
 *    (`prerequisiteSource` = 'manual'), and only an untouched empty one is ever filled, as 'auto', so the page can say
 *    where it came from and let them change or clear it. */
export const MIN_GAP_DAYS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const SETTLED: GameStatus[] = ['done', 'replay', 'dropped', 'wont_play'];

export interface PrefillGame {
  id: string;
  igdbCollectionId: number | null;
  releaseTs: number | null;
  status: GameStatus;
  prerequisiteGameId: string | null;
  prerequisiteSource: string | null;
  baseGameId: string | null;
}

/** Which games should get which "Play after", looking only at pairs where one of the two is in `touched` (the games
 * that were just added), so adding one game never reshuffles the rest of the library. Pure. */
export function planPrefill(games: PrefillGame[], touched: ReadonlySet<string>): { gameId: string; prerequisiteId: string }[] {
  const bySeries = new Map<number, PrefillGame[]>();
  for (const g of games) {
    if (g.igdbCollectionId === null || g.releaseTs === null || g.baseGameId !== null) continue;
    const list = bySeries.get(g.igdbCollectionId) ?? [];
    list.push(g);
    bySeries.set(g.igdbCollectionId, list);
  }
  const plan: { gameId: string; prerequisiteId: string }[] = [];
  for (const list of bySeries.values()) {
    list.sort((a, b) => a.releaseTs! - b.releaseTs!);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const next = list[i];
      if (!touched.has(prev.id) && !touched.has(next.id)) continue;
      if (next.prerequisiteGameId !== null || next.prerequisiteSource !== null) continue;
      if (SETTLED.includes(prev.status) || SETTLED.includes(next.status)) continue;
      if (next.releaseTs! - prev.releaseTs! < MIN_GAP_DAYS * DAY_MS) continue;
      plan.push({ gameId: next.id, prerequisiteId: prev.id });
    }
  }
  return plan;
}

const releaseTs = (g: { releaseDate: Date | null; releaseYear: number | null }): number | null =>
  g.releaseDate ? g.releaseDate.getTime() : g.releaseYear !== null ? Date.UTC(g.releaseYear, 0, 1) : null;

/** Fills "Play after" from the series for the games just added to a list (a room, or one person's Personal Shelf).
 * Best effort: it must never fail an add or a sync. */
export async function fillPlayAfterFromSeries(scope: { roomId: string | null; ownerId: string }, addedGameIds: string[]): Promise<void> {
  if (addedGameIds.length === 0) return;
  try {
    const where = scope.roomId ? { roomId: scope.roomId } : { roomId: null, addedBy: scope.ownerId };
    const added = await prisma.game.findMany({ where: { ...where, id: { in: addedGameIds }, igdbCollectionId: { not: null } }, select: { igdbCollectionId: true } });
    const seriesIds = [...new Set(added.map((g) => g.igdbCollectionId).filter((id): id is number => id !== null))];
    if (seriesIds.length === 0) return;
    const rows = await prisma.game.findMany({
      where: { ...where, igdbCollectionId: { in: seriesIds }, archivedAt: null },
      select: { id: true, igdbCollectionId: true, releaseDate: true, releaseYear: true, status: true, prerequisiteGameId: true, prerequisiteSource: true, baseGameId: true },
    });
    const games: PrefillGame[] = rows.map((r) => ({
      id: r.id,
      igdbCollectionId: r.igdbCollectionId,
      releaseTs: releaseTs(r),
      status: r.status,
      prerequisiteGameId: r.prerequisiteGameId,
      prerequisiteSource: r.prerequisiteSource,
      baseGameId: r.baseGameId,
    }));
    for (const step of planPrefill(games, new Set(addedGameIds))) {
      // The guard in the where makes it race-safe: only still-empty, still-untouched ones are filled.
      await prisma.game.updateMany({ where: { id: step.gameId, prerequisiteGameId: null, prerequisiteSource: null }, data: { prerequisiteGameId: step.prerequisiteId, prerequisiteSource: 'auto' } });
    }
  } catch (err) {
    console.error('[series-prefill] failed', err);
  }
}

/** The same, for games a sync just brought onto the Personal Shelf, known by their IGDB ids. */
export async function fillPlayAfterForNewIgdbIds(userId: string, igdbIds: number[]): Promise<void> {
  if (igdbIds.length === 0) return;
  try {
    const rows = await prisma.game.findMany({ where: { roomId: null, addedBy: userId, igdbId: { in: [...new Set(igdbIds)] } }, select: { id: true } });
    await fillPlayAfterFromSeries({ roomId: null, ownerId: userId }, rows.map((r) => r.id));
  } catch (err) {
    console.error('[series-prefill] failed', err);
  }
}

// ---- the series itself, for the game page ------------------------------------------------------------------------

const SERIES_CACHE_PREFIX = 'igdb:series:v1:';
const SERIES_CACHE_SECONDS = 3 * 24 * 60 * 60;

/** A series' games in release order, from IGDB, cached for three days and shared by everyone (one IGDB request per
 * series, never per game). DLC and add-ons are left out. */
export async function getSeriesGames(collectionId: number): Promise<CollectionGamesResult> {
  try {
    const cached = await redis.get(SERIES_CACHE_PREFIX + collectionId);
    if (cached) return JSON.parse(cached) as CollectionGamesResult;
  } catch {
    /* an unreadable cache is just fetched again */
  }
  const series = await getCollectionGames(collectionId);
  await redis.set(SERIES_CACHE_PREFIX + collectionId, JSON.stringify(series), 'EX', SERIES_CACHE_SECONDS).catch(() => undefined);
  return series;
}

/** The entries of a series that came out in an earlier year than the game and are not already on the list. Games
 * with no release year, and same-year ones, are left out: the order there is a guess. Pure. */
export function earlierMissing(series: CollectionGamesResult, game: { igdbId: number; releaseYear: number | null }, onList: ReadonlySet<number>): GameSeriesResponse['series'] {
  if (game.releaseYear === null) return { name: series.name, earlierTotal: 0, earlierMissing: [], truncated: series.truncated };
  const earlier = series.games.filter((g) => g.igdbId !== game.igdbId && g.releaseYear !== null && g.releaseYear < game.releaseYear!);
  return { name: series.name, earlierTotal: earlier.length, earlierMissing: earlier.filter((g) => !onList.has(g.igdbId)), truncated: series.truncated };
}
