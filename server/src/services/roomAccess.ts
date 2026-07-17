import { randomInt } from 'node:crypto';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import type { RoomPlatform } from '@squadqueue/shared';

export async function getRoomPlatform(roomId: string): Promise<RoomPlatform> {
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
  return room.platform;
}

/** Full room row, for callers that need more than one field (e.g. platform + name) - fetching it
 * once here instead of calling getRoomPlatform and then a second query for the rest. */
export async function getRoom(roomId: string) {
  return prisma.room.findUniqueOrThrow({ where: { id: roomId } });
}

export async function requireMembership(roomId: string, userId: string) {
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) {
    throw new HttpError(403, 'You are not a member of this room');
  }
  return membership;
}

export async function requireElevated(roomId: string, userId: string) {
  const membership = await requireMembership(roomId, userId);
  if (membership.role !== 'room_master' && membership.role !== 'moderator') {
    throw new HttpError(403, 'Only the Room Master or a Moderator can do this');
  }
  return membership;
}

// A room's invite code is its sole access-control secret, so it needs a CSPRNG rather than
// Math.random() (whose internal state can potentially be inferred from observed outputs).
const INVITE_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const INVITE_CODE_LENGTH = 10;

function randomInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    const existing = await prisma.room.findUnique({ where: { inviteCode: code } });
    if (!existing) return code;
  }
  throw new HttpError(500, 'Could not generate a unique invite code, try again');
}
