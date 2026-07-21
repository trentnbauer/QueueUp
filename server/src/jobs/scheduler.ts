/** Minimal in-process interval-based job runner - the shared primitive behind every scheduled
 * job that needs the running app's own Prisma/Redis clients (see jobs/priceAlertJob.ts).
 *
 * Deliberately just `setInterval` plus overlap/error guards rather than a cron library: prod
 * (docker-compose.prod.yml) runs exactly one `server` container with no replicas and
 * `restart: unless-stopped`, so there's no multi-instance double-run risk to design around, and
 * "every N hours, forever, while the process is up" doesn't need cron's calendar syntax. The
 * Postgres backup job (#250) is deliberately NOT run through this - it needs `pg_dump` built
 * against the exact Postgres major version in use (see docker/backup-entrypoint.sh for why),
 * which means running from the `postgres:*-alpine` image, not this Node process - so it uses a
 * small standalone shell loop as its scheduler instead. Both are the same shape (interval loop,
 * skip-if-already-running, log-and-continue on failure); this one exists for jobs that need
 * in-process app state, and shells out to nothing.
 */

export interface ScheduledJob {
  /** Used in log lines only - keep it short and stable. */
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export interface JobHandle {
  name: string;
  stop: () => void;
}

export interface ScheduleJobOptions {
  /** Fire once immediately in addition to every `intervalMs` after that. Defaults to true - the
   * whole point of these jobs is to not depend on some other event happening first, so waiting a
   * full interval after every boot before the first run would just reintroduce a smaller version
   * of the gap they exist to close. */
  runImmediately?: boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/** Registers `job` to run every `job.intervalMs`. A run that's still in flight when the next
 * tick fires is skipped (not queued/stacked) rather than allowed to overlap itself - a job that's
 * slow this one time shouldn't compound into two, then three, concurrent runs. A run that throws
 * is logged and otherwise ignored; the timer keeps ticking so the next scheduled attempt still
 * happens rather than the job silently going dark after one bad run. */
export function scheduleJob(job: ScheduledJob, opts: ScheduleJobOptions = {}): JobHandle {
  const { runImmediately = true, logger = console } = opts;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      logger.warn(`[jobs] ${job.name}: previous run still in progress, skipping this tick`);
      return;
    }
    running = true;
    try {
      await job.run();
    } catch (err) {
      logger.error(`[jobs] ${job.name}: run failed`, err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), job.intervalMs);
  // Don't let this timer alone keep the process alive (matters for graceful shutdown/tests) -
  // the server already has its own shutdown-triggering signal handlers (see index.ts).
  timer.unref();

  if (runImmediately) void tick();

  return {
    name: job.name,
    stop: () => clearInterval(timer),
  };
}
