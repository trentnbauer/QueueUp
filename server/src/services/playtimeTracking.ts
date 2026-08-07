import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { getOwnedSteamGames, resolveSteamId64, type OwnedSteamGame } from './steamLibrary.js';

/** A Steam app whose playtime went up since the last snapshot for this user - the raw signal
 * later pieces of issue #548 (the "mark as Playing" nudge, playthrough-duration tracking) will
 * consume. Not emitted for a user/app's first-ever snapshot (nothing to compare against yet), so
 * onboarding a new Steam-linked user doesn't look like every game in their library was just
 * played. */
export interface PlaytimeIncrease {
  userId: string;
  steamAppId: number;
  previousMinutes: number;
  currentMinutes: number;
}

/** Pure comparison step, pulled out of snapshotAllPlaytimes so it's testable without a DB or
 * Steam's API (issue #330 set this precedent - extract the actual decision logic out of the
 * I/O-shaped function around it). `previousByAppId` has no entry for an app never snapshotted
 * before, which is deliberately not treated as an increase - see PlaytimeIncrease's doc comment. */
export function computePlaytimeIncreases(
  userId: string,
  owned: OwnedSteamGame[],
  previousByAppId: Map<number, number>,
): PlaytimeIncrease[] {
  const increases: PlaytimeIncrease[] = [];
  for (const game of owned) {
    const previousMinutes = previousByAppId.get(game.appId);
    if (previousMinutes !== undefined && game.playtimeForeverMinutes > previousMinutes) {
      increases.push({
        userId,
        steamAppId: game.appId,
        previousMinutes,
        currentMinutes: game.playtimeForeverMinutes,
      });
    }
  }
  return increases;
}

/** Refreshes every Steam-linked user's playtime snapshot and reports which apps increased since
 * last time (issue #548). Runs one user at a time rather than in parallel - Steam's Web API has
 * no documented per-key rate limit, but there's no upside to bursting it across every linked user
 * at once, and a slow/failing account here shouldn't affect the others (one user's fetch failure
 * is logged and skipped, same as any other job in this codebase - see priceAlertJob.ts). No-op
 * (returns []) if Steam isn't configured on this server at all. */
export async function snapshotAllPlaytimes(): Promise<PlaytimeIncrease[]> {
  if (!env.STEAM_API_KEY) return [];

  const users = await prisma.user.findMany({
    where: { OR: [{ oidcSub: { startsWith: 'steam:' } }, { steamId64: { not: null } }] },
    select: { id: true, oidcSub: true, steamId64: true },
  });

  const increases: PlaytimeIncrease[] = [];

  for (const user of users) {
    const steamId64 = resolveSteamId64(user);
    if (!steamId64) continue;

    let owned;
    try {
      owned = await getOwnedSteamGames(steamId64, env.STEAM_API_KEY);
    } catch (err) {
      console.error(`playtime-snapshot: could not fetch Steam library for user ${user.id}`, err);
      continue;
    }
    if (owned.length === 0) continue;

    const existing = await prisma.playtimeSnapshot.findMany({
      where: { userId: user.id, steamAppId: { in: owned.map((g) => g.appId) } },
    });
    const previousByAppId = new Map(existing.map((row) => [row.steamAppId, row.playtimeMinutes]));
    increases.push(...computePlaytimeIncreases(user.id, owned, previousByAppId));

    await Promise.all(
      owned.map((game) =>
        prisma.playtimeSnapshot.upsert({
          where: { userId_steamAppId: { userId: user.id, steamAppId: game.appId } },
          create: { userId: user.id, steamAppId: game.appId, playtimeMinutes: game.playtimeForeverMinutes },
          update: { playtimeMinutes: game.playtimeForeverMinutes },
        }),
      ),
    );
  }

  return increases;
}
