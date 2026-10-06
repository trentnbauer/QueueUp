import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AdminBackupInfo } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { backupDir, createBackup, getBackupSettings, rotateBackups } from './backup.js';

/** An automatic backup before a risky upgrade. The project uses a major version bump for breaking
 * changes (see the version step in build-docker-image.yml), so going to a higher major than the last
 * start that ran is "risky". It is taken from the container entrypoint (scripts/preUpgradeBackup.ts)
 * before the schema is pushed, so it holds the data as the old version left it, and is named for the two
 * versions: "RISKY UPGRADE - v1.4.2 to v2.0.0". The app records the version it is running once it has
 * started (recordRunningVersion), which is what the next start compares against. */

const KEY_LAST_VERSION = 'LAST_RUN_VERSION';
const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

const major = (v: string) => {
  const m = VERSION_RE.exec(v);
  return m ? Number(m[1]) : null;
};

/** True when `next` is a higher major version than `previous`. Anything that is not a release version
 * (a dev build, no version recorded yet) is never risky. */
export function isRiskyUpgrade(previous: string | null | undefined, next: string | null | undefined): boolean {
  if (!previous || !next) return false;
  const a = major(previous);
  const b = major(next);
  return a !== null && b !== null && b > a;
}

export const riskyUpgradeBackupName = (from: string, to: string) => `RISKY UPGRADE - ${from} to ${to}.json.gz`;

/** The version the last start recorded, or null on a fresh database. */
async function lastRunVersion(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY_LAST_VERSION } });
  return row?.value ?? null;
}

/** Takes the pre-upgrade backup when the version about to run is a risky step up from the last one.
 * Returns it, or null when nothing was needed (or it was already taken by an earlier try of the same
 * upgrade, which must not be overwritten with data the upgrade has already touched). */
export async function backupBeforeRiskyUpgrade(next = process.env.APP_VERSION): Promise<AdminBackupInfo | null> {
  const previous = await lastRunVersion();
  if (!previous || !next || !isRiskyUpgrade(previous, next)) return null;
  const name = riskyUpgradeBackupName(previous, next);
  const exists = await fs.stat(path.join(backupDir(), name)).then(() => true, () => false);
  if (exists) return null;
  const info = await createBackup('risky-upgrade', name);
  // Housekeeping only: the backup is already written.
  await getBackupSettings()
    .then((settings) => rotateBackups(settings.retention))
    .catch(() => undefined);
  return info;
}

/** Remembers which version is running, once the app has started. */
export async function recordRunningVersion(version = process.env.APP_VERSION): Promise<void> {
  if (!version || !VERSION_RE.test(version)) return;
  await prisma.appSetting.upsert({ where: { key: KEY_LAST_VERSION }, create: { key: KEY_LAST_VERSION, value: version }, update: { value: version } });
}
