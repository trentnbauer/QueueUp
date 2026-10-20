import { createLobbyGame, type LobbyGame, type LobbyGameId } from '@queueup/shared';
import { describe, expect, it } from 'vitest';
import { SOLO_DELAY_MS, SpinLobby } from './spinLobby.js';

const FRAME = 1000 / 60;

/** A practice lobby and a device's own copy of the run, the way ClientSim plays one: the device starts the run from the seed and start
 * time the server sends, steps in fixed steps, and sends each press with when in its run it was made, `latency` ms before it arrives. */
function play(game: LobbyGameId, seed: number, latency: number, press: (copy: LobbyGame, me: string) => { input?: [number, number]; action?: string; tap?: number } | null, seconds: number) {
  let s = seed;
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lobby = new SpinLobby(createLobbyGame(game), undefined, undefined, true);
  // The game made by createLobbyGame takes its seeds from the system; for a repeatable run, use the seed it announces.
  lobby.join('me');
  const copy = createLobbyGame(game);
  copy.join('me');
  const inbox: { at: number; send: () => void }[] = [];
  let startAt: number | null = null;
  let started = -1;
  let seen = null as { run: number; seed: number } | null;
  const log: { t: number; local: boolean; server: boolean }[] = [];
  for (let t = 0; t < seconds * 1000; t += FRAME) {
    const snap = lobby.snapshot(false, t);
    if (snap.sim && seen?.run !== snap.sim.run) {
      seen = { run: snap.sim.run, seed: snap.sim.seed };
      startAt = t + snap.sim.startInMs;
    }
    if (seen && startAt !== null && started !== seen.run && t >= startAt) {
      copy.startRunAt?.(seen.seed);
      started = seen.run;
    }
    if (started === seen?.run && startAt !== null) {
      while ((copy.runMs ?? 0) + FRAME <= t - startAt) copy.stepRun?.(1 / 60);
      const want = press(copy, 'me');
      if (want?.input) {
        const [dx, dy] = want.input;
        copy.input('me', dx, dy);
        const msg = { run: seen.run, at: copy.runMs ?? 0 };
        inbox.push({ at: t + latency, send: () => lobby.setInput('me', dx, dy, msg.run, msg.at) });
      }
      if (want?.tap !== undefined) {
        const target = want.tap;
        copy.tap?.('me', target);
        const msg = { run: seen.run, at: copy.runMs ?? 0 };
        inbox.push({ at: t + latency, send: () => lobby.tap('me', target, undefined, msg.run, msg.at) });
      }
      if (want?.action) {
        const name = want.action;
        copy.action('me', name);
        const msg = { run: seen.run, at: copy.runMs ?? 0 };
        inbox.push({ at: t + latency, send: () => lobby.action('me', name, msg.run, msg.at) });
      }
    }
    while (inbox.length && inbox[0].at <= t) inbox.shift()!.send();
    // The server ticks about 15 times a second.
    if (Math.round(t / FRAME) % 4 === 0) lobby.tick(4 * FRAME);
    const local = (copy.snapshot() as { players: { alive: boolean }[] }).players[0].alive;
    const server = (lobby.snapshot(false, t).game as { players: { alive: boolean }[] }).players[0].alive;
    log.push({ t, local, server });
    void rng;
  }
  return { lobby, copy, log };
}

describe('a practice lobby runs behind the device and applies each press when the device made it', () => {
  it('runs a delayed copy of a game the device also works out, in the device’s own steps', () => {
    const lobby = new SpinLobby(createLobbyGame('lava'), undefined, undefined, true);
    lobby.join('me');
    const sim = () => lobby.snapshot(false, 0).sim!;
    // The server starts the countdown at once; its game is behind, so the device is told to start earlier than the game does.
    const before = sim().startInMs;
    expect(before).toBeLessThan(3000 - SOLO_DELAY_MS + 1);
    for (let t = 0; t < 1000; t += 66) lobby.tick(66);
    // Only a game the device also works out is held back.
    const other = new SpinLobby(createLobbyGame('coins'), undefined, undefined, true);
    other.join('me');
    for (let t = 0; t < 1000; t += 66) other.tick(66);
    expect(other.snapshot(false, 0).game).toMatchObject({ phase: 'countdown' });
    expect(other.snapshot(false, 0).sim).toBeUndefined();
  });

  it('keeps the server’s player in step with the device’s, so the server never ends a run the screen did not', () => {
    for (const latency of [0, 60, 150, 250]) {
      for (const seed of [3, 7]) {
        // Reels the net toward the fish, as a person would.
        const { log, copy, lobby } = play(
          'fishing',
          seed,
          latency,
          (c, me) => {
            const s = c.snapshot() as { fish: { y: number }; players: { id: string; y: number; vy: number }[] };
            const p = s.players.find((q) => q.id === me)!;
            return { input: [0, p.y + p.vy * 0.28 > s.fish.y ? -1 : 0] };
          },
          40,
        );
        // Whenever the device's player is still in, the server's is too, apart from the moment the device's was knocked out.
        const firstLocalOut = log.findIndex((l) => !l.local);
        const earlyServerOut = log.findIndex((l, i) => !l.server && (firstLocalOut === -1 || i < firstLocalOut - 3) && l.t > 3500);
        expect(earlyServerOut, `latency ${latency} seed ${seed}: the server knocked the player out before the device did`).toBe(-1);
        void copy;
        void lobby;
      }
    }
  });

  it('applies a press that arrives later than the delay straight away rather than losing it', () => {
    const { copy } = play('fishing', 3, SOLO_DELAY_MS + 400, () => ({ input: [0, -1] }), 5);
    expect(copy.snapshot()).toMatchObject({ id: 'fishing' });
  });
});

describe('taps in a practice run of a game the device also works out', () => {
  it('are applied when the device made them, so the server never ends a run the screen did not (Rhythm lanes)', () => {
    for (const latency of [0, 80, 200]) {
      const tapped = new Set<number>();
      const { log } = play(
        'rhythm',
        3,
        latency,
        (c) => {
          const s = c.snapshot() as { notes: { n: number; lane: number; inMs: number }[]; players: { done: number[] }[] };
          // Taps each note as it reaches the line.
          for (const note of s.notes) {
            if (tapped.has(note.n) || note.inMs > 20) continue;
            tapped.add(note.n);
            return { tap: note.lane };
          }
          return null;
        },
        25,
      );
      const firstLocalOut = log.findIndex((l) => !l.local);
      const earlyServerOut = log.findIndex((l, i) => !l.server && (firstLocalOut === -1 || i < firstLocalOut - 3) && l.t > 3500);
      expect(earlyServerOut, `latency ${latency}: the server knocked the player out before the device did`).toBe(-1);
    }
  });
});

describe('the lobby time limit', () => {
  it('is infinite until someone turns it on, and the snapshot says which', () => {
    const lobby = new SpinLobby(createLobbyGame('runner'));
    lobby.join('a');
    expect(lobby.snapshot(false).capSeconds).toBe(0);
    lobby.setTimeLimit(30);
    expect(lobby.snapshot(false).capSeconds).toBe(30);
    lobby.setTimeLimit(null);
    expect(lobby.snapshot(false).capSeconds).toBe(0);
  });

  it('is never applied to a practice lobby', () => {
    const lobby = new SpinLobby(createLobbyGame('coins'), undefined, undefined, true);
    lobby.join('a');
    expect(lobby.solo).toBe(true);
    expect(lobby.snapshot(false).capSeconds).toBe(0);
  });
});
