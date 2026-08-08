import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/client.js';
import { ensureDbConstraints } from './db/ensureConstraints.js';
import { redis } from './services/redisClient.js';
import { startPriceAlertJob } from './jobs/priceAlertJob.js';
import { startPriceRefreshJob } from './jobs/priceRefreshJob.js';
import { startAnniversaryBadgeJob } from './jobs/anniversaryBadgeJob.js';
import { startReleaseWatchJob } from './jobs/releaseWatchJob.js';
import { startPlaytimeSnapshotJob } from './jobs/playtimeSnapshotJob.js';
import { startPlayniteSyncReminderJob } from './jobs/playniteSyncReminderJob.js';

const app = await buildApp();

await ensureDbConstraints(app.log);

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`QueueUp server listening on port ${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Independent of any page view (#255) - see jobs/priceAlertJob.ts. Runs in this one server
// process; docker-compose.prod.yml runs a single non-replicated instance, so there's no
// multi-instance double-run to guard against.
const priceAlertJob = startPriceAlertJob();
// Independent of any page view (#439) - see jobs/priceRefreshJob.ts. Same single-process
// reasoning as priceAlertJob above.
const priceRefreshJob = startPriceRefreshJob();
// Year One badge (#489) - see jobs/anniversaryBadgeJob.ts. Same single-process reasoning as the
// two jobs above; an anniversary isn't tied to any user action, so it needs its own schedule too.
const anniversaryBadgeJob = startAnniversaryBadgeJob();
// Release/DLC watch alerts (#510) - see jobs/releaseWatchJob.ts. Same single-process reasoning as
// the jobs above; a new sequel/DLC entry isn't tied to any user action either.
const releaseWatchJob = startReleaseWatchJob();
// Playtime tracking (#548) - dormant by default (see env.ts), ships in sections across several
// PRs before any user-facing nudge exists yet to consume what it snapshots.
const playtimeSnapshotJob = env.PLAYTIME_TRACKING_ENABLED ? startPlaytimeSnapshotJob() : null;
// Playnite sync staleness reminder (#570) - same single-process reasoning as the jobs above; a
// stale Playnite library isn't tied to any user action either.
const playniteSyncReminderJob = startPlayniteSyncReminderJob();

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string) {
  // A second signal (e.g. an impatient double Ctrl+C, or an orchestrator escalating) shouldn't
  // restart the process from scratch mid-drain.
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Received ${signal}, shutting down gracefully...`);

  // Belt-and-suspenders: if closing hangs for any reason, force-exit rather than leaving the
  // process as an unkillable zombie that `docker stop` has to SIGKILL after its own grace period.
  const forceExitTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out - forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    priceAlertJob.stop();
    priceRefreshJob.stop();
    anniversaryBadgeJob.stop();
    releaseWatchJob.stop();
    playtimeSnapshotJob?.stop();
    playniteSyncReminderJob.stop();
    // Stops accepting new connections, waits for in-flight requests, runs plugins' onClose hooks.
    await app.close();
    await prisma.$disconnect();
    // A plain disconnect (not quit()) - no round trip needed, and none of the in-flight requests
    // we just drained have any more Redis calls left to make by this point.
    redis.disconnect();
    app.log.info('Shutdown complete');
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
