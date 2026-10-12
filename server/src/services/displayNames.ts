import { randomInt } from 'node:crypto';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

/** A display name reduced to what makes two names "the same" for blacklisting: letters and digits
 * only, case and accents folded, so "B4d  Name!" and "b4dname" are one entry. */
export function normalizeDisplayName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Whether text may not be used as a name, profile link, room name or review note: it is a blacklisted
 * name as a whole, or it contains a banned word (compared ignoring case, accents, spacing and
 * punctuation, so "b a d" and "B-A-D" are the same). */
export async function isDisplayNameBlocked(name: string): Promise<boolean> {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return false;
  if ((await prisma.blockedDisplayName.count({ where: { normalized } })) > 0) return true;
  const words = await prisma.bannedWord.findMany({ select: { normalized: true } });
  return words.some((w) => normalized.includes(w.normalized));
}

/** Throws a 400 when the text is blocked. `what` names it for the message ("That room name"). */
export async function assertTextAllowed(text: string, what: string): Promise<void> {
  if (await isDisplayNameBlocked(text)) throw new HttpError(400, `${what} is not allowed. Choose another.`);
}

/** Shortest banned word accepted: shorter ones would catch far too much ordinary text. */
export const MIN_BANNED_WORD_LENGTH = 3;

/** Bans a word (administrators). Adding one twice is fine. Returns false when it is too short. */
export async function addBannedWord(word: string, adminId: string): Promise<boolean> {
  const normalized = normalizeDisplayName(word);
  if (normalized.length < MIN_BANNED_WORD_LENGTH) return false;
  await prisma.bannedWord.upsert({ where: { normalized }, create: { normalized, example: word.trim().slice(0, 80), createdBy: adminId }, update: {} });
  return true;
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
