import type { GameStatus } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { currentPlaytimeMinutesForGame } from './playtimeTracking.js';

/** One play-journal entry closed by a status transition, as reported back to the caller (issue
 * #489's Marathoner/Comeback badges need the entries' start/finish timestamps and count - not
 * available from a bare updateMany, which only reports how many rows it touched). */
export interface ClosedPlayLogEntry {
  startedAt: Date;
  finishedAt: Date;
}

/** Opens or closes a play journal entry for one game's status transition (issue #361) - see the
 * PlayLog model doc for why this exists separately from Game.status. Scoped to the interactive
 * status-change entry points a user actually triggers (the single/bulk status routes, and the
 * shelf-sync-Beaten action) - not every server-side path that can touch status (Steam import,
 * automated completion detection, admin actions), which would be a much larger audit trail than
 * this issue asked for. Returns the entries closed by this call (empty for a no-op or a
 * transition into 'playing'), for callers that need to look at them (e.g. badge checks). */
export async function recordStatusTransition(
  gameId: string,
  previousStatus: GameStatus,
  newStatus: GameStatus,
): Promise<ClosedPlayLogEntry[]> {
  if (previousStatus === newStatus) return [];

  if (newStatus === 'playing') {
    // A genuine two-concurrent-requests race here (double-click, two tabs marking the same game
    // Playing at once) could both see "no open entry" and each create one, briefly leaving two
    // open entries for the same game - there's no Prisma-expressible partial-unique-index guard
    // against that (this project has no migration history to add one via raw SQL - see db push in
    // server-entrypoint.sh). Left as a rare, self-healing cosmetic duplicate rather than adding
    // transactional locking for it: the done/dropped branch below closes *every* open entry at
    // once, so a stray duplicate never lingers past the next real completion.
    const open = await prisma.playLog.findFirst({ where: { gameId, finishedAt: null } });
    if (!open) {
      const startPlaytimeMinutes = await currentPlaytimeMinutesForGame(gameId);
      await prisma.playLog.create({ data: { gameId, startedAt: new Date(), startPlaytimeMinutes } });
    }
    return [];
  }

  if (newStatus === 'done' || newStatus === 'dropped') {
    // Read the open entries before closing them (rather than relying on updateMany's count) so
    // the caller can see what got closed - same self-healing intent as before (every open entry
    // for this game is closed at once, so a stray duplicate from the race above never lingers
    // past the next real completion), just with the rows captured first.
    const now = new Date();
    const finishPlaytimeMinutes = await currentPlaytimeMinutesForGame(gameId);
    const openEntries = await prisma.playLog.findMany({ where: { gameId, finishedAt: null } });
    if (openEntries.length > 0) {
      await prisma.playLog.updateMany({ where: { gameId, finishedAt: null }, data: { finishedAt: now, finishPlaytimeMinutes } });
      return openEntries.map((entry) => ({ startedAt: entry.startedAt, finishedAt: now }));
    }
    // Jumped straight to Done/Dropped without ever passing through Playing - still worth a
    // record, even though the real start date is unknown; same start/finish timestamp reads as
    // "logged after the fact" rather than a genuine multi-day playthrough. startPlaytimeMinutes
    // and finishPlaytimeMinutes end up equal here (both read "now") - correctly reporting 0 hours
    // played for a playthrough QueueUp never actually saw happen, rather than guessing.
    const created = await prisma.playLog.create({
      data: { gameId, startedAt: now, finishedAt: now, startPlaytimeMinutes: finishPlaytimeMinutes, finishPlaytimeMinutes },
    });
    return [{ startedAt: created.startedAt, finishedAt: now }];
  }

  return [];
}
