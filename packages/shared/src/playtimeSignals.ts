import type { Game, GameStatus } from './types.js';
import { monthsAgoUtc, NEGLECTED_BACKLOG_MONTHS } from './backlogHeuristics.js';

/** Personal Shelf, not already Playing/Done/Dropped/Won't Play, and `minutes` (whatever playtime
 * figure the caller is judging against) is positive - the "mark as Playing?" signal (issue #548),
 * factored out of a specific game so both the checkpoint-relative individual nudge (suggestsPlaying
 * below) and the batch review prompt's raw-total-based check (PlaytimeReviewModal) share one
 * definition of "does this amount of playtime mean someone should mark this Playing," while each
 * supplies its own idea of which minutes figure is the right one to ask about. Won't Play is
 * excluded for the same reason Done/Dropped are - the user already made a call on this game, a
 * playtime uptick shouldn't second-guess it. */
export function suggestsPlayingFromMinutes(status: GameStatus, roomId: string | null, minutes: number): boolean {
  return roomId === null && minutes > 0 && status !== 'playing' && status !== 'done' && status !== 'dropped' && status !== 'wont_play';
}

/** Currently Playing, with time-to-beat data, and `minutes` worth of hours reaches it - the "mark
 * as Beaten?" signal (issue #548), same factoring-out reasoning as suggestsPlayingFromMinutes. */
export function suggestsBeatenFromMinutes(status: GameStatus, timeToBeatHours: number | null, minutes: number): boolean {
  if (status !== 'playing' || timeToBeatHours == null) return false;
  return minutes / 60 >= timeToBeatHours;
}

/** Personal Shelf, playtime ticked up since the last checkpoint, not already Playing/Done/Dropped
 * - the individual per-game "mark as Playing?" nudge (issue #548). A nudge, not an automatic
 * status change (same philosophy as the achievement-based suggestDone in GameDetailModal, issue
 * #227) - shown wherever a caller wants it (GameDetailModal today), not baked into any one
 * component. Checkpoint-relative (resets to 0 whenever a status change closes a checkpoint, or on
 * a game's very first-ever snapshot - see PlaytimeSnapshot.initialMinutes) - the batch review
 * prompt deliberately does NOT use this (see PlaytimeReviewModal), since a checkpoint-relative
 * figure of 0 on a game's first sync would otherwise leave every entry in that prompt inert. */
export function suggestsPlaying(game: Game): boolean {
  return suggestsPlayingFromMinutes(game.status, game.roomId, game.playtimeSinceCheckpointMinutes ?? 0);
}

/** Currently Playing, and hours played since the last checkpoint have reached this game's own
 * time-to-beat - the individual per-game "mark as Beaten?" nudge (issue #548), same nudge-not-auto
 * philosophy as suggestsPlaying above. Doesn't know about (and shouldn't skip for) the achievement-
 * based suggestDone signal GameDetailModal also has - a caller juggling both nudges decides how to
 * de-duplicate them itself, since that's a display concern, not a fact about the game. */
export function suggestsBeatenByPlaytime(game: Game): boolean {
  return suggestsBeatenFromMinutes(game.status, game.timeToBeatHours, game.playtimeSinceCheckpointMinutes ?? 0);
}

/** A game marked Playing, with recorded playtime proving it was genuinely started (not just
 * flipped to this status with 0 hours on it), whose status hasn't budged in
 * NEGLECTED_BACKLOG_MONTHS+ (issue #564) - the Playing-side companion to isNeglectedBacklogGame
 * (backlogHeuristics.ts), which only ever looks at 'backlog' games that were never engaged with at
 * all. Reuses that same threshold/window (monthsAgoUtc) rather than picking its own, so "collecting
 * dust" reads as one consistent policy regardless of which side of it a game falls on. Judged
 * against currentPlaytimeMinutes (the raw, always-increasing total), not the checkpoint-relative
 * figure suggestsPlaying/suggestsBeatenByPlaytime use - this only needs to know "was this ever
 * actually played," not "how much since the last checkpoint," and currentPlaytimeMinutes is null
 * under the exact same conditions (tracking off, no Steam match, never snapshotted) that would
 * make this question unanswerable anyway. */
export function suggestsDroppingStalePlaying(
  game: Pick<Game, 'status' | 'updatedAt' | 'currentPlaytimeMinutes'>,
  now: number = Date.now(),
): boolean {
  if (game.status !== 'playing') return false;
  if (game.currentPlaytimeMinutes === null || game.currentPlaytimeMinutes <= 0) return false;
  return new Date(game.updatedAt).getTime() <= monthsAgoUtc(NEGLECTED_BACKLOG_MONTHS, now);
}

export interface PlaytimeReviewCandidate {
  gameId: string;
  currentMinutes: number;
}

/** Which games belong in the batch "review your played games" prompt (issue #548), given the
 * current Personal Shelf games and a map of previously-shown minutes per game - null meaning "the
 * prompt has never been shown at all" (the frontend hook distinguishes this from "shown, but
 * nothing to say" by whether anything is in localStorage yet, same idea as useChangelog's
 * seen-PR-set). True first sync surfaces every currently-tracked game at once - unlike a
 * changelog's silent baseline for brand-new users, there's no backlog of history to spare someone
 * from here, just "here's what we already know about your played games" the moment there's
 * anything to know. Every later call only surfaces a game whose current minutes rose past what was
 * last shown for it - a game whose hours haven't moved since last reviewed doesn't need reviewing
 * again. Deliberately keyed off currentPlaytimeMinutes (always-increasing), not
 * playtimeSinceCheckpointMinutes (resets whenever a status change or the per-game nudge above
 * closes out a checkpoint) - this prompt needs a figure that keeps climbing across those resets. */
export function computePlaytimeReviewCandidates(
  games: Game[],
  lastShownMinutesByGameId: Record<string, number> | null,
): PlaytimeReviewCandidate[] {
  const tracked = games.filter(
    (g): g is Game & { currentPlaytimeMinutes: number } => g.currentPlaytimeMinutes !== null,
  );
  if (lastShownMinutesByGameId === null) {
    return tracked.map((g) => ({ gameId: g.id, currentMinutes: g.currentPlaytimeMinutes }));
  }
  return tracked
    .filter((g) => (lastShownMinutesByGameId[g.id] ?? 0) < g.currentPlaytimeMinutes)
    .map((g) => ({ gameId: g.id, currentMinutes: g.currentPlaytimeMinutes }));
}
