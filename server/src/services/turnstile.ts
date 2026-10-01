import { env } from '../config/env.js';
import { getConfigValue } from './configResolver.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 10_000;

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

/** Cloudflare Turnstile (issue #665): the sign-in captcha is on only when both keys are set, each
 * from the env var or the admin Settings fallback. */
export async function getTurnstileConfig(): Promise<TurnstileConfig | null> {
  const [siteKey, secretKey] = await Promise.all([
    getConfigValue('TURNSTILE_SITE_KEY', env.TURNSTILE_SITE_KEY),
    getConfigValue('TURNSTILE_SECRET_KEY', env.TURNSTILE_SECRET_KEY),
  ]);
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** Checks a widget token with Cloudflare. Fails closed: a missing token, a rejection, or Cloudflare
 * being unreachable all count as not verified. */
export async function verifyTurnstileToken(
  secretKey: string,
  token: string | undefined,
  remoteIp: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
