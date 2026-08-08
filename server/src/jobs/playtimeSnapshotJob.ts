import { prisma } from '../db/client.js';
import { snapshotAllPlaytimes, dedupeByOwnerAndSteamApp, type PlaytimeIncrease } from '../services/playtimeTracking.js';
import { notifyPlaytimeMarkPlaying } from '../services/notifications.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Steam's own playtime figures only update every so often on their end too - polling much more
// often than this would just re-fetch the same numbers. Matches priceAlertJob.ts's cadence for
// the same "no reason to be more eager than the upstream data changes" reasoning.
export const PLAYTIME_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Turns raw playtime increases into "Mark Playing" notifications (issue #554) - one query
 * regardless of how many users/games increased this run, same batching shape as the rest of #548.
 * Only a Personal Shelf game (roomId null - a room game has no single unambiguous player, see
 * suggestsPlaying in @queueup/shared) not already Playing/Done/Dropped/Won't Play qualifies. Deduped by
 * (owner, Steam app) before notifying (issue #562 bug fix) so two Game rows that happen to be the
 * same underlying Steam game don't each get their own notification; notifyPlaytimeMarkPlaying
 * itself separately skips creating a duplicate if a given game already has one unread. */
async function notifyPlayingCandidates(increases: PlaytimeIncrease[]): Promise<void> {
  if (increases.length === 0) return;

  const games = await prisma.game.findMany({
    where: {
      roomId: null,
      status: { notIn: ['playing', 'done', 'dropped', 'wont_play'] },
      OR: increases.map((inc) => ({ addedBy: inc.userId, steamAppid: inc.steamAppId })),
    },
    select: { id: true, title: true, addedBy: true, steamAppid: true },
  });

  await Promise.all(dedupeByOwnerAndSteamApp(games).map((g) => notifyPlaytimeMarkPlaying(g.addedBy, g.id, g.title)));
}

/** Registers the playtime-snapshot refresh (issue #548) to run on its own schedule, independent
 * of page views - same shape as startPriceAlertJob. */
export function startPlaytimeSnapshotJob(): JobHandle {
  return scheduleJob({
    name: 'playtime-snapshot',
    intervalMs: PLAYTIME_SNAPSHOT_INTERVAL_MS,
    run: async () => {
      const increases = await snapshotAllPlaytimes();
      await notifyPlayingCandidates(increases);
    },
  });
}
