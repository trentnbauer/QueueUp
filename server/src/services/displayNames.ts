import { randomInt } from 'node:crypto';
import { prisma } from '../db/client.js';

/** A display name reduced to what makes two names "the same" for blacklisting: letters and digits
 * only, case and accents folded, so "B4d  Name!" and "b4dname" are one entry. */
export function normalizeDisplayName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export async function isDisplayNameBlocked(name: string): Promise<boolean> {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return false;
  return (await prisma.blockedDisplayName.count({ where: { normalized } })) > 0;
}

/** Adds a name to the blacklist (administrators). Adding one twice is fine. */
export async function blockDisplayName(name: string, adminId: string): Promise<void> {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return;
  await prisma.blockedDisplayName.upsert({ where: { normalized }, create: { normalized, example: name.slice(0, 80), createdBy: adminId }, update: {} });
}

/** A neutral stand-in name for someone who has to pick a new one. */
export function placeholderDisplayName(): string {
  return `Player ${randomInt(1000, 10000)}`;
}
