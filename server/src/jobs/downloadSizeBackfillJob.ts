import { prisma } from '../db/client.js';
import { mapWithConcurrency } from '../services/priceService.js';
import { redis } from '../services/redisClient.js';
import { fetchSteamStorageMb } from '../services/steamStorage.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

export const DOWNLOAD_SIZE_BACKFILL_INTERVAL_MS = 3 * 60 * 60 * 1000;
/** Steam store lookups per run - Steam's store API allows roughly 200 every 5 minutes, so a big
 * library fills in over a few runs. */
const BATCH_SIZE = 100;
const MAX_CONCURRENCY = 2;
/** A game whose store page lists no size is left alone for this long before it's asked about again. */
const CHECKED_TTL_SECONDS = 30 * 24 * 60 * 60;
// v2: while Steam's requirements-only answer came back empty for every game, each app was marked "no size" for a
// month. A new key drops those marks, so they are all asked about again now that the lookup works.
const checkedKey = (appId: number) => `steam:storage-checked:v2:${appId}`;

/** Fills in the install size (#800) for Steam-matched games from their store page's PC
 * requirements. One lookup per Steam app; apps that list no size are skipped for a month. */
export async function backfillDownloadSizes(): Promise<void> {
  // Paged by Steam app id, so apps already checked this month can't hide the ones after them.
  const ids: number[] = [];
  let after = 0;
  for (let page = 0; page < 20 && ids.length < BATCH_SIZE; page++) {
    const rows = await prisma.game.findMany({
      where: { downloadSizeMb: null, steamAppid: { gt: after }, archivedAt: null },
      select: { steamAppid: true },
      distinct: ['steamAppid'],
      orderBy: { steamAppid: 'asc' },
      take: BATCH_SIZE * 4,
    });
    if (rows.length === 0) break;
    for (const { steamAppid } of rows) {
      if (steamAppid === null) continue;
      after = steamAppid;
      if (ids.length < BATCH_SIZE && !(await redis.exists(checkedKey(steamAppid)))) ids.push(steamAppid);
    }
  }
  if (ids.length === 0) return;

  let filled = 0;
  await mapWithConcurrency(ids, MAX_CONCURRENCY, async (appId) => {
    try {
      const mb = await fetchSteamStorageMb(appId);
      if (mb !== null) {
        const { count } = await prisma.game.updateMany({ where: { steamAppid: appId, downloadSizeMb: null }, data: { downloadSizeMb: mb } });
        filled += count;
      } else {
        await redis.set(checkedKey(appId), '1', 'EX', CHECKED_TTL_SECONDS);
      }
    } catch {
      // Steam unreachable or rate limited - this app is simply tried again next run.
    }
  });
  if (filled > 0) console.info(`[download-sizes] filled in the install size for ${filled} game(s)`);
}

export function startDownloadSizeBackfillJob(): JobHandle {
  return scheduleJob({ name: 'download-size-backfill', intervalMs: DOWNLOAD_SIZE_BACKFILL_INTERVAL_MS, run: backfillDownloadSizes });
}
