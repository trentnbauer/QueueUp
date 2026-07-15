import { prisma } from '../db/client.js';

/** Integration credentials that can be set via env var OR, as a fallback, via the admin Settings
 * panel (stored in the app_settings table). Kept to a small explicit list rather than accepting
 * arbitrary keys from the client, since these end up in a PATCH request body. */
export const CONFIG_KEYS = ['GGDEALS_API_KEY', 'IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export function isConfigKey(value: string): value is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(value);
}

export type ConfigSource = 'env' | 'db' | 'unset';

/** Where a config value currently comes from. Env always wins - the DB row is only consulted
 * when the env var is unset - so this never needs to read the DB when envValue is present. */
export async function getConfigSource(key: ConfigKey, envValue: string | undefined): Promise<ConfigSource> {
  if (envValue) return 'env';
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ? 'db' : 'unset';
}

/** Resolves the effective value for a config key: the env var if set, otherwise the DB fallback
 * (or undefined if neither is set). Callers pass their already-parsed env value in rather than
 * importing `env` here, keeping this module free of a dependency on the zod-parsed env shape. */
export async function getConfigValue(key: ConfigKey, envValue: string | undefined): Promise<string | undefined> {
  if (envValue) return envValue;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? undefined;
}

/** Sets (or replaces) the DB-stored fallback value for a config key. Callers are responsible for
 * checking the corresponding env var isn't already set before calling this - env vars must always
 * win, so writing here would otherwise be silently ignored at read time anyway. */
export async function setConfigValue(key: ConfigKey, value: string, updatedBy: string): Promise<void> {
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
