import { createHash } from 'node:crypto';
import type { AiConfig, AiProviderError } from './providers.js';

/** Skipping a provider that will not work for a while (#1043). A provider that is out of credit or has a
 * bad key fails every request before the next provider gets a turn; after such a failure it is left out
 * for a few minutes and then tried again. Kept in memory per provider (a different key, model or address
 * is a different entry, so fixing the settings takes effect at once). Only errors that will not fix
 * themselves quickly count: a timeout, a refused connection, a 5xx or an ordinary rate limit do not. */

const MIN = 60;
/** Long enough to spare the next requests, short enough that a topped-up account is noticed soon. */
const LONG_SECONDS = 10 * MIN;
const MAX_SECONDS = 30 * MIN;
const MAX_ENTRIES = 500;

const BILLING = /insufficient|quota|credit|billing|payment|balance|exceeded your current|out of funds|subscription/i;

/** How long to leave a provider alone after this failure, in seconds, or null for "do not". */
export function coolDownSeconds(err: AiProviderError): number | null {
  const status = err.upstreamStatus;
  // No reply (timeout, DNS, refused connection) and a server error are usually passing.
  if (status === null || status >= 500) return null;
  if (status === 401 || status === 403 || status === 402) return LONG_SECONDS;
  if (status === 429) {
    // A rate limit that resets in a moment is not worth skipping for; "no credit left" and a long reset are.
    if (err.retryAfterSeconds !== null && err.retryAfterSeconds >= 2 * MIN) return Math.min(err.retryAfterSeconds, MAX_SECONDS);
    return BILLING.test(err.message) ? LONG_SECONDS : null;
  }
  // A model that no longer exists, or a refusal that names credit.
  if (status === 404) return 5 * MIN;
  if (status >= 400 && BILLING.test(err.message)) return LONG_SECONDS;
  return null;
}

interface Entry {
  until: number;
  message: string;
}

const cooling = new Map<string, Entry>();

/** What identifies a provider entry: changing any part (including the key) makes it a new one. Hashed so
 * the key never sits in a map key. */
export function cooldownKey(c: Pick<AiConfig, 'provider' | 'model' | 'baseUrl' | 'apiKey'>): string {
  return createHash('sha256').update([c.provider, c.model, c.baseUrl, c.apiKey ?? ''].join('\0')).digest('hex').slice(0, 24);
}

/** The reason a provider is being skipped, or null when it is free to try. */
export function coolingReason(key: string, now = Date.now()): { message: string; secondsLeft: number } | null {
  const e = cooling.get(key);
  if (!e) return null;
  if (e.until <= now) {
    cooling.delete(key);
    return null;
  }
  return { message: e.message, secondsLeft: Math.ceil((e.until - now) / 1000) };
}

export function startCooldown(key: string, seconds: number, message: string, now = Date.now()): void {
  if (cooling.size >= MAX_ENTRIES) {
    for (const [k, e] of cooling) if (e.until <= now) cooling.delete(k);
    if (cooling.size >= MAX_ENTRIES) cooling.clear();
  }
  cooling.set(key, { until: now + seconds * 1000, message });
}

export function endCooldown(key: string): void {
  cooling.delete(key);
}

/** For tests. */
export function resetCooldowns(): void {
  cooling.clear();
}
