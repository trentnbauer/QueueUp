import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db/client.js';

const TOKEN_PREFIX = 'qup_';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Bearer token for the Playnite extension (see routes/playnite.ts) - stored as a hash on User,
 * one active token per user. Returns the plaintext, which is only ever shown this once. */
export async function generatePlayniteToken(userId: string): Promise<string> {
  const token = TOKEN_PREFIX + randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: { playniteTokenHash: hashToken(token), playniteTokenCreatedAt: new Date(), playniteTokenLastUsedAt: null },
  });
  return token;
}

export async function revokePlayniteToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { playniteTokenHash: null, playniteTokenCreatedAt: null, playniteTokenLastUsedAt: null },
  });
}

export async function getPlayniteTokenStatus(
  userId: string,
): Promise<{ hasToken: boolean; createdAt: Date | null; lastUsedAt: Date | null }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { playniteTokenHash: true, playniteTokenCreatedAt: true, playniteTokenLastUsedAt: true },
  });
  return {
    hasToken: user.playniteTokenHash != null,
    createdAt: user.playniteTokenCreatedAt,
    lastUsedAt: user.playniteTokenLastUsedAt,
  };
}

/** Resolves a raw `Authorization: Bearer <token>` header value to the user it belongs to, bumping
 * lastUsedAt on a hit. Returns null for a missing/malformed header or a token that doesn't match
 * any user (never throws - callers fall through to "not authenticated" the same as no header). */
export async function resolveUserIdFromBearerToken(authorizationHeader: string | undefined): Promise<string | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const user = await prisma.user.findUnique({ where: { playniteTokenHash: hashToken(token) }, select: { id: true } });
  if (!user) return null;

  await prisma.user.update({ where: { id: user.id }, data: { playniteTokenLastUsedAt: new Date() } });
  return user.id;
}
