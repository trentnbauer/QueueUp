import { withBackwardsCompatible, type GameStatus, type RecommendedGame, type RoomPlatform } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { getSimilarGames, type SimilarGameCandidate } from './igdbClient.js';
import { redis } from './redisClient.js';
import { getHiddenIgdbIds } from './hiddenRecommendations.js';

const SEED_LIMIT = 12;
const RESULT_LIMIT = 24;
const CACHE_TTL_SECONDS = 6 * 60 * 60;

/** How strongly a game in the shelf/room says "more like this". Dropped and Won't play say nothing. */
const STATUS_WEIGHT: Partial<Record<GameStatus, number>> = {
  done: 4,
  replay: 4,
  playing: 4,
  play_next: 3,
  paused: 2,
  backlog: 1,
  wishlist: 1,
};

export interface SeedGame {
  igdbId: number;
  title: string;
  status: GameStatus;
  voteScore: number;
  reviewScore: number | null;
}

/** The games recommendations are built from: the most-loved first (beaten or playing, then well
 * voted and well reviewed). */
export function pickSeeds(games: SeedGame[], limit = SEED_LIMIT): SeedGame[] {
  return games
    .filter((g) => STATUS_WEIGHT[g.status] !== undefined)
    .map((g) => ({ g, score: STATUS_WEIGHT[g.status]! * 10 + g.voteScore + (g.reviewScore ?? 50) / 20 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ g }) => g);
}

/** Orders candidates: mentioned by more seed games first, then better reviewed and better known. */
export function rankCandidates(
  candidates: SimilarGameCandidate[],
  opts: { platforms?: RoomPlatform[]; coopOnly?: boolean; titles: Map<number, string>; limit?: number },
): RecommendedGame[] {
  const playable = opts.platforms?.length ? withBackwardsCompatible(opts.platforms) : null;
  return candidates
    .filter((c) => !playable || c.platformFamilies.some((p) => playable.includes(p)))
    .filter((c) => !opts.coopOnly || c.playModes.coop)
    .map((c) => ({ c, score: c.hits * 3 + (c.reviewScore ?? 60) / 25 + Math.log10(c.ratingCount + 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? RESULT_LIMIT)
    .map(({ c }) => ({
      igdbId: c.igdbId,
      title: c.title,
      platform: c.platform,
      coverImageUrl: c.coverImageUrl,
      releaseYear: c.releaseYear,
      reason: `Like ${opts.titles.get(c.becauseOf) ?? 'what you play'}`,
      coop: c.playModes.coop,
      singlePlayerOnly: c.playModes.singlePlayerOnly,
      reviewScore: c.reviewScore,
    }));
}

/** Recommendations for a shelf (roomId null) or a room: IGDB's similar games for its best-loved
 * games, minus anything already in it, on the given platforms, optionally co-op only. Cached for
 * a few hours per scope. */
export async function recommendationsFor(
  scope: { roomId: string | null; userId: string },
  opts: { platforms?: RoomPlatform[]; coopOnly?: boolean },
): Promise<RecommendedGame[]> {
  const where = scope.roomId ? { roomId: scope.roomId, archivedAt: null } : { roomId: null, addedBy: scope.userId, archivedAt: null };
  const rows = await prisma.game.findMany({
    where,
    select: { igdbId: true, title: true, status: true, reviewScore: true, votes: { select: { value: true } } },
  });
  const seeds = pickSeeds(rows.map((r) => ({ igdbId: r.igdbId, title: r.title, status: r.status, reviewScore: r.reviewScore, voteScore: r.votes.reduce((s, v) => s + v.value, 0) })));
  if (seeds.length === 0) return [];

  const key = `recs:v1:${scope.roomId ?? `shelf:${scope.userId}`}:${seeds.map((s) => s.igdbId).join(',')}`;
  let candidates: SimilarGameCandidate[];
  const cached = await redis.get(key);
  if (cached) candidates = JSON.parse(cached) as SimilarGameCandidate[];
  else {
    candidates = await getSimilarGames(
      seeds.map((s) => s.igdbId),
      new Set(rows.map((r) => r.igdbId)),
    );
    await redis.set(key, JSON.stringify(candidates), 'EX', CACHE_TTL_SECONDS);
  }
  // Re-check against the current games: something recommended may have been added since caching.
  // Also leaves out anything this person hid.
  const have = new Set([...rows.map((r) => r.igdbId), ...(await getHiddenIgdbIds(scope.userId))]);
  return rankCandidates(
    candidates.filter((c) => !have.has(c.igdbId)),
    { ...opts, titles: new Map(seeds.map((s) => [s.igdbId, s.title])) },
  );
}
