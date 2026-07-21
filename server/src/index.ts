import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/client.js';
import { ensureDbConstraints } from './db/ensureConstraints.js';
import { redis } from './services/redisClient.js';
import { startPriceAlertJob } from './jobs/priceAlertJob.js';

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
