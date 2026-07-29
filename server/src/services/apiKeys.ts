import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

// A `qk_` prefix (QueueUp Key) makes a leaked token recognizable at a glance (in a log line, a
// commit, a Slack message) the same way GitHub's `ghp_`/Stripe's `sk_live_` prefixes do - the rest
// is 32 CSPRNG bytes, base64url-encoded, which is plenty of entropy to make guessing infeasible
// without needing a slow password-hashing function on the lookup side (see hashApiKeyToken below).
const TOKEN_PREFIX = 'qk_';
const TOKEN_BYTES = 32;

export function generateApiKeyToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

// Plain SHA-256, not bcrypt/argon2: the token itself is already high-entropy CSPRNG output (unlike
// a user-chosen password), so there's no offline-guessing risk a slow hash would need to defend
// against - and a fast hash is what makes `findUnique({ where: { hash } })` an O(1) indexed lookup
// on every API request instead of a table scan. Never add a per-key salt to this - that would
// break the indexed lookup and force comparing against every stored hash on every request.
export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Resolves the bearer token on an /api/v1 request to the user it belongs to - the *only* entry
 * point into API-key auth, deliberately separate from request.requireAuth()'s cookie-session path
 * so a valid key can never be used to reach a cookie-authenticated app route (account settings,
 * admin, etc.) and a browser session can never be used to reach /api/v1. Fails closed: a missing
 * header, malformed value, unknown hash, or revoked key all become the same 401 (no distinction
 * that would help an attacker enumerate valid tokens). */
export async function resolveApiKeyUserId(authorizationHeader: string | undefined): Promise<string> {
  const token = authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice('Bearer '.length).trim() : null;
  if (!token) throw new HttpError(401, 'Missing or malformed Authorization header - expected "Bearer <api key>"');

  const apiKey = await prisma.apiKey.findUnique({ where: { hash: hashApiKeyToken(token) } });
  if (!apiKey || apiKey.revokedAt) throw new HttpError(401, 'Invalid or revoked API key');

  // Best-effort - a hiccup writing lastUsedAt shouldn't fail the actual request it's timestamping.
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return apiKey.userId;
}
