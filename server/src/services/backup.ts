import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { AdminBackupInfo, AdminBackupSettings } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { encryptPlaintextConfig } from './configResolver.js';
import { decryptSetting, encryptSetting, isEncrypted } from './settingsCrypto.js';
import { isValidCron, nextCronRun, parseCron } from '../util/cron.js';

/** Logical, version-independent database backups: every table in the `public` schema as JSON, gzipped.
 * Deliberately not pg_dump: that has to match the Postgres server's major version, and the app image
 * doesn't carry a client (the old standalone pg_dump script was removed for this reason). Rows are read with
 * `json_agg` and written back with `json_populate_recordset`, so Postgres does all type conversion
 * (enums, arrays, json, timestamps, decimals) and nothing here needs to know the schema - a new
 * table or column is picked up automatically. */

const FORMAT = 'queueup-backup';
const FORMAT_VERSION = 1;
const FILE_RE = /^queueup-(\d{8}T\d{6}Z)(-[a-z-]+)?\.json\.gz$/;

export const DEFAULT_BACKUP_CRON = '0 3 * * *';
export const DEFAULT_BACKUP_RETENTION = 14;

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  appVersion: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const quote = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export function backupDir(): string {
  return path.resolve(env.BACKUP_DIR ?? path.join(process.cwd(), 'backups'));
}

async function listTables(tx: Pick<typeof prisma, '$queryRawUnsafe'>): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

// ---- settings (stored in app_settings, like the integration keys) --------------------------------

const KEY_ENABLED = 'BACKUP_ENABLED';
const KEY_CRON = 'BACKUP_CRON';
const KEY_RETENTION = 'BACKUP_RETENTION';
const KEY_LAST_RUN = 'BACKUP_LAST_RUN';

export interface BackupSettings {
  enabled: boolean;
  cron: string;
  retention: number;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [KEY_ENABLED, KEY_CRON, KEY_RETENTION] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const cron = get(KEY_CRON);
  const retention = Number(get(KEY_RETENTION));
  return {
    // On by default: only an explicit "false" switches the nightly backup off.
    enabled: get(KEY_ENABLED) !== 'false',
    cron: cron && isValidCron(cron) ? cron : DEFAULT_BACKUP_CRON,
    retention: Number.isInteger(retention) && retention >= 1 ? retention : DEFAULT_BACKUP_RETENTION,
  };
}

export async function updateBackupSettings(patch: Partial<BackupSettings>, updatedBy: string): Promise<BackupSettings> {
  if (patch.cron !== undefined) {
    try {
      parseCron(patch.cron);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Invalid cron schedule');
    }
  }
  if (patch.retention !== undefined && (!Number.isInteger(patch.retention) || patch.retention < 1 || patch.retention > 365)) {
    throw new HttpError(400, 'Keep between 1 and 365 backups');
  }
  const set = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value, updatedBy }, update: { value, updatedBy } });
  if (patch.enabled !== undefined) await set(KEY_ENABLED, String(patch.enabled));
  if (patch.cron !== undefined) await set(KEY_CRON, patch.cron.trim().replace(/\s+/g, ' '));
  if (patch.retention !== undefined) await set(KEY_RETENTION, String(patch.retention));
  return getBackupSettings();
}

async function recordLastRun(result: { at: string; ok: boolean; message: string }): Promise<void> {
  const value = JSON.stringify(result);
  await prisma.appSetting.upsert({
    where: { key: KEY_LAST_RUN },
    create: { key: KEY_LAST_RUN, value, updatedBy: null },
    update: { value },
  });
}

export async function getAdminBackupSettings(): Promise<AdminBackupSettings> {
  const s = await getBackupSettings();
  const lastRaw = (await prisma.appSetting.findUnique({ where: { key: KEY_LAST_RUN } }))?.value;
  let lastRun: AdminBackupSettings['lastRun'] = null;
  try {
    lastRun = lastRaw ? JSON.parse(lastRaw) : null;
  } catch {
    lastRun = null;
  }
  const next = s.enabled ? nextCronRun(parseCron(s.cron), new Date()) : null;
  return {
    ...s,
    nextRunAt: next ? next.toISOString() : null,
    directory: backupDir(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lastRun,
  };
}

// ---- files ----------------------------------------------------------------------------------------

export function isBackupName(name: string): boolean {
  return FILE_RE.test(name);
}

export function assertName(name: string): string {
  if (typeof name !== 'string' || !isBackupName(name)) throw new HttpError(400, 'Not a QueueUp backup file name');
  // Belt and braces on top of the name check: the resolved path must stay inside the backup folder.
  const dir = path.resolve(backupDir());
  const file = path.resolve(dir, name);
  if (!file.startsWith(dir + path.sep)) throw new HttpError(400, 'Not a QueueUp backup file name');
  return file;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export async function listBackups(): Promise<AdminBackupInfo[]> {
  let names: string[];
  try {
    names = await fs.readdir(backupDir());
  } catch {
    return [];
  }
  const out: AdminBackupInfo[] = [];
  for (const name of names.filter(isBackupName)) {
    const stat = await fs.stat(path.join(backupDir(), name)).catch(() => null);
    if (!stat) continue;
    out.push({
      name,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      kind: name.includes('-pre-restore') ? 'pre-restore' : name.includes('-pre-schema-push') ? 'pre-schema-push' : name.includes('-manual') ? 'manual' : 'nightly',
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackupFile(name: string): Promise<Buffer> {
  const file = assertName(name);
  try {
    return await fs.readFile(file);
  } catch {
    throw new HttpError(404, 'Backup not found');
  }
}

export async function deleteBackup(name: string): Promise<void> {
  const file = assertName(name);
  await fs.rm(file, { force: true });
}

/** Keeps the newest `keep` automatic/manual backups. Safety copies (taken before a restore or a
 * destructive schema push) are kept separately (newest 5), so a busy night of restores can't push
 * real backups out. */
export async function rotateBackups(keep: number): Promise<void> {
  const all = await listBackups();
  const isSafety = (b: { kind: string }) => b.kind === 'pre-restore' || b.kind === 'pre-schema-push';
  const regular = all.filter((b) => !isSafety(b));
  const safety = all.filter(isSafety);
  for (const old of [...regular.slice(keep), ...safety.slice(5)]) await deleteBackup(old.name);
}

// ---- create ---------------------------------------------------------------------------------------

export type BackupKind = 'nightly' | 'manual' | 'pre-restore' | 'pre-schema-push';

export async function createBackup(kind: BackupKind): Promise<AdminBackupInfo> {
  // One transaction at REPEATABLE READ so every table is read from the same snapshot.
  const tables = await prisma.$transaction(
    async (tx) => {
      const result: BackupFile['tables'] = {};
      for (const table of await listTables(tx)) {
        const rows = await tx.$queryRawUnsafe<{ data: Record<string, unknown>[] }[]>(
          `SELECT COALESCE(json_agg(t), '[]'::json) AS data FROM ${quote(table)} t`,
        );
        result[table] = rows[0]?.data ?? [];
      }
      return result;
    },
    { isolationLevel: 'RepeatableRead', timeout: 10 * 60_000, maxWait: 30_000 },
  );

  const payload: BackupFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: process.env.APP_VERSION ?? 'dev',
    tables,
  };
  const gz = await gzip(Buffer.from(JSON.stringify(payload)));

  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const name = `queueup-${stamp()}${kind === 'nightly' ? '' : `-${kind}`}.json.gz`;
  const tmp = path.join(dir, `.tmp-${name}`);
  // Written to a dotfile first and renamed on success, so a partial write is never listed as a backup.
  await fs.writeFile(tmp, gz);
  await fs.rename(tmp, path.join(dir, name));
  const stat = await fs.stat(path.join(dir, name));
  return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), kind };
}

/** What the nightly job (and the Back up now button's sibling) runs: backup, rotate, record. */
export async function runScheduledBackup(kind: 'nightly' | 'manual'): Promise<AdminBackupInfo> {
  try {
    const info = await createBackup(kind);
    await rotateBackups((await getBackupSettings()).retention);
    await recordLastRun({ at: new Date().toISOString(), ok: true, message: `Wrote ${info.name}` });
    return info;
  } catch (err) {
    await recordLastRun({ at: new Date().toISOString(), ok: false, message: err instanceof Error ? err.message : 'Backup failed' }).catch(() => undefined);
    throw err;
  }
}

// ---- restore --------------------------------------------------------------------------------------

export async function parseBackup(gz: Buffer): Promise<BackupFile> {
  let parsed: unknown;
  try {
    // Capped: a small gzip can expand to many gigabytes (a gzip bomb), and V8 can't JSON.parse a
    // string past ~512 MiB anyway, so anything larger isn't a backup this app wrote.
    parsed = JSON.parse((await gunzip(gz, { maxOutputLength: MAX_UNCOMPRESSED_BYTES })).toString('utf8'));
  } catch {
    throw new HttpError(400, 'That file is not a valid QueueUp backup (could not read it).');
  }
  const f = parsed as Partial<BackupFile>;
  if (f?.format !== FORMAT || typeof f.tables !== 'object' || f.tables === null) {
    throw new HttpError(400, 'That file is not a QueueUp backup.');
  }
  if (typeof f.version !== 'number' || f.version > FORMAT_VERSION) {
    throw new HttpError(400, 'That backup was made by a newer version of QueueUp. Update this server first.');
  }
  return f as BackupFile;
}

export interface RestoreOptions {
  /** The SESSION_SECRET of the server the backup came from, when it differs from this one's. */
  sessionKey?: string;
  /** Leave out the encrypted values this server can't read, and restore everything else. */
  skipEncrypted?: boolean;
}

/** Thrown when the backup holds encrypted keys this server's SESSION_SECRET can't read. The client
 * tells the cases apart by `code`, then asks for the old session key (or skips those values). */
export class SessionKeyError extends HttpError {
  constructor(
    statusCode: number,
    message: string,
    readonly code: 'session_key_required' | 'session_key_wrong',
    readonly encryptedCount: number,
  ) {
    super(statusCode, message);
  }
}

const SETTINGS_TABLE = 'app_settings';

/** Makes the backup's encrypted settings (see settingsCrypto.ts) readable on this server: values
 * encrypted under another SESSION_SECRET are re-encrypted with this one using `sessionKey`, or
 * dropped with `skipEncrypted`. Returns how many were dropped. Mutates `backup`. */
export function prepareEncryptedSettings(backup: BackupFile, secret: string, opts: RestoreOptions): number {
  const rows = backup.tables[SETTINGS_TABLE];
  if (!Array.isArray(rows)) return 0;
  const unreadable = rows.filter(
    (r) => typeof r.value === 'string' && isEncrypted(r.value) && decryptSetting(r.value, secret) === null,
  );
  if (unreadable.length === 0) return 0;
  const n = unreadable.length;
  const what = `${n} encrypted key${n === 1 ? '' : 's'}`;

  if (opts.sessionKey) {
    const plain = unreadable.map((r) => decryptSetting(r.value as string, opts.sessionKey!));
    if (plain.some((p) => p === null)) {
      throw new SessionKeyError(422, `That session key doesn't unlock the ${what} in this backup.`, 'session_key_wrong', n);
    }
    unreadable.forEach((r, i) => (r.value = encryptSetting(plain[i]!, secret)));
    return 0;
  }
  if (opts.skipEncrypted) {
    backup.tables[SETTINGS_TABLE] = rows.filter((r) => !unreadable.includes(r));
    return n;
  }
  throw new SessionKeyError(
    409,
    `This backup has ${what} made with a different session key.`,
    'session_key_required',
    n,
  );
}

export interface RestoreResult {
  tables: number;
  rows: number;
  /** Encrypted keys left out because no working session key was given. */
  skippedEncrypted: number;
  skippedTables: string[];
  safetyBackup: string;
}

/** Replaces the whole database with the backup's contents. Takes a safety backup first, then in one
 * transaction truncates every table and reloads it. Foreign keys are suspended for the load with
 * `session_replication_role = replica`, which needs a superuser (the Postgres user the bundled
 * compose file creates is one). Columns missing from an older backup take their defaults; tables or
 * columns the current schema no longer has are skipped. Any failure rolls everything back. */
export async function restoreBackup(gz: Buffer, opts: RestoreOptions = {}): Promise<RestoreResult> {
  const backup = await parseBackup(gz);
  // Before the safety backup and the transaction, so a missing or wrong key changes nothing.
  const skippedEncrypted = prepareEncryptedSettings(backup, env.SESSION_SECRET, opts);
  const safety = await createBackup('pre-restore');

  let rows = 0;
  const skippedTables: string[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        const current = await listTables(tx);
        if (current.length > 0) {
          await tx.$executeRawUnsafe(`TRUNCATE ${current.map(quote).join(', ')} RESTART IDENTITY CASCADE`);
        }
        for (const [table, data] of Object.entries(backup.tables)) {
          if (!current.includes(table)) {
            skippedTables.push(table);
            continue;
          }
          if (!Array.isArray(data) || data.length === 0) continue;
          const cols = (
            await tx.$queryRawUnsafe<{ column_name: string }[]>(
              `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
              table,
            )
          ).map((c) => c.column_name);
          const backupCols = new Set(data.flatMap((r) => Object.keys(r)));
          const use = cols.filter((c) => backupCols.has(c));
          if (use.length === 0) continue;
          const list = use.map(quote).join(', ');
          await tx.$executeRawUnsafe(
            `INSERT INTO ${quote(table)} (${list}) SELECT ${list} FROM json_populate_recordset(null::${quote(table)}, $1::json)`,
            JSON.stringify(data),
          );
          rows += data.length;
        }
      },
      { timeout: 30 * 60_000, maxWait: 30_000 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/session_replication_role|permission denied/i.test(msg)) {
      throw new HttpError(500, 'Restore needs a Postgres superuser (it suspends foreign keys while loading). Nothing was changed.');
    }
    throw new HttpError(500, `Restore failed and was rolled back; nothing was changed. ${msg}`.slice(0, 400));
  }
  // A backup from before settings encryption carries plain-text keys; encrypt them straight away.
  await encryptPlaintextConfig().catch(() => undefined);
  return { tables: Object.keys(backup.tables).length - skippedTables.length, rows, skippedEncrypted, skippedTables, safetyBackup: safety.name };
}
