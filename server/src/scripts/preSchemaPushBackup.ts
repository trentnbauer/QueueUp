import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Runs before bootstrap.ts (from docker/server-entrypoint.sh), so it loads the repo-root .env itself;
// in Docker the real env vars are already set and dotenv no-ops when there's no file.
config({ path: path.resolve(__dirname, '../../../.env') });

const { prisma } = await import('../db/client.js');
const { createBackup, rotateBackups, getBackupSettings } = await import('../services/backup.js');

/** Takes a safety backup right before a destructive `prisma db push --accept-data-loss`. Exits
 * non-zero if the backup can't be written, which stops the entrypoint from going ahead with the
 * push - no backup, no destructive change. */
try {
  const info = await createBackup('pre-schema-push');
  await rotateBackups((await getBackupSettings()).retention).catch(() => undefined);
  console.log(`[schema-push] Backed up the database to ${info.name} before applying a destructive schema change.`);
  await prisma.$disconnect();
} catch (err) {
  console.error('[schema-push] Could not back up the database; refusing the destructive schema change.', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
}
