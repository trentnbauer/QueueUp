import type { GameStatus } from '@queueup/shared';
import { isNeglectedBacklogGame } from '@queueup/shared';
import type { BacklogAgeBucket, MostNeglectedGame } from '@queueup/shared';

/** Pure aggregation logic behind GET /api/me/backlog-insights (issue #512) - split out of the
 * route (same reasoning as roomActivity.ts's cursor codec) so the date-math/bucketing/ranking can
 * be unit tested directly against plain rows instead of only through a live DB query. */

/** One closed PlayLog entry, as fetched for averageDaysToBeat/averageHoursToBeat. The playtime
 * fields are optional (not just nullable) rather than required - callers/tests that only care
 * about the calendar-days figure (summarizeTimeToBeat, which predates issue #548/#562's playtime
 * fields on PlayLog) can keep constructing these with just the two timestamps, same as before this
 * issue added the hours-based stat alongside it. */
export interface FinishedPlayLogEntry {
  startedAt: Date;
  finishedAt: Date;
  startPlaytimeMinutes?: number | null;
  finishPlaytimeMinutes?: number | null;
}

/** Zero-duration entries come from `recordStatusTransition`'s "jumped straight to Done/Dropped
 * without ever passing through Playing" fallback (see PlayLog's schema doc) - logged after the
 * fact rather than a real playthrough stretch, so averaging them in would drag the result toward
 * zero without reflecting how long anything actually took. Same `durationMs > 0` gate the Not For
 * Me badge check already uses for exactly this reason (see games.ts's quickDropKeys). */
function isRealDuration(entry: FinishedPlayLogEntry): boolean {
  return entry.finishedAt.getTime() > entry.startedAt.getTime();
}

/** Average calendar days from Playing to Done/Replay across `entries`, plus how many entries
 * contributed - see BacklogInsights.averageDaysToBeat for why this is days (calendar elapsed
 * time), not hours (active playtime, which PlayLog doesn't track). Null average when nothing
 * qualifies, so the UI can show "not enough data yet" rather than a misleading 0. */
export function summarizeTimeToBeat(entries: FinishedPlayLogEntry[]): {
  averageDaysToBeat: number | null;
  finishedEntryCount: number;
} {
  const real = entries.filter(isRealDuration);
  if (real.length === 0) return { averageDaysToBeat: null, finishedEntryCount: 0 };

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const totalDays = real.reduce((sum, e) => sum + (e.finishedAt.getTime() - e.startedAt.getTime()) / MS_PER_DAY, 0);
  // One decimal place - enough precision to distinguish "a couple days" from "a week or two"
  // without a false-precision string of digits.
  const averageDaysToBeat = Math.round((totalDays / real.length) * 10) / 10;
  return { averageDaysToBeat, finishedEntryCount: real.length };
}

/** An entry with both playtime stamps present and actually increasing - issue #548's
 * PLAYTIME_TRACKING_ENABLED-gated fields are null on any entry from before that shipped, or
 * whenever the game/its adder had no Steam playtime data to attribute at the time (see
 * currentPlaytimeMinutesForGame's doc comment). `> ` rather than `>=` for the same "logged after
 * the fact, not a real stretch" reasoning isRealDuration above already applies to the calendar-days
 * figure - a 0-minute delta shouldn't count as a real playthrough either. */
function hasRealPlaytime(
  entry: FinishedPlayLogEntry,
): entry is FinishedPlayLogEntry & { startPlaytimeMinutes: number; finishPlaytimeMinutes: number } {
  return entry.startPlaytimeMinutes != null && entry.finishPlaytimeMinutes != null && entry.finishPlaytimeMinutes > entry.startPlaytimeMinutes;
}

/** Average *active* hours from Playing to Done/Replay across `entries` (issue #565) - the
 * companion figure to averageDaysToBeat's calendar time, now that PlayLog actually has playtime
 * data to compute it from (issue #548/#550; averageDaysToBeat's own doc comment used to say this
 * wasn't possible). Counts only entries with real playtime data (see hasRealPlaytime) - a much
 * smaller set than averageDaysToBeat's, in general, since it additionally requires playtime
 * tracking to have been on and the game Steam-matched for that whole playthrough. Null when nothing
 * qualifies, same "not enough data yet" handling as averageDaysToBeat. */
export function summarizeActiveHoursToBeat(entries: FinishedPlayLogEntry[]): {
  averageHoursToBeat: number | null;
  hoursTrackedEntryCount: number;
} {
  const real = entries.filter(hasRealPlaytime);
  if (real.length === 0) return { averageHoursToBeat: null, hoursTrackedEntryCount: 0 };

  const totalHours = real.reduce((sum, e) => sum + (e.finishPlaytimeMinutes - e.startPlaytimeMinutes) / 60, 0);
  const averageHoursToBeat = Math.round((totalHours / real.length) * 10) / 10;
  return { averageHoursToBeat, hoursTrackedEntryCount: real.length };
}

/** Structural subset of a backlog `Game` row this needs - narrow like `NeglectCheckInput` itself,
 * so a caller can pass a lean Prisma `select` rather than a full serialized Game. */
export interface BacklogInsightGameRow {
  id: string;
  title: string;
  coverImageUrl: string | null;
  status: GameStatus;
  createdAt: Date;
  updatedAt: Date;
  votes: { createdAt: Date }[];
}

/** Whichever of createdAt/updatedAt/latest-vote is most recent, in epoch ms - the same "last
 * touched" instant `isNeglectedBacklogGame` compares against its threshold, just surfaced as a
 * value here instead of a boolean. */
function lastActivityMs(game: BacklogInsightGameRow): number {
  let latest = Math.max(game.createdAt.getTime(), game.updatedAt.getTime());
  for (const vote of game.votes) latest = Math.max(latest, vote.createdAt.getTime());
  return latest;
}

/** The backlog game that's sat the longest with no activity, among `games` that currently read as
 * neglected per `isNeglectedBacklogGame` - see MostNeglectedGame's doc for why this filters to
 * neglected candidates first rather than just picking the least-recently-touched game outright
 * (an empty/all-fresh backlog should report "nothing neglected," not the newest game by default). */
export function pickMostNeglectedGame(games: BacklogInsightGameRow[], now: number = Date.now()): MostNeglectedGame | null {
  const neglected = games.filter((g) =>
    isNeglectedBacklogGame(
      { status: g.status, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString(), votes: g.votes.map((v) => ({ createdAt: v.createdAt.toISOString() })) },
      now,
    ),
  );
  if (neglected.length === 0) return null;

  const most = neglected.reduce((oldest, g) => (lastActivityMs(g) < lastActivityMs(oldest) ? g : oldest));
  const lastActivityAtMs = lastActivityMs(most);
  return {
    id: most.id,
    title: most.title,
    coverImageUrl: most.coverImageUrl,
    lastActivityAt: new Date(lastActivityAtMs).toISOString(),
    daysSinceActivity: Math.floor((now - lastActivityAtMs) / (1000 * 60 * 60 * 24)),
  };
}

// Day-based edges, roughly 3/6/12 months - see BacklogAgeBucket's doc for why this is plain day
// math rather than isNeglectedBacklogGame's calendar-month arithmetic. The first edge (90) is the
// one meant to echo NEGLECTED_BACKLOG_MONTHS; kept as a literal (not imported) since that constant
// is denominated in months, not days, and the two aren't meant to be pixel-identical thresholds.
const AGE_BUCKET_DAY_EDGES = [90, 180, 365];
const AGE_BUCKET_LABELS = ['Under 90 days', '90-180 days', '180-365 days', '365+ days'];

/** Buckets `games` (a live backlog) by days since `createdAt` - see BacklogAgeBucket's doc for the
 * exact boundaries/labels. Always returns all four buckets in order, zero-count ones included, so
 * the distribution's shape is stable to render regardless of what's actually in the backlog. */
export function bucketBacklogAge(games: { createdAt: Date }[], now: number = Date.now()): BacklogAgeBucket[] {
  const counts = new Array<number>(AGE_BUCKET_LABELS.length).fill(0);
  for (const g of games) {
    const days = (now - g.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const edgeIndex = AGE_BUCKET_DAY_EDGES.findIndex((edge) => days < edge);
    counts[edgeIndex === -1 ? AGE_BUCKET_DAY_EDGES.length : edgeIndex] += 1;
  }
  return AGE_BUCKET_LABELS.map((label, i) => ({ label, count: counts[i] }));
}
