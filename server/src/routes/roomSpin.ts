import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { ConcreteSpinWheelTheme, RoomSpinSession } from '@queueup/shared';
import { spinCandidates, pickSpinWinner, resolveConcreteTheme } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoom } from '../services/roomAccess.js';
import { gameInclude, serializeGame, serializeGames } from '../services/gameSerializer.js';

// A spin nobody's touched in this long is treated as abandoned (someone started it, then closed
// their laptop) rather than wedging the room forever - the next GET after this window just
// reports "no active spin" and lazily clears the row. Comfortably longer than any real "let's
// decide what to play" conversation, short enough not to survive to the next session.
const SPIN_STALE_MS = 15 * 60 * 1000;

function isStale(spin: { updatedAt: Date }): boolean {
  return Date.now() - spin.updatedAt.getTime() > SPIN_STALE_MS;
}

/** Picks a fresh winner (and, if the room's theme setting is "random", a fresh concrete theme)
 * from the room's *current* backlog - re-read from the DB on every call (start, and every shake)
 * rather than trusting whatever the caller already had loaded, so a shake always draws from
 * up-to-date votes/ownership/prices instead of whatever was true whenever the spin first opened. */
async function pickWinnerAndTheme(roomId: string, userId: string) {
  const room = await getRoom(roomId);
  const rows = await prisma.game.findMany({ where: { roomId, archivedAt: null }, include: gameInclude });
  const games = await serializeGames(rows, userId);
  const candidates = spinCandidates(games, room.spinOwnershipMaxPrice);
  const winner = pickSpinWinner(games, candidates);
  if (!winner) throw new HttpError(400, 'No backlog game is eligible for Spin the Wheel right now');
  return { winnerGameId: winner.id, theme: resolveConcreteTheme(room.spinWheelTheme) };
}

// The DB column reuses the room's own SpinWheelTheme enum (which includes 'random'), but a
// RoomSpin row is only ever written with resolveConcreteTheme's output (start/shake below) - this
// narrows that back to the concrete-only type RoomSpinSession promises callers.
async function toSpinDto(
  spin: { id: string; winnerGameId: string; theme: string; shakeCount: number },
  userId: string,
): Promise<RoomSpinSession> {
  const winnerRow = await prisma.game.findUniqueOrThrow({ where: { id: spin.winnerGameId }, include: gameInclude });
  return {
    id: spin.id,
    theme: spin.theme as ConcreteSpinWheelTheme,
    shakeCount: spin.shakeCount,
    winner: await serializeGame(winnerRow, userId),
  };
}

/** The room's shared Spin the Wheel session (issue #356 follow-up: "shake to reroll," visible to
 * every member currently viewing the room, not just whoever clicked "Pick a Game"). See RoomSpin
 * in schema.prisma for why the winner/theme are picked here rather than per-client. */
export default async function roomSpinRoutes(app: FastifyInstance) {
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/spin', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const spin = await prisma.roomSpin.findUnique({ where: { roomId } });
    if (!spin || isStale(spin)) {
      if (spin) await prisma.roomSpin.deleteMany({ where: { id: spin.id } });
      return { spin: null };
    }
    return { spin: await toSpinDto(spin, userId) };
  });

  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/start',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      const { winnerGameId, theme } = await pickWinnerAndTheme(roomId, userId);
      try {
        const spin = await prisma.roomSpin.create({ data: { roomId, winnerGameId, theme, startedBy: userId } });
        reply.status(201);
        return { spin: await toSpinDto(spin, userId) };
      } catch (err) {
        // Someone else's "Pick a Game" click won the race (unique roomId) - join their session
        // instead of erroring, same idea as the concurrent-suggestion-approve fix (#421).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const existing = await prisma.roomSpin.findUnique({ where: { roomId } });
          if (existing && !isStale(existing)) return { spin: await toSpinDto(existing, userId) };
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/shake',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      const { winnerGameId, theme } = await pickWinnerAndTheme(roomId, userId);
      try {
        const spin = await prisma.roomSpin.update({
          where: { roomId },
          data: { winnerGameId, theme, shakeCount: { increment: 1 } },
        });
        return { spin: await toSpinDto(spin, userId) };
      } catch (err) {
        // The spin was already committed/expired out from under this shake (P2025) - nothing left
        // to reroll; the caller's next GET will see it's gone and close its modal.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new HttpError(404, 'No active spin to shake');
        }
        throw err;
      }
    },
  );

  // Ends the shared session for every member once a winner's actually been committed to ("Let's
  // play") - deliberately not exposed as a plain "close," which is local/per-viewer only (see
  // RoomSpin's schema doc): dismissing the modal shouldn't yank it out from under someone else
  // still deciding. Idempotent (P2025-safe) since more than one member can hit "Let's play" on the
  // same spin at once.
  app.delete<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      await prisma.roomSpin.deleteMany({ where: { roomId } });
      reply.status(204);
      return null;
    },
  );
}
