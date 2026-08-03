import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { ConcreteSpinWheelTheme, Game, RoomSpinSession } from '@queueup/shared';
import {
  spinCandidates,
  buildSpinStrip,
  resolveConcreteTheme,
  SPIN_INITIAL_VELOCITY,
  settlesAtOf,
  settledPositionOf,
  applyNudge,
  type SpinBase,
} from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoom } from '../services/roomAccess.js';
import { gameInclude, serializeGames } from '../services/gameSerializer.js';
import { unlockBadges } from '../services/badges.js';

// A spin nobody's touched in this long is treated as abandoned (someone started it, then closed
// their laptop) rather than wedging the room forever - the next GET after this window just
// reports "no active spin" and lazily clears the row. Comfortably longer than any real "let's
// decide what to play" conversation, short enough not to survive to the next session.
const SPIN_STALE_MS = 15 * 60 * 1000;

// Issue #420: a brand-new spin's physics don't actually start moving until this long after
// `start` - just delaying timestamp0 into the future, no new state needed (positionAt/velocityAt
// already clamp elapsed time to 0 before it, so the reel simply hasn't begun yet - see
// spinPhysics.ts). Gives everyone currently looking at the room a "get ready" beat before it's
// already spinning, instead of whoever clicked "Pick a Game" seeing motion nobody else had a
// chance to notice starting. Any member can skip the rest of it early (see /spin/skip-wait) -
// "waiting for members" isn't gatekept to just the person who started it. Not applied to
// "restart"/Spin again - everyone's already gathered by then.
//
// Issue #488: was 4s, which wasn't long enough for everyone in a room to actually notice the
// notification and get to the spin before it was already moving - bumped to 30s, paired with the
// readyUserIds count below so the wait actually shows who's shown up instead of counting down blind.
const SPIN_WAITING_ROOM_MS = 30_000;

function isStale(spin: { updatedAt: Date }): boolean {
  return Date.now() - spin.updatedAt.getTime() > SPIN_STALE_MS;
}

type RoomSpinRow = Awaited<ReturnType<typeof prisma.roomSpin.findUniqueOrThrow>>;

/** Builds a fresh candidate strip (and, if the room's theme setting is "random," a fresh concrete
 * theme) from the room's *current* backlog - re-read from the DB on every call (start and
 * "restart"/Spin again both call this) rather than trusting anything the caller already had
 * loaded, so a fresh spin always draws from up-to-date votes/ownership/prices. A nudge does NOT
 * call this - it moves along the *existing* strip, it never rebuilds one (see RoomSpin's schema
 * doc). */
async function buildStripAndTheme(roomId: string, userId: string): Promise<{ stripGameIds: string[]; theme: ConcreteSpinWheelTheme }> {
  const room = await getRoom(roomId);
  const rows = await prisma.game.findMany({ where: { roomId, archivedAt: null }, include: gameInclude });
  const games = await serializeGames(rows, userId);
  const candidates = spinCandidates(games, room.spinOwnershipMaxPrice);
  const strip = buildSpinStrip(games, candidates, Math.random);
  if (strip.length === 0) throw new HttpError(400, 'No backlog game is eligible for Spin the Wheel right now');
  return { stripGameIds: strip.map((g) => g.id), theme: resolveConcreteTheme(room.spinWheelTheme) };
}

/** Fetches every game referenced by `stripGameIds` (deduped) and re-expands them back into strip
 * order - a strip commonly repeats the same higher-weighted candidate many times over, so this is
 * one query regardless of how "dense" any one candidate's slots are, not one per slot. Returns
 * null if any strip game no longer exists (deleted mid-spin, e.g. someone removed it from the
 * backlog while the room was actively spinning on it) - callers treat that the same as an
 * expired spin, since there's no coherent strip left to point a position at. */
async function hydrateStrip(stripGameIds: string[], userId: string): Promise<Game[] | null> {
  const uniqueIds = [...new Set(stripGameIds)];
  const rows = await prisma.game.findMany({ where: { id: { in: uniqueIds } }, include: gameInclude });
  if (rows.length !== uniqueIds.length) return null;
  const serialized = await serializeGames(rows, userId);
  const byId = new Map(serialized.map((g) => [g.id, g]));
  return stripGameIds.map((id) => {
    const game = byId.get(id);
    // Every id in stripGameIds came from `rows`/`serialized` above (uniqueIds is derived from the
    // same array) - always found in practice, this just satisfies the type without a non-null
    // assertion.
    if (!game) throw new Error(`Strip game ${id} missing from hydrated set`);
    return game;
  });
}

// The DB column reuses the room's own SpinWheelTheme enum (which includes 'random'), but a
// RoomSpin row is only ever written with resolveConcreteTheme's output - this narrows that back
// to the concrete-only type RoomSpinSession promises callers.
async function toSpinDto(spin: RoomSpinRow, userId: string): Promise<RoomSpinSession | null> {
  const strip = await hydrateStrip(spin.stripGameIds, userId);
  if (!strip) return null;
  return {
    id: spin.id,
    theme: spin.theme as ConcreteSpinWheelTheme,
    strip,
    position0: spin.position0,
    velocity0: spin.velocity0,
    timestamp0: spin.timestamp0.toISOString(),
    settlesAt: spin.settlesAt.toISOString(),
    settledPosition: spin.settledPosition,
    nudgeCount: spin.nudgeCount,
    // Deduped defensively (issue #488) - two concurrent polls from the same member racing past the
    // "already in readyUserIds" check below could in principle both push, and this is cheap
    // insurance against ever double-counting one member rather than something expected to matter
    // in practice.
    readyCount: new Set(spin.readyUserIds).size,
  };
}

function freshBase(now: number, startDelayMs = 0): SpinBase {
  return { position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: now + startDelayMs };
}

/** The room's shared Spin the Wheel session (issue #356 follow-up: click the left/right side of
 * the spin to slow it down/speed it up and change where it lands - "shake to nudge," visible to
 * every member currently viewing the room, not just whoever clicked "Pick a Game"). See RoomSpin
 * in schema.prisma and spinPhysics.ts in packages/shared for why the strip/physics live here
 * rather than per-client. */
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
    const dto = await toSpinDto(spin, userId);
    if (!dto) {
      await prisma.roomSpin.deleteMany({ where: { id: spin.id } });
      return { spin: null };
    }
    return { spin: dto };
  });

  // Issue #488: marks the caller "ready" for the still-waiting spin's readyCount, deliberately its
  // own endpoint rather than piggybacked on the GET above - the GET is polled continuously by
  // useRoomSpin the whole time a room is open (so its button/badge can react to a fresh spin),
  // regardless of whether anyone actually has the modal open, so counting every GET would really
  // just be counting "members with this room open at all," not "members who've got Spin the Wheel
  // open and are watching it." This is only ever called from inside the modal itself (see
  // SpinWheelModal's mount effect), so a ready count actually reflects who showed up.
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/ready',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      let spin = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!spin || isStale(spin)) throw new HttpError(404, 'No active spin');

      let justMarkedReady = false;
      if (Date.now() < spin.timestamp0.getTime() && !spin.readyUserIds.includes(userId)) {
        spin = await prisma.roomSpin.update({ where: { roomId }, data: { readyUserIds: { push: userId } } });
        justMarkedReady = true;
      }

      const dto = await toSpinDto(spin, userId);
      if (!dto) throw new HttpError(404, 'No active spin');
      const unlockedBadges = justMarkedReady ? await unlockBadges(userId, ['first_spin_ready']) : [];
      return { spin: dto, unlockedBadges };
    },
  );

  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/start',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      const { stripGameIds, theme } = await buildStripAndTheme(roomId, userId);
      const base = freshBase(Date.now(), SPIN_WAITING_ROOM_MS);
      try {
        const spin = await prisma.roomSpin.create({
          data: {
            roomId,
            theme,
            stripGameIds,
            position0: base.position0,
            velocity0: base.velocity0,
            timestamp0: new Date(base.timestamp0),
            settlesAt: new Date(settlesAtOf(base)),
            settledPosition: settledPositionOf(base),
            startedBy: userId,
            // Issue #488: whoever clicked "Pick a Game" obviously has it open - count them as
            // ready immediately rather than waiting for their own next poll to add them.
            readyUserIds: [userId],
          },
        });
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

  // Issue #420: collapses the remaining "waiting for members" delay (see SPIN_WAITING_ROOM_MS) so
  // the spin starts moving right now instead - any member currently seeing the waiting room can
  // call this, not just whoever clicked "Pick a Game". A no-op (just returns the current state)
  // once the spin has already started moving, so a stray double-click or a race with the wait
  // naturally expiring can't do anything unexpected.
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/skip-wait',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      const spin = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!spin || isStale(spin)) throw new HttpError(404, 'No active spin');

      const now = Date.now();
      if (now >= spin.timestamp0.getTime()) {
        const dto = await toSpinDto(spin, userId);
        if (!dto) throw new HttpError(404, 'No active spin');
        return { spin: dto };
      }

      const base: SpinBase = { position0: spin.position0, velocity0: spin.velocity0, timestamp0: now };
      const updated = await prisma.roomSpin.update({
        where: { roomId },
        data: {
          timestamp0: new Date(now),
          settlesAt: new Date(settlesAtOf(base)),
          settledPosition: settledPositionOf(base),
        },
      });
      const dto = await toSpinDto(updated, userId);
      if (!dto) throw new HttpError(404, 'No active spin');
      return { spin: dto };
    },
  );

  app.post<{ Params: { roomId: string }; Body: { direction: 'left' | 'right' } }>(
    '/api/rooms/:roomId/spin/nudge',
    // A real click-mashing session can rack up a lot of nudges quickly - well above the 30/min
    // used for the occasional start/restart/close actions, but still bounded.
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      const { direction } = request.body;
      if (direction !== 'left' && direction !== 'right') throw new HttpError(400, 'direction must be "left" or "right"');
      await requireMembership(roomId, userId);

      const spin = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!spin || isStale(spin)) throw new HttpError(404, 'No active spin to nudge');

      const now = Date.now();
      if (now >= spin.settlesAt.getTime()) throw new HttpError(409, 'This spin has already settled');

      const currentBase: SpinBase = { position0: spin.position0, velocity0: spin.velocity0, timestamp0: spin.timestamp0.getTime() };
      const nudged = applyNudge(currentBase, now, direction);
      // Issue #487's spam-click guard rejected this one (arrived within SPIN_NUDGE_COOLDOWN_MS of
      // the last accepted nudge) - applyNudge signals that by returning currentBase itself
      // unchanged. Return the current state as-is rather than writing/broadcasting a no-op, so
      // nudgeCount only ever bumps for a nudge that actually moved the spin.
      if (nudged === currentBase) {
        const dto = await toSpinDto(spin, userId);
        if (!dto) throw new HttpError(404, 'No active spin to nudge');
        return { spin: dto };
      }
      const updated = await prisma.roomSpin.update({
        where: { roomId },
        data: {
          position0: nudged.position0,
          velocity0: nudged.velocity0,
          timestamp0: new Date(nudged.timestamp0),
          settlesAt: new Date(settlesAtOf(nudged)),
          settledPosition: settledPositionOf(nudged),
          nudgeCount: { increment: 1 },
        },
      });
      const dto = await toSpinDto(updated, userId);
      if (!dto) throw new HttpError(404, 'No active spin to nudge');
      return { spin: dto };
    },
  );

  // "Spin again," post-settle - resets an *existing* row to a freshly-built strip and a fresh
  // physics base, same as start but requires a row to already be there (a room with no spin at
  // all should call start, not this).
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/restart',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      const existing = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!existing) throw new HttpError(404, 'No spin to restart - start one first');

      const { stripGameIds, theme } = await buildStripAndTheme(roomId, userId);
      const base = freshBase(Date.now());
      const spin = await prisma.roomSpin.update({
        where: { roomId },
        data: {
          theme,
          stripGameIds,
          position0: base.position0,
          velocity0: base.velocity0,
          timestamp0: new Date(base.timestamp0),
          settlesAt: new Date(settlesAtOf(base)),
          settledPosition: settledPositionOf(base),
          nudgeCount: 0,
          // "Spin again" has no waiting room of its own (see SPIN_WAITING_ROOM_MS's doc) - cleared
          // rather than left over from the previous spin's waiting window, which nothing here reads.
          readyUserIds: [],
        },
      });
      return { spin: await toSpinDto(spin, userId) };
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
