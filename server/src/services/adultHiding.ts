import { prisma } from '../db/client.js';

/** "Automatically hide adult games": when the person has switched it on, every Personal Shelf game flagged as adult
 * (IGDB's tags, Steam's Adult Only descriptor, or the AI check) that is still waiting for the "hide from your public
 * library?" answer is hidden from the public profile and friends, and counts as answered, so nothing is asked.
 * Returns how many games were hidden (0 when the setting is off). Hiding is the same flag the per-game tick box and
 * the prompt use, so it can be undone from the game's page. */
export async function autoHideWaitingAdultGames(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { autoHideAdult: true } });
  if (!user?.autoHideAdult) return 0;
  const res = await prisma.game.updateMany({
    where: { roomId: null, addedBy: userId, sensitiveContent: true, sensitivePrompted: false, hiddenFromOthers: false, archivedAt: null },
    data: { hiddenFromOthers: true, sensitivePrompted: true },
  });
  return res.count;
}
