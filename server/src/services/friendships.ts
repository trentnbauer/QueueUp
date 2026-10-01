import { prisma } from '../db/client.js';
import { env } from '../config/env.js';

/** Ids of everyone `userId` counts as a friend. Normally that's accepted friendships (either
 * direction). On a PRIVATE_INSTANCE it's every other user on the server - nothing is written, so
 * switching the setting off puts real friendships back exactly as they were. */
export async function friendIdsOf(userId: string): Promise<string[]> {
  if (env.PRIVATE_INSTANCE) {
    const users = await prisma.user.findMany({ where: { id: { not: userId } }, select: { id: true } });
    return users.map((u) => u.id);
  }
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/** Whether `otherId` is a friend of `userId` (see friendIdsOf for what counts). */
export async function areFriends(userId: string, otherId: string): Promise<boolean> {
  if (userId === otherId) return false;
  if (env.PRIVATE_INSTANCE) return (await prisma.user.count({ where: { id: otherId } })) > 0;
  const row = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: userId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: userId },
      ],
    },
    select: { id: true },
  });
  return !!row;
}
