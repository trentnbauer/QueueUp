import { prisma } from '../db/client.js';
import { decryptSetting, encryptSetting, isEncrypted } from './settingsCrypto.js';

/** Integration credentials that can be set via env var OR, as a fallback, via the admin Settings
 * panel (stored in the app_settings table). Kept to a small explicit list rather than accepting
 * arbitrary keys from the client, since these end up in a PATCH request body. */
export const CONFIG_KEYS = [
  'GGDEALS_API_KEY',
  'IGDB_CLIENT_ID',
  'IGDB_CLIENT_SECRET',
  'SCANDEX_API_KEY',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'CLOUDFLARE_TUNNEL_TOKEN',
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export function isConfigKey(value: string): value is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(value);
}

export type ConfigSource = 'env' | 'db' | 'unset';

/** Stored values are encrypted with a key derived from SESSION_SECRET (see settingsCrypto.ts).
 * Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function sessionSecret(): Promise<string> {
  return (await import('../config/env.js')).env.SESSION_SECRET;
}

const warnedUnreadable = new Set<string>();

/** The DB-stored value for a key, decrypted. A value encrypted under a different SESSION_SECRET
 * (e.g. a backup restored onto another server) reads as unset until an admin enters it again. */
async function readStored(key: ConfigKey): Promise<string | undefined> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row?.value) return undefined;
  const value = decryptSetting(row.value, await sessionSecret());
  if (value === null) {
    if (!warnedUnreadable.has(key)) {
      warnedUnreadable.add(key);
      console.warn(`${key} in Administrator settings can't be decrypted (SESSION_SECRET changed?) - enter it again.`);
    }
    return undefined;
  }
  return value || undefined;
}

/** Where a config value currently comes from. Env always wins - the DB row is only consulted
 * when the env var is unset - so this never needs to read the DB when envValue is present. */
export async function getConfigSource(key: ConfigKey, envValue: string | undefined): Promise<ConfigSource> {
  if (envValue) return 'env';
  return (await readStored(key)) ? 'db' : 'unset';
}

/** Resolves the effective value for a config key: the env var if set, otherwise the DB fallback
 * (or undefined if neither is set). Callers pass their already-parsed env value in rather than
 * importing `env` here, keeping this module free of a dependency on the zod-parsed env shape. */
export async function getConfigValue(key: ConfigKey, envValue: string | undefined): Promise<string | undefined> {
  if (envValue) return envValue;
  return readStored(key);
}

/** Sets (or replaces) the DB-stored fallback value for a config key. Callers are responsible for
 * checking the corresponding env var isn't already set before calling this - env vars must always
 * win, so writing here would otherwise be silently ignored at read time anyway. */
export async function setConfigValue(key: ConfigKey, value: string, updatedBy: string): Promise<void> {
  value = encryptSetting(value, await sessionSecret());
  warnedUnreadable.delete(key);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}

/** Removes the DB-stored fallback value for a config key, if any. */
export async function clearConfigValue(key: ConfigKey): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key } });
}

/** Encrypts any config values stored before encryption existed (or loaded from an older backup).
 * Runs at boot and after a restore; values already encrypted are left alone. */
export async function encryptPlaintextConfig(): Promise<number> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...CONFIG_KEYS] } } });
  const plain = rows.filter((r) => r.value && !isEncrypted(r.value));
  if (plain.length === 0) return 0;
  const secret = await sessionSecret();
  for (const row of plain) {
    await prisma.appSetting.update({ where: { key: row.key }, data: { value: encryptSetting(row.value, secret) } });
  }
  return plain.length;
}
