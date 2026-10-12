import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { notifyRoom } from './notifications.js';

/** What a valid invite turned out to be: a room's invite code, or an administrator's site invite. */
export type ResolvedInvite = { kind: 'room'; roomId: string } | { kind: 'site'; id: string };

/** Raised by account creation when SIGNUP_MODE=invite and the person had no valid invite. */
export class SignupInviteRequiredError extends HttpError {
  constructor() {
    super(403, 'An invite is needed to create an account on this server.');
  }
}

const MAX_CODE_LENGTH = 64;

/** Site invite codes avoid look-alike characters so they can be read out or typed from a message. */
const SITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSiteInviteCode(): string {
  // randomInt draws each character uniformly, whatever the alphabet's length (a byte modulo the
  // length would favour some characters unless the length divides 256).
  let code = '';
  for (let i = 0; i < 12; i++) code += SITE_CODE_ALPHABET[randomInt(SITE_CODE_ALPHABET.length)];
  return code;
}

export function isSiteInviteUsable(invite: { maxUses: number | null; uses: number; expiresAt: Date | null; revokedAt: Date | null }, now = new Date()): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt <= now) return false;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return false;
  return true;
}

/** Looks up a room invite code (same codes as POST /api/rooms/join) or a usable site invite.
 * Returns null for anything else - callers must not say which of unknown, expired, revoked or used
 * up it was. */
export async function resolveInvite(raw: unknown): Promise<ResolvedInvite | null> {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  if (!code || code.length > MAX_CODE_LENGTH) return null;

  const room = await prisma.room.findUnique({ where: { inviteCode: code }, select: { id: true, deletedAt: true } });
  if (room && !room.deletedAt) return { kind: 'room', roomId: room.id };

  const site = await prisma.siteInvite.findUnique({ where: { code } });
  if (site && isSiteInviteUsable(site)) return { kind: 'site', id: site.id };
  return null;
}

/** Uses up one use of a site invite. Atomic (compare-and-set on the use count, retried), so two
 * sign-ups racing for the last use of a single-use invite cannot both win. Room invites are not
 * consumed. */
export async function consumeInvite(invite: ResolvedInvite): Promise<boolean> {
  if (invite.kind === 'room') return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.siteInvite.findUnique({ where: { id: invite.id } });
    if (!row || !isSiteInviteUsable(row)) return false;
    const res = await prisma.siteInvite.updateMany({ where: { id: row.id, uses: row.uses, revokedAt: null }, data: { uses: { increment: 1 } } });
    if (res.count === 1) return true;
  }
  return false;
}

/** After a room invite created the account, puts the new person in that room. */
export async function joinRoomForInvite(userId: string, invite: ResolvedInvite): Promise<void> {
  if (invite.kind !== 'room') return;
  const room = await prisma.room.findUnique({ where: { id: invite.roomId }, select: { id: true, name: true, deletedAt: true } });
  if (!room || room.deletedAt) return;
  try {
    await prisma.roomMember.create({ data: { roomId: room.id, userId, role: 'member' } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  await notifyRoom({ roomId: room.id, roomName: room.name, actorId: userId, type: 'member_joined', message: (actorName) => `${actorName} joined the room` });
}
