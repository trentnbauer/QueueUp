import { prisma } from '../db/client.js';
import { getPlayModes } from '../services/igdbClient.js';
import { redis } from '../services/redisClient.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

export const PLAY_MODES_BACKFILL_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** IGDB ids per run - one request covers up to 500. */
const BATCH_SIZE = 400;
/** A game IGDB lists no modes for is left alone for this long before it's asked about again. */
const CHECKED_TTL_SECONDS = 30 * 24 * 60 * 60;
const checkedKey = (igdbId: number) => `igdb:play-modes-checked:${igdbId}`;

/** Fills in Game.singlePlayerOnly for games added before it was stored, so the "Single player" flag
 * shows on every card. One IGDB request per run; games IGDB lists no modes for are skipped for a month. */
export async function backfillPlayModes(): Promise<void> {
  // Paged by IGDB id, so ids already checked this month can't hide the ones after them.
  const ids: number[] = [];
  let after = 0;
  for (let page = 0; page < 20 && ids.length < BATCH_SIZE; page++) {
    const rows = await prisma.game.findMany({
      where: { singlePlayerOnly: null, igdbId: { gt: after }, archivedAt: null },
      select: { igdbId: true },
      distinct: ['igdbId'],
      orderBy: { igdbId: 'asc' },
      take: BATCH_SIZE * 2,
    });
    if (rows.length === 0) break;
    for (const { igdbId } of rows) {
      after = igdbId;
      if (ids.length < BATCH_SIZE && !(await redis.exists(checkedKey(igdbId)))) ids.push(igdbId);
    }
  }
  if (ids.length === 0) return;

  let modes;
  try {
    modes = await getPlayModes(ids);
  } catch {
    return; // IGDB unreachable or rate limited - tried again next run.
  }
  let filled = 0;
  for (const igdbId of ids) {
    const m = modes.get(igdbId);
    if (m && m.singlePlayerOnly !== null) {
      const { count } = await prisma.game.updateMany({ where: { igdbId, singlePlayerOnly: null }, data: { singlePlayerOnly: m.singlePlayerOnly } });
      filled += count;
    } else {
      await redis.set(checkedKey(igdbId), '1', 'EX', CHECKED_TTL_SECONDS);
    }
  }
  if (filled > 0) console.info(`[play-modes] filled in play modes for ${filled} game(s)`);
}

export function startPlayModesBackfillJob(): JobHandle {
  return scheduleJob({ name: 'play-modes-backfill', intervalMs: PLAY_MODES_BACKFILL_INTERVAL_MS, run: backfillPlayModes });
}
