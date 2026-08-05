import { checkReleaseWatches } from '../services/releaseWatch.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Once a day - resolves issue #510's own "main open question" (polling cadence vs. IGDB rate
// limits): checkReleaseWatches dedupes to one IGDB call per unique collection/base game across
// every user per run (never per user, per beaten game), and mapWithConcurrency caps how many of
// those run at once (see RELEASE_WATCH_MAX_CONCURRENCY in releaseWatch.ts) - a daily cadence at
// that dedupe/concurrency level stays comfortably under IGDB's rate limits even as the user base
// grows, and a sequel/DLC release isn't time-sensitive enough to need checking more often anyway.
export const RELEASE_WATCH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Registers the release-watch check to run on its own schedule (#510) - see jobs/scheduler.ts for
 * why this is a plain in-process interval rather than a cron container. Same single-process
 * reasoning as the other scheduled jobs: prod (docker-compose.prod.yml) runs exactly one
 * non-replicated server. */
export function startReleaseWatchJob(): JobHandle {
  return scheduleJob({
    name: 'release-watch-check',
    intervalMs: RELEASE_WATCH_CHECK_INTERVAL_MS,
    run: checkReleaseWatches,
  });
}
