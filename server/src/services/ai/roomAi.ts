import type { RoomAiResponse } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { toUserDto } from '../../util/dto.js';
import { getUserAiConfig } from './aiConfig.js';

/** A member can apply their own AI provider and key to a room they're in, so people in that room who
 * haven't set up AI themselves can use it. The room only points at the member (Room.aiKeyOwnerId);
 * the key stays in their personal settings, encrypted, and is never copied or shown. One sponsor per
 * room at a time, and only the Room Master or a Moderator can become it (the sponsor's provider sees
 * the room's prompts). The room's AI use is billed to the sponsor, so only they (or the Room Master
 * or a Moderator) can take it off. Resolution order lives in aiConfig.ts: a person's own settings still
 * come first, then the room's sponsor, then the server's. */

const sponsorSelect = { id: true, displayName: true, avatarColor: true, avatarUrl: true, isAdmin: true } as const;

/** The room's sponsor, or null. A sponsor who is no longer a member is cleared on the way past, so
 * a stale pointer never lingers. */
async function currentSponsor(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { aiKeyOwnerId: true, aiKeyOwner: { select: sponsorSelect } },
  });
  if (!room?.aiKeyOwnerId || !room.aiKeyOwner) return null;
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: room.aiKeyOwnerId } },
    select: { userId: true },
  });
  if (!member) {
    await prisma.room.updateMany({ where: { id: roomId, aiKeyOwnerId: room.aiKeyOwnerId }, data: { aiKeyOwnerId: null } });
    return null;
  }
  return room.aiKeyOwner;
}

/** `elevated`: the asker is the Room Master or a Moderator. */
export async function describeRoomAi(roomId: string, userId: string, elevated: boolean): Promise<RoomAiResponse> {
  const [sponsor, own] = await Promise.all([currentSponsor(roomId), getUserAiConfig(userId)]);
  const youAreSponsor = sponsor?.id === userId;
  return {
    sponsor: sponsor ? toUserDto(sponsor) : null,
    youAreSponsor,
    canApply: elevated && own !== null && sponsor === null,
    canRemove: sponsor !== null && (youAreSponsor || elevated),
    hasOwnSettings: own !== null,
  };
}

/** Makes this member the room's sponsor. They must really be a member (an administrator only
 * managing the room doesn't count), have usable personal settings, and nobody else may be sponsoring. */
export async function applyMyAiToRoom(roomId: string, userId: string, elevated: boolean): Promise<void> {
  // Whoever sponsors the room's AI receives the prompts, which carry other members' library and
  // activity facts - so only the Room Master or a Moderator may choose to be that person (#943).
  if (!elevated) throw new HttpError(403, 'Only the Room Master or a Moderator can apply their AI settings to a room');
  const member = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } }, select: { userId: true } });
  if (!member) throw new HttpError(403, 'You have to be a member of this room to apply your AI settings to it');
  if ((await getUserAiConfig(userId)) === null) {
    throw new HttpError(400, 'Set up your own AI provider and key in your account settings first');
  }

  const sponsor = await currentSponsor(roomId);
  if (sponsor?.id === userId) return;
  if (sponsor) throw new HttpError(409, `${sponsor.displayName} already provides this room's AI. They, or a Room Master or Moderator, can remove it first.`);

  // Only succeeds while nobody holds it, so two members applying at once can't both win.
  const { count } = await prisma.room.updateMany({ where: { id: roomId, aiKeyOwnerId: null }, data: { aiKeyOwnerId: userId } });
  if (count === 0) throw new HttpError(409, "Someone else just applied their AI settings to this room");
}

/** Takes the sponsor off the room. The sponsor can always do it; so can the Room Master or a Moderator. */
export async function removeRoomAi(roomId: string, actorId: string, elevated: boolean): Promise<void> {
  const sponsor = await currentSponsor(roomId);
  if (!sponsor) return;
  if (sponsor.id !== actorId && !elevated) {
    throw new HttpError(403, 'Only the member who applied their AI settings, or a Room Master or Moderator, can remove them');
  }
  await prisma.room.updateMany({ where: { id: roomId, aiKeyOwnerId: sponsor.id }, data: { aiKeyOwnerId: null } });
}
