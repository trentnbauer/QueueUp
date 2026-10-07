import { prisma } from '../db/client.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { adultOnlyFromSources } from './adultSources.js';
import { notifySensitiveGames } from './notifications.js';
import { autoHideWaitingAdultGames } from './adultHiding.js';
import { redis } from './redisClient.js';

/** After a library sync (Steam, Playnite, Xbox, PlayStation, Exophase, RetroAchievements): look for adult games the
 * sync brought in, and tell the person once if any are waiting for the "hide from your public library?" answer. IGDB
 * tags flag games at intake; this adds Steam's "Adult Only Sexual Content" descriptor (for a game with a Steam
 * id, which IGDB links to console versions of the same game) and IGDB's ESRB "Adults Only" rating (see
 * adultSources.ts), cached per game, a few at a time, at most MAX_SOURCE_CHECKS per sync so a big first sync does
 * not hammer Steam or IGDB - the rest are done by later syncs. Nothing is hidden unless the person turned on
 * automatic hiding: the notification opens the prompt where they choose. A game every source says is not adult is
 * marked checked so it is never asked about again. Best effort: a failure here never fails a sync. */
export const MAX_SOURCE_CHECKS = 150;
const STEAM_CHECK_CONCURRENCY = 3;

type CheckRow = { id: string; igdbId: number; steamAppid: number | null };

/** Asks the sources about each game: a yes flags it, a no from every source marks it checked, and a source that
 * could not answer leaves it for next time. */
async function checkRows(rows: CheckRow[]): Promise<void> {
  await runWithConcurrency(rows, STEAM_CHECK_CONCURRENCY, async (row) => {
    const adult = await adultOnlyFromSources(row);
    if (adult === null) return; // a source did not answer: try again on a later sync
    await prisma.game.update({ where: { id: row.id }, data: adult ? { sensitiveContent: true } : { sensitiveAiChecked: true } });
  });
}

export async function flagAdultGamesAfterSync(userId: string, igdbIds: number[]): Promise<void> {
  try {
    const ids = [...new Set(igdbIds)];
    if (ids.length > 0) {
      const rows = await prisma.game.findMany({
        where: { roomId: null, addedBy: userId, igdbId: { in: ids }, sensitiveContent: false, sensitiveAiChecked: false, archivedAt: null },
        select: { id: true, igdbId: true, steamAppid: true },
        take: MAX_SOURCE_CHECKS,
      });
      await checkRows(rows);
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

const SCAN_LOCK_SECONDS = 60 * 60;
const SCAN_PAGE = 200;
const scanLockKey = (userId: string) => `adult-scan-lock:${userId}`;

/** Goes through the person's WHOLE Personal Shelf (not just what a sync just brought in) asking the sources about
 * every game not already flagged or checked: Steam's Adult Only descriptor and IGDB's ESRB Adults Only rating. When
 * it ends, adult games are hidden if the person switched on automatic hiding, and otherwise one notification
 * recommends reviewing them (it opens the hide prompt). Runs in the background; false when one is already running.
 * A game a source could not answer for (Steam allows only so many requests) is left for the next scan. */
export async function scanLibraryForAdultGames(userId: string): Promise<boolean> {
  if ((await redis.set(scanLockKey(userId), '1', 'EX', SCAN_LOCK_SECONDS, 'NX')) !== 'OK') return false;
  void (async () => {
    try {
      let after: string | undefined;
      for (;;) {
        const rows = await prisma.game.findMany({
          where: { roomId: null, addedBy: userId, sensitiveContent: false, sensitiveAiChecked: false, archivedAt: null, ...(after ? { id: { gt: after } } : {}) },
          select: { id: true, igdbId: true, steamAppid: true },
          orderBy: { id: 'asc' },
          take: SCAN_PAGE,
        });
        if (rows.length === 0) break;
        await checkRows(rows);
        after = rows[rows.length - 1].id;
      }
      await autoHideWaitingAdultGames(userId);
      const waiting = await prisma.game.count({
        where: { roomId: null, addedBy: userId, sensitiveContent: true, sensitivePrompted: false, hiddenFromOthers: false, archivedAt: null },
      });
      await notifySensitiveGames(userId, waiting);
    } catch (err) {
      console.error('[adult-scan] failed', err);
    } finally {
      await redis.del(scanLockKey(userId)).catch(() => undefined);
    }
  })();
  return true;
}
