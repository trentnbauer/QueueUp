import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Runs before bootstrap.ts (from docker/server-entrypoint.sh), so it loads the repo-root .env itself;
// in Docker the real env vars are already set and dotenv no-ops when there's no file.
config({ path: path.resolve(__dirname, '../../../.env') });

const { prisma } = await import('../db/client.js');
const { backupBeforeRiskyUpgrade } = await import('../services/upgradeBackup.js');

/** Backs up the database before a risky (major version) upgrade. Never fails the start: on a new
 * database there is no settings table yet and nothing to back up, and if the backup cannot be written
 * the reason is logged and the container carries on. */
try {
  const info = await backupBeforeRiskyUpgrade();
  if (info) console.log(`[upgrade-backup] Risky upgrade: backed up the database to "${info.name}" before starting.`);
} catch (err) {
  console.error('[upgrade-backup] Could not take the pre-upgrade backup; starting anyway.', err instanceof Error ? err.message : err);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
