import { runWeeklyRecaps } from '../services/weeklyRecap.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Checked once a day; a room only gets a new recap when its last one is about a week old (see
// runWeeklyRecaps), so this is at most one AI call per room per week.
export const WEEKLY_RECAP_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Registers the AI weekly room recap (#830) on its own schedule - see jobs/scheduler.ts for why this
 * is a plain in-process interval. Same single-process reasoning as the other scheduled jobs. */
export function startWeeklyRecapJob(): JobHandle {
  return scheduleJob({
    name: 'weekly-room-recap',
    intervalMs: WEEKLY_RECAP_CHECK_INTERVAL_MS,
    run: async () => {
      const { created, skipped } = await runWeeklyRecaps();
      if (created || skipped) console.info(`[jobs] weekly-room-recap: ${created} written, ${skipped} skipped`);
    },
  });
}
