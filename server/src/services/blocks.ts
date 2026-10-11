import { prisma } from '../db/client.js';

/** Whether either of the two people has blocked the other. Blocking hides each from the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!row;
}

/** Blocks `blockerId` makes `blockedId` invisible to them, and drops any friendship or pending
 * request between the two. Blocking someone twice is fine. */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.$transaction([
    prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId, blockedId } }, create: { blockerId, blockedId }, update: {} }),
    prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: blockerId, addresseeId: blockedId }, { requesterId: blockedId, addresseeId: blockerId }] },
    }),
  ]);
}
