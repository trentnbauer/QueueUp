import { prisma } from '../db/client.js';

/** Games this person hid from recommendations: never offered to them again, by the IGDB list or the AI. */
export async function getHiddenIgdbIds(userId: string): Promise<Set<number>> {
  const rows = await prisma.hiddenRecommendation.findMany({ where: { userId }, select: { igdbId: true } });
  return new Set(rows.map((r) => r.igdbId));
}

export async function hideRecommendation(userId: string, igdbId: number): Promise<void> {
  await prisma.hiddenRecommendation.createMany({ data: [{ userId, igdbId }], skipDuplicates: true });
}
