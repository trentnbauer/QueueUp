import { prisma } from '../db/client.js';
import { getAchievementCounts, resolveSteamId64, type SteamAchievementCounts } from './steamLibrary.js';

/** Stored Steam achievement counts per (user, game), for the "10/20" on game cards - see the
 * AchievementProgress schema comment. Reading the count live per card would mean a Steam API call
 * per Steam-linked game per page view, so it's saved whenever QueueUp asks Steam anyway. */

export interface AchievementCount {
  unlocked: number;
  total: number;
}

/** Saves one user's count for one title. `null` means no answer worth showing - no achievements,
 * a private profile, or a failed Steam call (getAchievementCounts can't tell these apart). It's
 * stored as 0/0 for a title never checked, so the backfill below doesn't keep re-asking, but never
 * overwrites a count already on file: a Steam hiccup shouldn't wipe a good "10/20". */
export async function recordAchievementProgress(userId: string, igdbId: number, counts: SteamAchievementCounts | null): Promise<void> {
  await prisma.achievementProgress.upsert({
    where: { userId_igdbId: { userId, igdbId } },
    create: { userId, igdbId, unlocked: counts?.unlocked ?? 0, total: counts?.total ?? 0 },
    update: counts ? { unlocked: counts.unlocked, total: counts.total } : {},
  });
}

/** The viewer's counts for these titles, by igdbId - only titles that actually have achievements. */
export async function getAchievementProgressMap(userId: string, igdbIds: number[]): Promise<Map<number, AchievementCount>> {
  if (igdbIds.length === 0) return new Map();
  const rows = await prisma.achievementProgress.findMany({
    where: { userId, igdbId: { in: [...new Set(igdbIds)] }, total: { gt: 0 } },
    select: { igdbId: true, unlocked: true, total: true },
  });
  return new Map(rows.map((r) => [r.igdbId, { unlocked: r.unlocked, total: r.total }]));
}

/** Which of a user's Steam-linked titles to re-check: every title whose playtime just went up
 * (achievements only change when you play), plus up to `backfillLimit` titles never checked yet,
 * so a library fills in over a few runs without a burst of Steam calls. Pure, for testing. */
export function pickTitlesToRefresh(
  titles: { igdbId: number; steamAppid: number }[],
  playedAppIds: Set<number>,
  checkedIgdbIds: Set<number>,
  backfillLimit: number,
): { igdbId: number; steamAppid: number }[] {
  const seen = new Set<number>();
  const unique = titles.filter((t) => !seen.has(t.igdbId) && seen.add(t.igdbId));
  const played = unique.filter((t) => playedAppIds.has(t.steamAppid));
  const unchecked = unique.filter((t) => !playedAppIds.has(t.steamAppid) && !checkedIgdbIds.has(t.igdbId)).slice(0, backfillLimit);
  return [...played, ...unchecked];
}

const REFRESH_CONCURRENCY = 4;

/** Refreshes one user's stored counts (see pickTitlesToRefresh) for the games they can see: their
 * Personal Shelf and the rooms they're in. Called per user by the playtime snapshot job. */
export async function refreshAchievementProgress(
  userId: string,
  steamId64: string,
  apiKey: string,
  playedAppIds: Set<number>,
  backfillLimit: number,
): Promise<number> {
  const games = await prisma.game.findMany({
    where: {
      steamAppid: { not: null },
      OR: [{ addedBy: userId, roomId: null }, { room: { members: { some: { userId } } } }],
    },
    select: { igdbId: true, steamAppid: true },
    orderBy: { updatedAt: 'desc' },
  });
  const titles = games.map((g) => ({ igdbId: g.igdbId, steamAppid: g.steamAppid! }));
  const checked = await prisma.achievementProgress.findMany({
    where: { userId, igdbId: { in: titles.map((t) => t.igdbId) } },
    select: { igdbId: true },
  });
  const todo = pickTitlesToRefresh(titles, playedAppIds, new Set(checked.map((c) => c.igdbId)), backfillLimit);

  for (let i = 0; i < todo.length; i += REFRESH_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + REFRESH_CONCURRENCY).map(async (t) => {
        const counts = await getAchievementCounts(steamId64, t.steamAppid, apiKey);
        await recordAchievementProgress(userId, t.igdbId, counts);
      }),
    );
  }
  return todo.length;
}

/** Titles to backfill per user per run - with the 6-hourly playtime job, a 200-game library with
 * achievements fills in within about two days, at 25 Steam calls per user per run. */
export const ACHIEVEMENT_BACKFILL_PER_RUN = 25;

/** Runs refreshAchievementProgress for every Steam-linked user. One user's failure is logged and
 * skipped, like the rest of the playtime job. */
export async function refreshAllAchievementProgress(apiKey: string, played: { userId: string; steamAppId: number }[]): Promise<void> {
  const users = await prisma.user.findMany({
    where: { OR: [{ oidcSub: { startsWith: 'steam:' } }, { steamId64: { not: null } }] },
    select: { id: true, oidcSub: true, steamId64: true },
  });
  for (const user of users) {
    const steamId64 = resolveSteamId64(user);
    if (!steamId64) continue;
    const playedAppIds = new Set(played.filter((p) => p.userId === user.id).map((p) => p.steamAppId));
    try {
      await refreshAchievementProgress(user.id, steamId64, apiKey, playedAppIds, ACHIEVEMENT_BACKFILL_PER_RUN);
    } catch (err) {
      console.error(`achievement-progress: could not refresh for user ${user.id}`, err);
    }
  }
}
