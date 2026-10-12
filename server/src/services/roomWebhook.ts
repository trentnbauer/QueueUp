import { prisma } from '../db/client.js';
import { decryptSetting, encryptSetting, isEncrypted } from './settingsCrypto.js';

/** A room's Discord webhook URL embeds Discord's own token (discord.com/api/webhooks/<id>/<token>),
 * and whoever has it can post to that channel. So it is encrypted at rest like the other credentials
 * (AES-256-GCM, key derived from SESSION_SECRET, see settingsCrypto.ts), and a database backup on
 * its own doesn't hand it out. Under a different SESSION_SECRET (a restore onto another server) it
 * can't be read any more, and the Room Master pastes it again. */

/** Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function getSecret(): Promise<string> {
  return (await import('../config/env.js')).env.SESSION_SECRET;
}

export function encryptWebhookUrl(url: string, secret: string): string {
  return encryptSetting(url, secret);
}

/** The usable URL, or null when there is none or it was encrypted under another secret. A value
 * saved before encryption existed is plain text and comes back as-is. */
export function readWebhookUrl(stored: string | null, secret: string): string | null {
  return stored ? decryptSetting(stored, secret) : null;
}

/** readWebhookUrl with this server's secret, for code that doesn't already have the env loaded. */
export async function loadWebhookUrl(stored: string | null): Promise<string | null> {
  return stored ? readWebhookUrl(stored, await getSecret()) : null;
}

/** Encrypts webhook URLs saved before encryption existed (or loaded from an older backup). Runs at
 * boot and after a restore; ones already encrypted are left alone. */
export async function encryptPlaintextWebhooks(): Promise<number> {
  const rows = await prisma.room.findMany({ where: { discordWebhookUrl: { not: null } }, select: { id: true, discordWebhookUrl: true } });
  const plain = rows.filter((r) => r.discordWebhookUrl && !isEncrypted(r.discordWebhookUrl));
  if (plain.length === 0) return 0;
  const secret = await getSecret();
  for (const row of plain) {
    await prisma.room.update({ where: { id: row.id }, data: { discordWebhookUrl: encryptWebhookUrl(row.discordWebhookUrl!, secret) } });
  }
  return plain.length;
}
