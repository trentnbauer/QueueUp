import { snapshotAllPlaytimes } from '../services/playtimeTracking.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Steam's own playtime figures only update every so often on their end too - polling much more
// often than this would just re-fetch the same numbers. Matches priceAlertJob.ts's cadence for
// the same "no reason to be more eager than the upstream data changes" reasoning.
export const PLAYTIME_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Registers the playtime-snapshot refresh (issue #548) to run on its own schedule, independent
 * of page views - same shape as startPriceAlertJob. Nothing yet consumes the increases this
 * reports; later pieces of #548 (the "mark as Playing" nudge) will. */
export function startPlaytimeSnapshotJob(): JobHandle {
  return scheduleJob({
    name: 'playtime-snapshot',
    intervalMs: PLAYTIME_SNAPSHOT_INTERVAL_MS,
    run: async () => {
      await snapshotAllPlaytimes();
    },
  });
}
