import { prisma } from '../db/client.js';
import { getAchievementCounts, getAchievementDetails } from './steamLibrary.js';
import type { SteamAchievementCounts, SteamUnlockedAchievement } from './steamLibrary.js';

/** A not-yet-Done game (Personal Shelf or a room) with a linked Steam app id - the shape both
 * findDetectedSteamCompletions callers need before any Steam-derived fields are added. */
export interface SteamCompletionCandidateGame {
  id: string;
  title: string;
  genre: string | null;
  timeToBeatHours: number | null;
  steamAppid: number | null;
  roomId: string | null;
  coverImageUrl: string | null;
}

export interface DetectedSteamCompletion extends SteamCompletionCandidateGame {
  /** Unix seconds - the most recent Steam achievement unlock on file for this game. */
  lastUnlockedAt: number;
}

/** Given one game's achievement data from Steam, returns the Unix-seconds timestamp of its most
 * recent unlock if every achievement the game defines has been unlocked, or null if the game has
 * no achievements, isn't fully unlocked yet, or Steam has nothing to report at all (see
 * getAchievementCounts's doc comment for why that last case exists). Pulled out as a pure function
 * so "what counts as 100%'d" can be unit tested without a live Steam API call or a DB. */
export function completedAtOrNull(counts: SteamAchievementCounts | null, unlocked: SteamUnlockedAchievement[]): number | null {
  if (!counts || counts.total === 0 || counts.unlocked < counts.total) return null;
  if (unlocked.length === 0) return null; // defensive - counts.unlocked > 0 should imply this
  return Math.max(...unlocked.map((a) => a.unlockTime));
}

export interface FindDetectedSteamCompletionsOptions {
  /** How many candidates to check, most-recently-touched first - each one costs two Steam Web API
   * calls, so this bounds the work one call site can trigger. */
  limit: number;
  /** Restricts candidates to the Personal Shelf (roomId: null). Pass this when the caller applies
   * "Done" through the Personal-Shelf-only bulk-status endpoint (see /api/games/bulk-status and
   * /api/games/sync-steam-completions below) - a room-game candidate would otherwise be suggested
   * but silently fail to update, since that endpoint's `where` excludes anything with a roomId.
   * Omit it (as the Year in Review recap does) when the caller only needs to count/describe
   * completions rather than apply them, since a completion in a shared room is just as real as one
   * on the shelf for that purpose. */
  personalShelfOnly?: boolean;
}

export interface DetectedSteamCompletionsResult {
  /** How many candidates were actually checked against Steam - bounded by `limit`, and typically
   * larger than `completions.length` since most checked games won't be 100%'d. */
  consideredCount: number;
  completions: DetectedSteamCompletion[];
}

/** Not-yet-Done games with a linked Steam app id, checked against the caller's Steam achievement
 * progress for a 100% completion the app doesn't already know about - the app's Done status is
 * opt-in (see the nudge in GameDetailModal.tsx), so relying on it alone undercounts anyone who
 * tracks completion via Steam instead. Shared by the Year in Review recap (which further filters
 * the result to unlocks within its 12-month window, see routes/games.ts) and the "Sync completions
 * from Steam" shelf action (all time, no window filtering - same file). Callers are expected to
 * already know the caller has a usable steamId64 and that STEAM_API_KEY is configured (see
 * resolveSteamId64) before calling this - it doesn't check either itself. */
export async function findDetectedSteamCompletions(
  userId: string,
  steamId64: string,
  apiKey: string,
  options: FindDetectedSteamCompletionsOptions,
): Promise<DetectedSteamCompletionsResult> {
  const { limit, personalShelfOnly = false } = options;

  const candidates = await prisma.game.findMany({
    where: {
      addedBy: userId,
      // Replay is excluded alongside done/dropped - it already represents "beaten before,
      // queued to play again," so a 100%-achievements check finding what's already known
      // (it's been fully cleared at least once) isn't new information worth nudging on.
      status: { notIn: ['done', 'dropped', 'replay'] },
      steamAppid: { not: null },
      ...(personalShelfOnly ? { roomId: null } : {}),
    },
    select: { id: true, title: true, genre: true, timeToBeatHours: true, steamAppid: true, roomId: true, coverImageUrl: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const detected = await Promise.all(
    candidates.map(async (g): Promise<DetectedSteamCompletion | null> => {
      const appId = g.steamAppid!;
      const [counts, unlocked] = await Promise.all([
        getAchievementCounts(steamId64, appId, apiKey),
        getAchievementDetails(steamId64, appId, apiKey),
      ]);
      const lastUnlockedAt = completedAtOrNull(counts, unlocked);
      return lastUnlockedAt === null ? null : { ...g, lastUnlockedAt };
    }),
  );

  const completions = detected.filter((g): g is DetectedSteamCompletion => g !== null);

  // Persisted here too (not just the achievements route), regardless of whether the caller goes
  // on to actually mark any of these Done - a confirmed 100% is a confirmed 100% either way (see
  // the schema comment on steamFullyCompleted), and this is the one code path where a game with
  // no detail-modal views yet would otherwise never pick it up.
  if (completions.length > 0) {
    await prisma.game.updateMany({
      where: { id: { in: completions.map((c) => c.id) }, steamFullyCompleted: false },
      data: { steamFullyCompleted: true },
    });
  }

  return {
    consideredCount: candidates.length,
    completions,
  };
}
