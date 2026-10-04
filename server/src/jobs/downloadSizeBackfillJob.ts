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
const checkedKey = (appId: number) => `steam:storage-checked:${appId}`;

/** Fills in the install size (#800) for Steam-matched games from their store page's PC
 * requirements. One lookup per Steam app; apps that list no size are skipped for a month. */
export async function backfillDownloadSizes(): Promise<void> {
  const rows = await prisma.game.findMany({
    where: { downloadSizeMb: null, steamAppid: { not: null }, archivedAt: null },
    select: { steamAppid: true },
    distinct: ['steamAppid'],
    take: BATCH_SIZE * 4,
  });
  const ids: number[] = [];
  for (const { steamAppid } of rows) {
    if (ids.length >= BATCH_SIZE) break;
    if (steamAppid !== null && !(await redis.exists(checkedKey(steamAppid)))) ids.push(steamAppid);
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
