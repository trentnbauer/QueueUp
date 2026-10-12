import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { env } from '../config/env.js';

/** The terms version people accept (#1097): TERMS_VERSION when the operator sets one, else a short hash
 * of the custom terms file (so editing the file re-asks everyone), else "default" for the built-in
 * text. */
export async function currentTermsVersion(): Promise<string> {
  const explicit = env.TERMS_VERSION?.trim();
  if (explicit) return explicit.slice(0, 64);
  if (env.TERMS_FILE) {
    try {
      const text = await fs.readFile(env.TERMS_FILE, 'utf8');
      return createHash('sha256').update(text).digest('hex').slice(0, 12);
    } catch {
      /* unreadable file: the page shows the default text, so the default version applies */
    }
  }
  return 'default';
}

/** Whether this person still has to accept the terms before using the app. */
export function termsAcceptanceRequired(acceptedVersion: string | null, currentVersion: string): boolean {
  return env.REQUIRE_TERMS_ACCEPTANCE && acceptedVersion !== currentVersion;
}
