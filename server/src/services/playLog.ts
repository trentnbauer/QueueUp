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
    const open = await prisma.playLog.findFirst({ where: { gameId, finishedAt: null } });
    if (!open) {
      await prisma.playLog.create({ data: { gameId, startedAt: new Date() } });
    }
    return;
  }

  if (newStatus === 'done' || newStatus === 'dropped') {
    const open = await prisma.playLog.findFirst({ where: { gameId, finishedAt: null }, orderBy: { startedAt: 'desc' } });
    if (open) {
      await prisma.playLog.update({ where: { id: open.id }, data: { finishedAt: new Date() } });
    } else {
      // Jumped straight to Done/Dropped without ever passing through Playing - still worth a
      // record, even though the real start date is unknown; same start/finish timestamp reads as
      // "logged after the fact" rather than a genuine multi-day playthrough.
      const now = new Date();
      await prisma.playLog.create({ data: { gameId, startedAt: now, finishedAt: now } });
    }
  }
}
