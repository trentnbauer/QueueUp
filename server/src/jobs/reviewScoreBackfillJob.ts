import { prisma } from '../db/client.js';
import { getGameDetail } from '../services/igdbClient.js';
import { mapWithConcurrency } from '../services/priceService.js';
import { redis } from '../services/redisClient.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

export const REVIEW_SCORE_BACKFILL_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** IGDB lookups per run - small, so a big imported library fills in over a few runs instead of
 * spending the IGDB rate limit all at once. */
const BATCH_SIZE = 150;
const MAX_CONCURRENCY = 2;
/** A game IGDB has no score for is left alone for this long before it's asked about again. */
const CHECKED_TTL_SECONDS = 30 * 24 * 60 * 60;
const checkedKey = (igdbId: number) => `igdb:review-score-checked:${igdbId}`;

/** Fills in the IGDB review score for games added before it was stored (or added while IGDB had none
 * yet), so the score shows on every game card. One lookup per distinct IGDB id; games IGDB still has
 * no score for are skipped for a month. */
export async function backfillReviewScores(): Promise<void> {
  const rows = await prisma.game.findMany({
    where: { reviewScore: null, archivedAt: null },
    select: { igdbId: true },
    distinct: ['igdbId'],
    take: BATCH_SIZE * 4,
  });
  const ids: number[] = [];
  for (const { igdbId } of rows) {
    if (ids.length >= BATCH_SIZE) break;
    if (!(await redis.exists(checkedKey(igdbId)))) ids.push(igdbId);
  }
  if (ids.length === 0) return;

  let filled = 0;
  await mapWithConcurrency(ids, MAX_CONCURRENCY, async (igdbId) => {
    try {
      const { reviewScore } = await getGameDetail(igdbId);
      if (reviewScore !== null) {
        const { count } = await prisma.game.updateMany({ where: { igdbId, reviewScore: null }, data: { reviewScore } });
        filled += count;
      } else {
        await redis.set(checkedKey(igdbId), '1', 'EX', CHECKED_TTL_SECONDS);
      }
    } catch {
      // IGDB unreachable or rate limited - this id is simply tried again next run.
    }
  });
  if (filled > 0) console.info(`[review-scores] filled in the IGDB score for ${filled} game(s)`);
}

export function startReviewScoreBackfillJob(): JobHandle {
  return scheduleJob({ name: 'review-score-backfill', intervalMs: REVIEW_SCORE_BACKFILL_INTERVAL_MS, run: backfillReviewScores });
}
