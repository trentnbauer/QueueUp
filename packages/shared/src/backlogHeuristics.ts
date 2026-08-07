import type { GameStatus } from './types.js';

/** Structural subset of `Game` these heuristics need - kept narrow (rather than importing the
 * full `Game` type) so the server can call them against a lean Prisma `select` instead of paying
 * for a full serialized Game (Steam price lookups, ownership, etc. - see gameSerializer.ts) just
 * to answer "is this neglected." `Game` itself already satisfies this shape, so every existing
 * client call site keeps working unchanged. `votes` is optional and defaults to empty - a
 * Personal Shelf game never has any (voting is a room-only concept), so a server-side caller
 * scoped to the Personal Shelf can omit it entirely rather than querying an empty relation. */
export interface NeglectCheckInput {
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  votes?: { createdAt: string }[];
}

// Ongoing "you've had this a while and haven't touched it" nudge (issue #249) - Year in Review
// (see the /api/me/year-in-review route) already says this, but only as a once-a-year, on-demand
// snapshot over a fixed trailing-12-month window. This is meant to be a year-round ambient signal
// instead, so it needs a much shorter window - 3 months is long enough that a game isn't flagged
// the week after it's added, but short enough to actually nudge toward clearing the backlog rather
// than only ever looking back once a year. Named/exported so the threshold has exactly one place to
// tune instead of a magic number buried in the predicate below.
export const NEGLECTED_BACKLOG_MONTHS = 3;

// Plain `setMonth(getMonth() - N)` overflows into the following month whenever the current
// day-of-month doesn't exist N months earlier (e.g. May 31 minus 3 months rolls past a 28-day
// February into March 3, not Feb 28) - shifting the day to the 1st first avoids the month-length
// mismatch, then the original day is restored, clamped to the target month's actual last day so
// it can't overflow into the month after that instead.
//
// All of this uses the UTC variants (getUTCDate/setUTCMonth/etc.), not the local-time ones (issue
// #522) - the local variants re-derive the timezone offset for the shifted month, so on a non-UTC
// server whose "now" and "now minus N months" straddle a DST transition, the computed threshold
// silently drifts by the DST delta (typically an hour) from the intended instant. Callers'
// timestamps are all UTC instants (ISO strings) to begin with, so doing this arithmetic in UTC is
// also the more natural fit, not just the safer one - the result no longer depends on the calling
// process's local timezone at all. Extracted from isNeglectedBacklogGame below (issue #564) so
// suggestsDroppingStalePlaying in playtimeSignals.ts can reuse the exact same "N months ago"
// instant instead of re-deriving this same DST-aware arithmetic a second time.
export function monthsAgoUtc(months: number, now: number = Date.now()): number {
  const threshold = new Date(now);
  const originalDay = threshold.getUTCDate();
  threshold.setUTCDate(1);
  threshold.setUTCMonth(threshold.getUTCMonth() - months);
  const lastDayOfTargetMonth = new Date(Date.UTC(threshold.getUTCFullYear(), threshold.getUTCMonth() + 1, 0)).getUTCDate();
  threshold.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return threshold.getTime();
}

/** A backlog game added NEGLECTED_BACKLOG_MONTHS+ ago with no recent activity. "No recent
 * activity" mirrors how the rest of the codebase already treats these two signals (see the
 * year-in-review route): Game.updatedAt as a proxy for the last status change - any edit bumps it,
 * so a completely untouched game will have updatedAt === createdAt, but this can also miss genuine
 * neglect if some unrelated edit (e.g. a target price) bumped it - and votes checked separately via
 * their own per-vote createdAt, since casting a vote does not touch Game.updatedAt at all. */
export function isNeglectedBacklogGame(game: NeglectCheckInput, now: number = Date.now()): boolean {
  if (game.status !== 'backlog') return false;

  const thresholdMs = monthsAgoUtc(NEGLECTED_BACKLOG_MONTHS, now);

  if (new Date(game.createdAt).getTime() > thresholdMs) return false;
  if (new Date(game.updatedAt).getTime() > thresholdMs) return false;
  if ((game.votes ?? []).some((v) => new Date(v.createdAt).getTime() > thresholdMs)) return false;

  return true;
}

/** Structural subset `collectionProgress` needs - see NeglectCheckInput's doc comment for why
 * this stays narrow rather than importing the full `Game` type. */
export interface CollectionProgressInput {
  igdbCollectionId: number | null;
  status: GameStatus;
}

/** How many of a franchise's entries already added to this room/shelf are Beaten, out of how many
 * are added (issue #366) - built on the IGDB collection id already stored per game
 * (igdbCollectionId). This is progress through what's already been added, not the whole franchise -
 * there's no "how many games are in this series total" data on file, only what's actually here.
 * Null when the game isn't in a collection, or it's the only entry from that collection added so
 * far (nothing to show progress against). */
export function collectionProgress<T extends CollectionProgressInput>(game: T, games: T[]): { beaten: number; total: number } | null {
  if (game.igdbCollectionId === null) return null;
  const sameCollection = games.filter((g) => g.igdbCollectionId === game.igdbCollectionId);
  if (sameCollection.length < 2) return null;
  return { beaten: sameCollection.filter((g) => g.status === 'done').length, total: sameCollection.length };
}
