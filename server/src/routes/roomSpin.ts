import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { ActiveRoomSpin, ConcreteSpinWheelTheme, Game, RoomSpinSession, SpinPlayAction, StoredPlay } from '@queueup/shared';
import {
  advancePlay,
  applyPlayAction,
  avoidedGenres,
  isPending,
  isPlayMode,
  pendingPlay,
  playSettlesAt,
  publicPlay,
  PlayActionError,
  spinCandidateWeight,
  spinCandidates,
  buildSpinStrip,
  resolveConcreteTheme,
  SPIN_INITIAL_VELOCITY,
  settlesAtOf,
  settledPositionOf,
  candidateIndexAt,
  type SpinBase,
} from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership, getRoom } from '../services/roomAccess.js';
import { gameInclude, serializeGames } from '../services/gameSerializer.js';
import { unlockBadges } from '../services/badges.js';
import { logRoomActivity } from '../services/roomActivity.js';
import { applySpinFilters, parseSpinFilters, type SpinFilters } from '../services/spinFilters.js';
import { SPIN_WHEEL_THEMES, type SpinWheelTheme } from '@queueup/shared';

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
// a voted respin - everyone's already gathered by then.
//
// Issue #488: was 4s, which wasn't long enough for everyone in a room to actually notice the
// notification and get to the spin before it was already moving - bumped to 30s, paired with the
// readyUserIds count below so the wait actually shows who's shown up instead of counting down blind.
const SPIN_WAITING_ROOM_MS = 30_000;

function isStale(spin: { updatedAt: Date }): boolean {
  return Date.now() - spin.updatedAt.getTime() > SPIN_STALE_MS;
}

type RoomSpinRow = Awaited<ReturnType<typeof prisma.roomSpin.findUniqueOrThrow>>;

/** Builds a fresh round from the room's *current* backlog - re-read from the DB on every call
 * (start and a voted respin both call this) rather than trusting anything the caller already had
 * loaded, so a fresh spin always draws from up-to-date votes/ownership/prices. Resolves "random" to
 * a mode. The reel gets its weighted strip; every other mode gets its weighted pool (dealt once the
 * waiting room closes - see spinModes.ts), and stripGameIds then lists the pool's games so the
 * session can hand clients their details. */
async function buildRound(
  roomId: string,
  userId: string,
  filters: SpinFilters = {},
): Promise<{ stripGameIds: string[]; theme: ConcreteSpinWheelTheme; modeState: StoredPlay | null }> {
  const room = await getRoom(roomId);
  const rows = await prisma.game.findMany({ where: { roomId, archivedAt: null }, include: gameInclude });
  const games = await serializeGames(rows, userId);
  const candidates = applySpinFilters(spinCandidates(games, room.spinOwnershipMaxPrice), filters);
  if (candidates.length === 0) throw new HttpError(400, 'No backlog game is eligible for Spin the Wheel right now');
  // Rooms still on a retired theme (crate, card_flip) only ever saw the reel.
  const setting = (SPIN_WHEEL_THEMES as string[]).includes(room.spinWheelTheme) ? (room.spinWheelTheme as SpinWheelTheme) : 'reel';
  const theme = resolveConcreteTheme(setting);
  if (isPlayMode(theme)) {
    const avoided = avoidedGenres(games);
    const pending = pendingPlay(theme, candidates.map((g) => ({ gameId: g.id, weight: spinCandidateWeight(g, avoided) })), Math.random);
    return { stripGameIds: pending.pool.map((c) => c.gameId), theme, modeState: pending };
  }
  const strip = buildSpinStrip(games, candidates, Math.random);
  return { stripGameIds: strip.map((g) => g.id), theme, modeState: null };
}

/** The round's stored mode state, or null for the reel (and for a row from before spin modes). */
function storedPlay(spin: RoomSpinRow): StoredPlay | null {
  return (spin.modeState as StoredPlay | null) ?? null;
}

/** settlesAt/settledPosition for a round starting from `base`: the reel's physics, or the mode's
 * reveal time (far off until it's decided). */
function settleFields(modeState: StoredPlay | null, base: SpinBase): { settlesAt: Date; settledPosition: number } {
  if (modeState) return { settlesAt: new Date(playSettlesAt(modeState, base.timestamp0)), settledPosition: 0 };
  return { settlesAt: new Date(settlesAtOf(base)), settledPosition: settledPositionOf(base) };
}

/** Brings a mode's round up to now (deals once the waiting room closes, runs out timers - see
 * advancePlay) and saves it. Only saves if nobody else saved first; if someone did, theirs is just
 * as valid, so it's re-read rather than overwritten. */
async function syncPlay(spin: RoomSpinRow): Promise<RoomSpinRow> {
  const stored = storedPlay(spin);
  if (!stored) return spin;
  const startAt = spin.timestamp0.getTime();
  const next = advancePlay(stored, Date.now(), startAt, [...new Set(spin.readyUserIds)], Math.random);
  if (next === stored) return spin;
  await prisma.roomSpin.updateMany({
    where: { id: spin.id, updatedAt: spin.updatedAt },
    data: { modeState: next as unknown as Prisma.InputJsonValue, settlesAt: new Date(playSettlesAt(next, startAt)) },
  });
  return (await prisma.roomSpin.findUnique({ where: { id: spin.id } })) ?? spin;
}

/** The game a settled round landed on, or null while it's still running. */
function winnerGameIdOf(spin: RoomSpinRow): string | null {
  if (Date.now() < spin.settlesAt.getTime()) return null;
  const stored = storedPlay(spin);
  if (stored) return isPending(stored) ? null : stored.winnerId;
  if (spin.stripGameIds.length === 0) return null;
  return spin.stripGameIds[candidateIndexAt(spin.settledPosition, spin.stripGameIds.length)] ?? null;
}

/** Validates a member's move from the request body. */
function parseAction(body: unknown): SpinPlayAction {
  const b = (body ?? {}) as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
  const id = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 100 ? v : '');
  switch (b.type) {
    case 'vote':
      return { type: 'vote', card: int(b.card) };
    case 'stake':
      return { type: 'stake', bin: int(b.bin) };
    case 'ban':
      return { type: 'ban', gameId: id(b.gameId) };
    case 'shield':
      return { type: 'shield', gameId: id(b.gameId) };
    case 'drop':
      return { type: 'drop', x: typeof b.x === 'number' ? b.x : NaN };
    case 'flip':
      return { type: 'flip', tile: int(b.tile) };
    default:
      throw new HttpError(400, 'Unknown move');
  }
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
// to the concrete-only type RoomSpinSession promises callers. A row with no mode state is the reel,
// whatever its theme says (rows from before spin modes said "slot" and drew the reel).
async function toSpinDto(spin: RoomSpinRow, userId: string): Promise<RoomSpinSession | null> {
  const strip = await hydrateStrip(spin.stripGameIds, userId);
  if (!strip) return null;
  const stored = storedPlay(spin);
  return {
    id: spin.id,
    theme: stored ? (spin.theme as ConcreteSpinWheelTheme) : 'reel',
    play: stored && !isPending(stored) ? publicPlay(stored) : null,
    serverNow: new Date().toISOString(),
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
    respinVotes: new Set(spin.respinVoteUserIds).size,
    respinNeeded: respinVotesNeeded(spin),
    youVotedRespin: spin.respinVoteUserIds.includes(userId),
  };
}

/** Votes it takes to respin: more than half of the spin's participants - everyone who joined its
 * waiting room, plus anyone who has voted since. One person spinning alone respins on their own vote. */
function respinVotesNeeded(spin: { readyUserIds: string[]; respinVoteUserIds: string[] }): number {
  const participants = new Set([...spin.readyUserIds, ...spin.respinVoteUserIds]);
  return Math.floor(Math.max(1, participants.size) / 2) + 1;
}

function freshBase(now: number, startDelayMs = 0): SpinBase {
  return { position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: now + startDelayMs };
}

/** The room's shared Spin the Wheel session - one spin every member currently viewing the
 * room watches together, not just whoever clicked "Pick a Game". Nobody can steer it once it's
 * moving; an unpopular result is redone by a majority respin vote. See RoomSpin
 * in schema.prisma and spinPhysics.ts in packages/shared for why the strip/physics live here
 * rather than per-client. */
export default async function roomSpinRoutes(app: FastifyInstance) {
  // Issue #555: the cross-room counterpart to the GET below - that one's polled fast (700ms/3s,
  // see useRoomSpin.ts) but only by whoever already has one specific room open. This is polled
  // fast too, but across every room the caller is in at once, specifically so someone who *isn't*
  // looking at the room a spin just started in still finds out before its pre-start waiting window
  // (SPIN_WAITING_ROOM_MS) closes - see useActiveRoomSpinToasts.ts on the frontend. Payload stays
  // minimal (no strip/physics) since this runs far more often, across more rooms, than the
  // per-room GET ever does for a single member.
  // max is generous relative to this route's own 2s poll cadence (useActiveRoomSpinToasts.ts) -
  // bug fix (issue #562): rate limiting here (like everywhere in this app - see app.ts) keys by
  // IP, not by session/account, and this is a self-hosted app built for a friend group that may
  // well share one household's IP. At 30 req/min per open tab, the original max: 120 left room for
  // only ~4 concurrent tabs across everyone behind that IP before requests silently started
  // 429ing (useActiveRoomSpinToasts.ts has no error handling, so a 429 just leaves the popup
  // quietly broken with no visible sign anything's wrong). 450 covers a full household each with a
  // few tabs open, with margin.
  app.get('/api/rooms/active-spins', { config: { rateLimit: { max: 450, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();

    const spins = await prisma.roomSpin.findMany({
      where: {
        timestamp0: { gt: new Date() },
        room: { members: { some: { userId } } },
      },
      select: { id: true, roomId: true, room: { select: { name: true } } },
    });

    const result: ActiveRoomSpin[] = spins.map((s) => ({ spinId: s.id, roomId: s.roomId, roomName: s.room.name }));
    return { spins: result };
  });

  // Same tier as /api/rooms/active-spins above (issue #562) - polled at up to 700ms while a spin
  // is in-flight (useRoomSpin.ts's ACTIVE_POLL_MS), which a per-IP limit (see app.ts) can only
  // cover a couple of concurrent tabs behind one household IP at the global default before 429ing.
  app.get<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin',
    { config: { rateLimit: { max: 450, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      let spin = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!spin || isStale(spin)) {
        if (spin) await prisma.roomSpin.deleteMany({ where: { id: spin.id } });
        return { spin: null };
      }
      spin = await syncPlay(spin);
      const dto = await toSpinDto(spin, userId);
      if (!dto) {
        await prisma.roomSpin.deleteMany({ where: { id: spin.id } });
        return { spin: null };
      }
      return { spin: dto };
    },
  );

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
        // Everyone's here: end the waiting room now instead of sitting out the rest of the timer.
        const memberCount = await prisma.roomMember.count({ where: { roomId } });
        const now = Date.now();
        if (new Set(spin.readyUserIds).size >= memberCount && now < spin.timestamp0.getTime()) {
          const base: SpinBase = { position0: spin.position0, velocity0: spin.velocity0, timestamp0: now };
          spin = await prisma.roomSpin.update({
            where: { roomId },
            data: { timestamp0: new Date(now), ...settleFields(storedPlay(spin), base) },
          });
        }
      }
      spin = await syncPlay(spin);

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

      const filters = parseSpinFilters(request.body);
      const { stripGameIds, theme, modeState } = await buildRound(roomId, userId, filters);
      // Nobody else to wait for when you're the room's only member - spin straight away.
      const memberCount = await prisma.roomMember.count({ where: { roomId } });
      const base = freshBase(Date.now(), memberCount > 1 ? SPIN_WAITING_ROOM_MS : 0);
      // A stale session left over from an earlier spin would otherwise block this create (one spin
      // per room) until something else happened to clean it up.
      const leftover = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (leftover && isStale(leftover)) await prisma.roomSpin.deleteMany({ where: { id: leftover.id } });
      try {
        const spin = await prisma.roomSpin.create({
          data: {
            roomId,
            theme,
            stripGameIds,
            position0: base.position0,
            velocity0: base.velocity0,
            timestamp0: new Date(base.timestamp0),
            ...settleFields(modeState, base),
            modeState: modeState ? (modeState as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            startedBy: userId,
            // Issue #488: whoever clicked "Pick a Game" obviously has it open - count them as
            // ready immediately rather than waiting for their own next poll to add them.
            readyUserIds: [userId],
            filters: filters as Prisma.InputJsonValue,
          },
        });
        reply.status(201);
        return { spin: await toSpinDto(await syncPlay(spin), userId) };
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
        data: { timestamp0: new Date(now), ...settleFields(storedPlay(spin), base) },
      });
      const dto = await toSpinDto(await syncPlay(updated), userId);
      if (!dto) throw new HttpError(404, 'No active spin');
      return { spin: dto };
    },
  );

  // A member's move in a spin mode: a vote, a chip, a ban, a shield, a claw drop or a tile flip
  // (see SpinPlayAction). The round is brought up to date first, so a move lands after any timer
  // that ran out before it. Saved only if nobody else saved in between; otherwise it's retried on
  // the fresh state, so two members acting at once can't overwrite each other.
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/action',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);
      const action = parseAction(request.body);

      for (let attempt = 0; attempt < 4; attempt++) {
        const found = await prisma.roomSpin.findUnique({ where: { roomId } });
        if (!found || isStale(found)) throw new HttpError(404, 'No active spin');
        const spin = await syncPlay(found);
        const stored = storedPlay(spin);
        if (!stored) throw new HttpError(409, "This spin doesn't take moves");
        if (isPending(stored)) throw new HttpError(409, "The round hasn't started yet");
        let next;
        try {
          next = applyPlayAction(stored, userId, action, Date.now(), Math.random);
        } catch (err) {
          if (err instanceof PlayActionError) throw new HttpError(409, err.message);
          throw err;
        }
        const saved = await prisma.roomSpin.updateMany({
          where: { id: spin.id, updatedAt: spin.updatedAt },
          data: { modeState: next as unknown as Prisma.InputJsonValue, settlesAt: new Date(playSettlesAt(next, spin.timestamp0.getTime())) },
        });
        if (saved.count === 0) continue;
        const dto = await toSpinDto(await prisma.roomSpin.findUniqueOrThrow({ where: { id: spin.id } }), userId);
        if (!dto) throw new HttpError(404, 'No active spin');
        return { spin: dto };
      }
      throw new HttpError(409, 'Busy - try that again');
    },
  );

  // Vote to respin a settled result. In a room nobody steers the wheel or rerolls it alone (the old
  // click-to-nudge and "Spin again" are gone): once a majority of the spin's participants
  // (respinVotesNeeded) have voted, it respins from the same filters, straight away - everyone is
  // already here, so there's no waiting room.
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/spin/respin-vote',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);

      let spin = await prisma.roomSpin.findUnique({ where: { roomId } });
      if (!spin || isStale(spin)) throw new HttpError(404, 'No spin to respin');
      spin = await syncPlay(spin);
      if (Date.now() < spin.settlesAt.getTime()) throw new HttpError(409, 'Wait for the wheel to stop first');

      if (!spin.respinVoteUserIds.includes(userId)) {
        spin = await prisma.roomSpin.update({ where: { roomId }, data: { respinVoteUserIds: { push: userId } } });
      }

      if (new Set(spin.respinVoteUserIds).size >= respinVotesNeeded(spin)) {
        const { stripGameIds, theme, modeState } = await buildRound(roomId, userId, parseSpinFilters(spin.filters));
        const base = freshBase(Date.now());
        // Conditional on the row being unchanged since the votes were counted, so two final votes
        // landing together respin once, not twice.
        const respun = await prisma.roomSpin.updateMany({
          where: { roomId, updatedAt: spin.updatedAt },
          data: {
            theme,
            stripGameIds,
            position0: base.position0,
            velocity0: base.velocity0,
            timestamp0: new Date(base.timestamp0),
            ...settleFields(modeState, base),
            modeState: modeState ? (modeState as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            nudgeCount: 0,
            respinVoteUserIds: [],
          },
        });
        if (respun.count > 0) {
          void logRoomActivity({ roomId, actorId: null, type: 'spin_result', message: () => 'The room voted to respin the wheel' });
        }
        spin = await syncPlay(await prisma.roomSpin.findUniqueOrThrow({ where: { roomId } }));
      }

      const dto = await toSpinDto(spin, userId);
      if (!dto) throw new HttpError(404, 'No spin to respin');
      return { spin: dto };
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

      // Jackpot (issue: "what other achievements can you think of") - the winner is a pure read
      // from data already on the row (see RoomSpin.settledPosition's schema doc: `stripGameIds[
      // candidateIndexAt(settledPosition, stripGameIds.length)]`), so this needs no input from the
      // client beyond "commit to whatever already settled" - it can't be spoofed by claiming a
      // different winner than the one every member's own client independently computed from the
      // same snapshot. Credited to the winning game's *adder*, not whoever happens to click "Let's
      // play" - "a game you added got picked" is the actual achievement; clicking the confirm
      // button isn't. That means the credited user often isn't the caller, so this deliberately
      // doesn't return unlockedBadges for a toast (same reasoning as Promoted in rooms.ts) - it
      // still lands for real, just silently, and shows up next time that person checks /achievements.
      const found = await prisma.roomSpin.findUnique({ where: { roomId } });
      const spin = found ? await syncPlay(found) : null;
      const winnerGameId = spin ? winnerGameIdOf(spin) : null;
      if (spin && winnerGameId) {
        // Absent if the winning game was removed mid-spin (see stripGameIds' own schema doc on
        // this exact edge case) - nothing to credit in that case, not an error.
        const winnerGame = winnerGameId
          ? await prisma.game.findUnique({ where: { id: winnerGameId }, select: { addedBy: true, title: true } })
          : null;
        if (winnerGame) await unlockBadges(winnerGame.addedBy, ['first_spin_winner']);
        // Room activity feed (issue #509) - credited to whoever committed ("Let's play"), unlike
        // the Jackpot badge above which credits the winning game's adder - the feed is a log of
        // what happened in the room, not an achievement, so "who clicked confirm" is the right actor.
        void logRoomActivity({
          roomId,
          actorId: userId,
          type: 'spin_result',
          message: (actorName) =>
            winnerGame ? `${actorName} spun and landed on "${winnerGame.title}"` : `${actorName} committed to a spin result`,
        });
      }

      await prisma.roomSpin.deleteMany({ where: { roomId } });
      reply.status(204);
      return null;
    },
  );
}
