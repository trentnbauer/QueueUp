import { prisma } from '../db/client.js';
import type { GameStatus, PlayniteCompletionSuggestionDto } from '@queueup/shared';

// Same excluded-status set findDetectedSteamCompletions' own candidate query uses
// (steamCompletionDetection.ts) - a game already Done/Dropped/Replay/Won't Play has already had a
// call made on it, so a completion signal isn't new information worth surfacing either way.
const COMPLETION_INELIGIBLE_STATUSES: GameStatus[] = ['done', 'dropped', 'replay', 'wont_play'];

/** Whether a game in the given status is still worth suggesting Done for (issue #577) - pulled out
 * as a pure predicate so it's unit-testable without a DB, same "extract the decision logic"
 * precedent as computePlaytimeIncreases/completedAtOrNull elsewhere in this codebase. */
export function isCompletionSuggestionEligible(status: GameStatus): boolean {
  return !COMPLETION_INELIGIBLE_STATUSES.includes(status);
}

/** Records a Playnite-reported Completed status as a reviewable suggestion (issue #577) - the
 * Playnite-sourced counterpart to steamCompletionDetection.ts's findDetectedSteamCompletions, but
 * write-once-at-import rather than scan-on-demand: Playnite pushes this fact once, per import
 * entry (see runPlayniteImportLoop in routes/apiV1.ts), and there's no achievement-percentage API
 * to re-poll the way Steam's version has. No-ops for a game already past the point a completion
 * suggestion is useful (see isCompletionSuggestionEligible) - never overwrites/auto-marks Done;
 * see getPendingPlayniteCompletionSuggestions/dismissPlayniteCompletionSuggestion below for the
 * actual review step. Upsert (not insert-only) so a repeat "still Completed" sync from a later
 * Playnite launch doesn't error on the existing row. */
export async function recordPlayniteCompletionSuggestion(userId: string, gameId: string, status: GameStatus): Promise<void> {
  if (!isCompletionSuggestionEligible(status)) return;
  await prisma.playniteCompletionSuggestion.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId },
    update: {},
  });
}

/** Pending Playnite completion suggestions for a user (issue #577), newest first - the read side
 * of the review flow GET /api/games/playnite-completion-suggestions serves. Filters out anything
 * whose game has since left the review-eligible set (marked Done some other way, Dropped, Replay,
 * Won't Play) without needing a separate cleanup job to keep the suggestion row in sync - the row
 * itself is only ever cleared by an explicit dismiss (see dismissPlayniteCompletionSuggestion), or
 * implicitly by the game being deleted (onDelete: Cascade). */
export async function getPendingPlayniteCompletionSuggestions(userId: string): Promise<PlayniteCompletionSuggestionDto[]> {
  const rows = await prisma.playniteCompletionSuggestion.findMany({
    where: { userId, game: { status: { notIn: COMPLETION_INELIGIBLE_STATUSES } } },
    include: { game: { select: { title: true, coverImageUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.gameId,
    title: row.game.title,
    coverImageUrl: row.game.coverImageUrl,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Declines/dismisses one pending suggestion (issue #577) - deletes the row outright, same
 * approve-or-decline-deletes-the-row pattern as GameSuggestion. Scoped to userId in the `where`
 * itself rather than a separate ownership check first, same shape as
 * deletePendingLibraryImport(ByTitle) in playniteImport.ts - a no-op (not an error) if the row is
 * already gone or was never this user's. */
export async function dismissPlayniteCompletionSuggestion(userId: string, gameId: string): Promise<void> {
  await prisma.playniteCompletionSuggestion.deleteMany({ where: { userId, gameId } });
}
