import { scheduleJob, type JobHandle } from './scheduler.js';
import { getBackupSettings, runScheduledBackup } from '../services/backup.js';
import { cronMatches, parseCron } from '../util/cron.js';

/** Checks once a minute whether the admin-editable cron schedule (see services/backup.ts, default
 * "0 3 * * *" = 03:00 every night, on by default) fires this minute, and runs the backup if so.
 * Settings are re-read each tick, so a schedule change in the admin menu applies immediately with
 * no restart. `lastFiredMinute` stops a slow tick from firing the same minute twice. */
let lastFiredMinute = -1;

export async function backupTick(now: Date = new Date()): Promise<void> {
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute === lastFiredMinute) return;
  const settings = await getBackupSettings();
  if (!settings.enabled) return;
  if (!cronMatches(parseCron(settings.cron), now)) return;
  lastFiredMinute = minute;
  await runScheduledBackup('nightly');
}

export function startBackupJob(): JobHandle {
  return scheduleJob(
    { name: 'database-backup', intervalMs: 60_000, run: () => backupTick() },
    // No run on boot: a backup at every container restart isn't what "nightly" means.
    { runImmediately: false },
  );
}
