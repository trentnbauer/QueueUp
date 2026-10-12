import { prisma } from '../db/client.js';

/** What identifies a banned person beyond their one account: the sign-in identities they have (the
 * provider ids behind them, and a provider-verified email), so a new account made with any of them
 * starts out banned. Unverified emails are never recorded or matched: anyone can type any address into
 * a provider profile, so matching them would let one person ban someone else's address. */
export interface IdentityKey {
  kind: 'sub' | 'email';
  value: string;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Every identity worth remembering for an account. */
export async function identitiesOf(userId: string): Promise<IdentityKey[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { linkedIdentities: true } });
  if (!user) return [];
  const keys: IdentityKey[] = [{ kind: 'sub', value: user.oidcSub }];
  if (user.steamId64) keys.push({ kind: 'sub', value: `steam:${user.steamId64}` });
  for (const l of user.linkedIdentities) keys.push({ kind: 'sub', value: l.oidcSub });
  if (user.emailVerified && user.email) keys.push({ kind: 'email', value: normalizeEmail(user.email) });
  return keys;
}

/** Remembers the account's identities as banned. Safe to repeat. */
export async function recordBannedIdentities(userId: string): Promise<void> {
  const keys = await identitiesOf(userId);
  if (keys.length === 0) return;
  await prisma.bannedIdentity.createMany({ data: keys.map((k) => ({ ...k, bannedUserId: userId })), skipDuplicates: true });
}

/** Forgets the identities remembered for an account (it was unbanned). */
export async function clearBannedIdentities(userId: string): Promise<void> {
  await prisma.bannedIdentity.deleteMany({ where: { bannedUserId: userId } });
}

/** Whether a sign-in identity belongs to someone who is banned. */
export async function matchesBannedIdentity(identity: { oidcSub: string; email: string; emailVerified: boolean }): Promise<boolean> {
  const or: { kind: string; value: string }[] = [{ kind: 'sub', value: identity.oidcSub }];
  if (identity.emailVerified && identity.email) or.push({ kind: 'email', value: normalizeEmail(identity.email) });
  return (await prisma.bannedIdentity.count({ where: { OR: or } })) > 0;
}
