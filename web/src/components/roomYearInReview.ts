import type { Game } from '@queueup/shared';

export interface RoomYearInReviewGenreCount {
  genre: string;
  count: number;
}

export interface RoomYearInReviewTopVotedGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  voteScore: number;
}

export interface RoomYearInReview {
  windowStart: string;
  windowEnd: string;
  /** Every game marked Done in this room within the window - collective, not per-member (issue
   * #365). A room game's status is one shared field, not per-member (see AchievementRow/Game
   * doc comments elsewhere), so this is naturally the whole group's completions already, unlike
   * the personal Year in Review which has to combine each user's own Done games individually. */
  completedGames: { id: string; title: string; coverImageUrl: string | null }[];
  /** Genres of the completed games above, tallied by count, highest first. Games with no genre on
   * file are omitted rather than lumped into an "Unknown" bucket - same convention as the personal
   * Year in Review's genreSpread. */
  genreSpread: RoomYearInReviewGenreCount[];
  /** The game with the most vote weight cast in the window, regardless of who cast it or who added
   * it. Null when nobody voted on anything in this room within the window. */
  topVoted: RoomYearInReviewTopVotedGame | null;
}

/** A room-scoped counterpart to the personal Year in Review (issue #365) - built entirely from
 * games already loaded for this room (no new fetch, no per-member Steam calls - a room's games are
 * a single shared list, not one per member), same trailing-12-month window as the personal recap. */
export function computeRoomYearInReview(games: Game[], now: number = Date.now()): RoomYearInReview {
  const windowEnd = new Date(now);
  const windowStart = new Date(windowEnd);
  // Plain `setFullYear(getFullYear() - 1)` rolls a Feb 29 (leap day) over to March 1 of the prior
  // year whenever that year isn't itself a leap year - it has no Feb 29 to land on (issue #527;
  // same overflow shape as the month-shift fixed in isNeglectedBacklogGame, issue #522). Shifting
  // to day 1 first avoids the day-doesn't-exist mismatch, then the original day is restored,
  // clamped to the target year's actual last day of that month so it can't overflow forward again.
  const originalDate = windowStart.getUTCDate();
  windowStart.setUTCDate(1);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1, 0)).getUTCDate();
  windowStart.setUTCDate(Math.min(originalDate, lastDayOfTargetMonth));
  const windowStartMs = windowStart.getTime();

  const completed = games.filter((g) => g.status === 'done' && new Date(g.updatedAt).getTime() >= windowStartMs);

  const genreCounts = new Map<string, number>();
  for (const g of completed) {
    if (!g.genre) continue;
    genreCounts.set(g.genre, (genreCounts.get(g.genre) ?? 0) + 1);
  }
  const genreSpread = Array.from(genreCounts.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);

  let topVoted: RoomYearInReviewTopVotedGame | null = null;
  let topScore = -Infinity;
  for (const g of games) {
    const score = g.votes
      .filter((v) => new Date(v.createdAt).getTime() >= windowStartMs)
      .reduce((sum, v) => sum + v.value, 0);
    if (score === 0) continue; // nothing cast in the window for this game - not a candidate at all
    if (score > topScore) {
      topScore = score;
      topVoted = { id: g.id, title: g.title, coverImageUrl: g.coverImageUrl, voteScore: score };
    }
  }

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    completedGames: completed.map((g) => ({ id: g.id, title: g.title, coverImageUrl: g.coverImageUrl })),
    genreSpread,
    topVoted,
  };
}
