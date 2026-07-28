import type { GameStatus } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Opens or closes a play journal entry for one game's status transition (issue #361) - see the
 * PlayLog model doc for why this exists separately from Game.status. Scoped to the interactive
 * status-change entry points a user actually triggers (the single/bulk status routes, and the
 * shelf-sync-Beaten action) - not every server-side path that can touch status (Steam import,
 * automated completion detection, admin actions), which would be a much larger audit trail than
 * this issue asked for. */
export async function recordStatusTransition(gameId: string, previousStatus: GameStatus, newStatus: GameStatus): Promise<void> {
  if (previousStatus === newStatus) return;

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
      await prisma.playLog.create({ data: { gameId, startedAt: new Date() } });
    }
    return;
  }

  if (newStatus === 'done' || newStatus === 'dropped') {
    // updateMany (not findFirst + update on just the newest one) closes every currently-open
    // entry for this game at once - self-healing the rare duplicate-open-entry race described
    // above, rather than leaving an older duplicate stuck open forever.
    const now = new Date();
    const closed = await prisma.playLog.updateMany({ where: { gameId, finishedAt: null }, data: { finishedAt: now } });
    if (closed.count === 0) {
      // Jumped straight to Done/Dropped without ever passing through Playing - still worth a
      // record, even though the real start date is unknown; same start/finish timestamp reads as
      // "logged after the fact" rather than a genuine multi-day playthrough.
      await prisma.playLog.create({ data: { gameId, startedAt: now, finishedAt: now } });
    }
  }
}
