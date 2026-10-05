import { prisma } from '../db/client.js';

/** Remembers that this person re-matched a card from `fromIgdbId` to `toIgdbId` (issue #814), so a
 * later import that resolves to the old game is pointed at the one they picked. Earlier redirects
 * that ended at `fromIgdbId` are re-pointed at `toIgdbId`, so a chain (A -> B, then B -> C) still
 * resolves in one step, and a redirect back onto the old game removes itself instead of looping. */
export async function recordMatchRedirect(
  userId: string,
  from: { igdbId: number; title: string; coverImageUrl: string | null },
  to: { igdbId: number; title: string },
): Promise<void> {
  const { igdbId: fromIgdbId } = from;
  const { igdbId: toIgdbId } = to;
  if (fromIgdbId === toIgdbId) return;
  await prisma.$transaction([
    prisma.gameMatchRedirect.updateMany({ where: { userId, toIgdbId: fromIgdbId }, data: { toIgdbId, toTitle: to.title } }),
    prisma.gameMatchRedirect.deleteMany({ where: { userId, fromIgdbId: toIgdbId } }),
    prisma.gameMatchRedirect.upsert({
      where: { userId_fromIgdbId: { userId, fromIgdbId } },
      create: { userId, fromIgdbId, fromTitle: from.title, fromCoverImageUrl: from.coverImageUrl, toIgdbId, toTitle: to.title },
      update: { fromTitle: from.title, fromCoverImageUrl: from.coverImageUrl, toIgdbId, toTitle: to.title },
    }),
  ]);
}

/** The igdbId an import should use for this person: the game they re-matched it to, or the id
 * unchanged when they never did. */
export async function applyMatchRedirect(userId: string, igdbId: number): Promise<number> {
  const redirect = await prisma.gameMatchRedirect.findUnique({
    where: { userId_fromIgdbId: { userId, fromIgdbId: igdbId } },
    select: { toIgdbId: true },
  });
  return redirect?.toIgdbId ?? igdbId;
}

/** What the shelf's Merged tab lists: every game this person merged away, newest first. */
export async function listMatchRedirects(userId: string) {
  return prisma.gameMatchRedirect.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

/** Stops redirecting future imports of `fromIgdbId`. The merged card itself is not restored. */
export async function deleteMatchRedirect(userId: string, fromIgdbId: number): Promise<void> {
  await prisma.gameMatchRedirect.deleteMany({ where: { userId, fromIgdbId } });
}
