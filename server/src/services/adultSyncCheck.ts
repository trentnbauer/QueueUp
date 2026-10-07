import { prisma } from '../db/client.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { getSteamAdultOnly } from './steamContent.js';
import { notifySensitiveGames } from './notifications.js';
import { autoHideWaitingAdultGames } from './adultHiding.js';

/** After a Steam or Playnite sync: look for adult games the sync brought in, and tell the person once if any are
 * waiting for the "hide from your public library?" answer. IGDB tags flag games at intake; this adds Steam's
 * "Adult Only Sexual Content" descriptor for games with a Steam id (cached per app, a few at a time, at most
 * MAX_STEAM_CHECKS per sync so a big first sync does not hammer Steam - the rest are done by later syncs).
 * Nothing is hidden: the notification opens the prompt where the person chooses. A game Steam says is not adult
 * is marked checked so it is never asked about again. Best effort: a failure here never fails a sync. */
export const MAX_STEAM_CHECKS = 150;
const STEAM_CHECK_CONCURRENCY = 3;

export async function flagAdultGamesAfterSync(userId: string, igdbIds: number[]): Promise<void> {
  try {
    const ids = [...new Set(igdbIds)];
    if (ids.length > 0) {
      const rows = await prisma.game.findMany({
        where: { roomId: null, addedBy: userId, igdbId: { in: ids }, sensitiveContent: false, sensitiveAiChecked: false, steamAppid: { not: null }, archivedAt: null },
        select: { id: true, steamAppid: true },
        take: MAX_STEAM_CHECKS,
      });
      await runWithConcurrency(rows, STEAM_CHECK_CONCURRENCY, async (row) => {
        const adult = row.steamAppid === null ? null : await getSteamAdultOnly(row.steamAppid);
        if (adult === null) return; // Steam did not answer: try again on a later sync
        await prisma.game.update({ where: { id: row.id }, data: adult ? { sensitiveContent: true } : { sensitiveAiChecked: true } });
      });
    }
    // With "automatically hide adult games" on, they are hidden now and there is nothing to ask or tell.
    await autoHideWaitingAdultGames(userId);
    const waiting = await prisma.game.count({
      where: { roomId: null, addedBy: userId, sensitiveContent: true, sensitivePrompted: false, hiddenFromOthers: false, archivedAt: null },
    });
    await notifySensitiveGames(userId, waiting);
  } catch (err) {
    console.error('[adult-sync-check] failed', err);
  }
}
