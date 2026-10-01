import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Encryption at rest for the admin-entered integration credentials in app_settings (see
 * configResolver.ts), so a database backup on its own doesn't hand out API keys or the tunnel
 * token. AES-256-GCM with a key derived from SESSION_SECRET: restoring a backup onto a server with
 * a different SESSION_SECRET leaves those values unreadable, and they have to be entered again. */

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'queueup', 'app-settings-v1', 32));
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptSetting(plain: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** The plain value, or null when it was encrypted under a different secret (or is corrupt).
 * A value without the prefix predates encryption and is returned as-is. */
export function decryptSetting(stored: string, secret: string): string | null {
  if (!isEncrypted(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    if (raw.length < IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
