import { describe, expect, it } from 'vitest';
import { RUNNER_X, CoinsGame, RunnerGame, type LobbyClientMessage, type LobbyGame, type LobbySnapshot, type RunnerSnapshot } from '@queueup/shared';
import { ClientSim, ClockSync } from './clientSim';

const SERVER_EPOCH = 1_700_000_000_000;

describe('ClockSync', () => {
  it('is not ready until an answer arrives', () => {
    const clock = new ClockSync();
    expect(clock.ready).toBe(false);
    clock.sample(100, 140, SERVER_EPOCH + 120);
    expect(clock.ready).toBe(true);
  });

  it('works out the server clock from a ping when the way there and back take the same time', () => {
    const clock = new ClockSync();
    // Sent at 1000, came back at 1100 (50 ms each way), so the server read its clock at 1050 our time.
    clock.sample(1000, 1100, SERVER_EPOCH + 5000);
    expect(clock.serverNow(1050)).toBeCloseTo(SERVER_EPOCH + 5000, 6);
    expect(clock.serverNow(2050)).toBeCloseTo(SERVER_EPOCH + 6000, 6);
  });

  it('trusts the quickest answer, not the slowest', () => {
    const clock = new ClockSync();
    // A slow, lopsided answer (a long wait one way) would be 200 ms out. The quick one is right.
    clock.sample(0, 400, SERVER_EPOCH + 100);
    clock.sample(1000, 1040, SERVER_EPOCH + 1020);
    clock.sample(2000, 2300, SERVER_EPOCH + 2000);
    expect(clock.serverNow(1040)).toBeCloseTo(SERVER_EPOCH + 1040, 6);
  });

  it('ignores an answer that came back before it was sent, or with no clock in it', () => {
    const clock = new ClockSync();
    clock.sample(500, 400, SERVER_EPOCH);
    clock.sample(0, 40, Number.NaN);
    expect(clock.ready).toBe(false);
  });
});

/** A server's game with a person in it, and what it sends: the state, with the run's start and the clock. */
function serverSide(game: LobbyGame, ids = ['me']) {
  ids.forEach((id) => game.join(id));
  let tick = 0;
  return {
    game,
    advance(ms: number, keepIn: string[] = []) {
      for (let t = 0; t < ms; t += 66) {
        // Someone whose own device keeps them alive reports so each time.
        for (const id of keepIn) game.report?.(id, 1, true, { h: 0, vy: 0, duck: 0 });
        game.tick(66);
      }
    },
    /** A snapshot as the server would send it at true time `now` (ms). */
    snapshot(now: number): LobbySnapshot {
      tick++;
      const sim = game.simStart?.();
      return { t: 'state', tick, game: game.snapshot(), ...(sim ? { sim, clock: SERVER_EPOCH + now } : {}), voters: [], needed: 1, spinWaiting: false };
    },
  };
}

function client(sent: LobbyClientMessage[] = []) {
  const clock = new ClockSync();
  // This device's clock reads the same as true time (ms), and the server's is SERVER_EPOCH plus that.
  clock.sample(0, 20, SERVER_EPOCH + 10);
  return { sim: new ClientSim('me', clock, (m) => void sent.push(m)), sent };
}

const players = (snap: LobbySnapshot | null) => (snap?.game.players ?? []) as unknown as { id: string; alive: boolean; h: number; wins: number }[];

describe('ClientSim before a run', () => {
  it('shows the server snapshot until the run starts, and tells the caller to send input to the server', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const { sim } = client();
    expect(sim.frame(0)).toBeNull();
    const snap = server.snapshot(0);
    sim.onState(snap);
    expect(sim.frame(10)).toBe(snap);
    // Nothing started here yet, but the server does say it will: the copy is ready to take input.
    expect(sim.input(1, 0)).toBe(true);
  });

  it('starts the run at the server time it was given, not when the server says it began', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const { sim } = client();
    sim.onState(server.snapshot(0)); // countdown: starts in 3000 ms
    expect(sim.frame(2900)?.game.phase).toBe('countdown');
    const early = sim.frame(3100);
    // The server has not said "playing" yet, but this device has reached the start time.
    expect(early?.game.phase).toBe('playing');
    expect(early?.game.timerMs).toBe(0);
  });

  it('takes a later, more exact start time until the run has started, and sticks to it after', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const { sim } = client();
    // The first snapshot is a little stale: it says the run starts at 3000 + 50.
    const first = server.snapshot(0);
    if (first.sim) first.sim = { ...first.sim, startInMs: first.sim.startInMs + 50 };
    sim.onState(first);
    // A better one says 3000.
    sim.onState(server.snapshot(500)); // startInMs is still 3000 here (the game has not ticked)
    // At 3030 server time the run has started on the exact reading (3500), not the stale one (3050).
    expect(sim.frame(3030)?.game.phase).toBe('countdown');
    expect(sim.frame(3510)?.game.phase).toBe('playing');
    // Once started, a snapshot with a different reading does not move it.
    const at = (sim.frame(3600)?.game as unknown as RunnerSnapshot).speed;
    const late = server.snapshot(3600);
    if (late.sim) late.sim = { ...late.sim, startInMs: 9999 };
    sim.onState(late);
    expect((sim.frame(3600)?.game as unknown as RunnerSnapshot).speed).toBe(at);
  });

  it('catches up a run that began before this device heard about it', () => {
    const server = serverSide(new RunnerGame(() => 0.3), ['me', 'other']);
    server.advance(3200 + 5000, ['me', 'other']); // the run is 5 s old
    const { sim } = client();
    sim.onState(server.snapshot(8200));
    const snap = sim.frame(8200) as unknown as { game: RunnerSnapshot };
    expect(snap.game.phase).toBe('playing');
    // The copy is at about the same point in the course as the server: a log, a few seconds in.
    expect(snap.game.speed).toBeGreaterThan(0.55);
    expect(snap.game.obstacles.length).toBeGreaterThan(0);
  });

  it('does nothing different for a game the server runs itself', () => {
    const server = serverSide(new CoinsGame(() => 0.3), ['me', 'other']);
    const { sim, sent } = client();
    const snap = server.snapshot(0);
    sim.onState(snap);
    expect(sim.frame(5000)).toBe(snap);
    expect(sim.input(1, 0)).toBe(false);
    expect(sim.action('jump')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('does nothing different against a server that sends no run information', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const { sim } = client();
    const snap = { ...server.snapshot(0), sim: undefined, clock: undefined };
    sim.onState(snap);
    expect(sim.frame(5000)).toBe(snap);
    expect(sim.input(0, -1)).toBe(false);
    expect(sim.action('jump')).toBe(false);
  });

  it('leaves the server snapshot alone until the clock has an answer', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const noClock = new ClientSim('me', new ClockSync(), () => {});
    const snap = server.snapshot(0);
    noClock.onState(snap);
    expect(noClock.frame(5000)).toBe(snap);
  });
});

describe('ClientSim during a run', () => {
  function running() {
    const server = serverSide(new RunnerGame(() => 0.3));
    const sent: LobbyClientMessage[] = [];
    const { sim } = client(sent);
    sim.onState(server.snapshot(0));
    sim.frame(3000); // start
    return { server, sim, sent };
  }

  it('jumps the moment the person presses, with no trip to the server', () => {
    const { sim } = running();
    expect(sim.action('jump')).toBe(true);
    const snap = sim.frame(3050);
    const me = players(snap).find((p) => p.id === 'me');
    expect(me?.h).toBeGreaterThan(0);
  });

  it('reports the player about 20 times a second, with the run number and the fields', () => {
    const { sim, sent } = running();
    for (let t = 3000; t < 4000; t += 16) sim.frame(t);
    const reports = sent.filter((m) => m.t === 'report');
    expect(reports.length).toBeGreaterThanOrEqual(15);
    expect(reports.length).toBeLessThanOrEqual(25);
    expect(reports[0]).toMatchObject({ t: 'report', run: 1, alive: true, f: { h: 0, vy: 0, duck: 0 } });
  });

  it('reports at once when the player is out, and keeps telling until the server shows it', () => {
    const { server, sim, sent } = running();
    let died = -1;
    for (let t = 3000; t < 12_000 && died < 0; t += 16) {
      const snap = sim.frame(t);
      if (players(snap).find((p) => p.id === 'me')?.alive === false) died = t;
    }
    expect(died).toBeGreaterThan(0);
    const last = sent.filter((m) => m.t === 'report').pop();
    expect(last).toMatchObject({ alive: false });
    // The server's snapshot still says in: reports carry on.
    const before = sent.length;
    sim.onState(server.snapshot(died));
    for (let t = died; t < died + 300; t += 16) sim.frame(t);
    expect(sent.length).toBeGreaterThan(before);
    // Once the server shows the player out, they stop.
    const out = server.snapshot(died + 300);
    (out.game.players as unknown as { alive: boolean }[])[0].alive = false;
    sim.onState(out);
    const quiet = sent.length;
    for (let t = died + 300; t < died + 600; t += 16) sim.frame(t);
    expect(sent.length).toBe(quiet);
  });

  it('keeps the course moving after the player is out, so they can watch the others', () => {
    const { sim } = running();
    let t = 3000;
    for (; t < 12_000; t += 16) if (players(sim.frame(t)).find((p) => p.id === 'me')?.alive === false) break;
    const a = sim.frame(t + 16) as unknown as { game: RunnerSnapshot };
    const b = sim.frame(t + 500) as unknown as { game: RunnerSnapshot };
    expect(a.game.phase).toBe('playing');
    expect(b.game.obstacles[0]?.x).not.toBe(a.game.obstacles[0]?.x);
  });

  it('takes the result from the server: when it says the run is over, the copy stops', () => {
    const { server, sim } = running();
    const over = server.snapshot(5000);
    (over.game as { phase: string }).phase = 'over';
    (over.game as { winnerId: string | null }).winnerId = 'other';
    (over.game as { timerMs: number }).timerMs = 4000;
    over.sim = undefined;
    sim.onState(over);
    const a = sim.frame(5000) as unknown as { game: RunnerSnapshot };
    const b = sim.frame(6000) as unknown as { game: RunnerSnapshot };
    expect(a.game.phase).toBe('over');
    expect(a.game.winnerId).toBe('other');
    expect(a.game.timerMs).toBe(4000);
    expect(b.game.obstacles).toEqual(a.game.obstacles);
  });

  it('takes the wins and results from the server', () => {
    const { server, sim } = running();
    const snap = server.snapshot(4000);
    (snap.game.players as unknown as { wins: number }[])[0].wins = 3;
    (snap.game as unknown as { history: unknown[] }).history = [{ id: 'x', winnerId: 'x', meters: 9, game: 'runner' }];
    sim.onState(snap);
    const composed = sim.frame(4000);
    expect(players(composed).find((p) => p.id === 'me')?.wins).toBe(3);
    expect((composed?.game as unknown as { history: unknown[] }).history).toHaveLength(1);
  });

  it('shows other players as the server reports them, not as this device works them out', () => {
    const server = serverSide(new RunnerGame(() => 0.3), ['me', 'other']);
    const { sim } = client();
    sim.onState(server.snapshot(0));
    server.game.tick(3100);
    server.game.report?.('other', 1, true, { h: 0.5, vy: 1, duck: 0 });
    sim.onState(server.snapshot(3100));
    const snap = sim.frame(3100);
    expect(players(snap).find((p) => p.id === 'other')?.h).toBe(0.5);
  });

  it('holds a key that was already down when the run starts', () => {
    const server = serverSide(new RunnerGame(() => 0.3));
    const { sim } = client();
    sim.onState(server.snapshot(0));
    sim.input(0, 1); // duck, held through the countdown
    sim.frame(3000);
    const snap = sim.frame(3016) as unknown as { game: RunnerSnapshot };
    expect(snap.game.players.find((p) => p.id === 'me')?.ducking).toBe(true);
  });

  it('only watches a run someone arrived part way through: no input, no reports', () => {
    const server = serverSide(new RunnerGame(() => 0.3), ['other']);
    server.advance(3200 + 2000, ['other']);
    server.game.join('me'); // arrives during the run: alive false
    const sent: LobbyClientMessage[] = [];
    const { sim } = client(sent);
    sim.onState(server.snapshot(5200));
    const snap = sim.frame(5200) as unknown as { game: RunnerSnapshot };
    // The course is the copy's, but this person is shown as the server has them: out, watching.
    expect(snap.game.obstacles.length).toBeGreaterThan(0);
    expect(snap.game.players.find((p) => p.id === 'me')?.alive).toBe(false);
    expect(sim.action('jump')).toBe(true);
    for (let t = 5200; t < 6000; t += 16) sim.frame(t);
    expect(sent).toEqual([]);
  });

  it('starts over for the next run, with its own seed', () => {
    const server = serverSide(new RunnerGame(Math.random));
    const { sim } = client();
    sim.onState(server.snapshot(0));
    sim.frame(3000);
    const first = JSON.stringify((sim.frame(8000)?.game as unknown as RunnerSnapshot).obstacles);
    // Run 2 (as the server would announce it).
    const next = server.snapshot(20_000);
    next.sim = { run: 2, seed: 987654321, startInMs: 3000 };
    (next.game as { run: number }).run = 2;
    (next.game as { phase: string }).phase = 'countdown';
    next.clock = SERVER_EPOCH + 20_000;
    sim.onState(next);
    sim.frame(23_000);
    const second = JSON.stringify((sim.frame(28_000)?.game as unknown as RunnerSnapshot).obstacles);
    expect(second).not.toBe(first);
  });
});

/** The whole thing, with a network in the middle: a server's game, a client, and messages that take
 * `latency` ms each way. A bot plays by looking at the snapshot it is shown. */
function simulate(opts: { latency: number; onClient: boolean; runMs: number }) {
  const L = opts.latency;
  const server = new RunnerGame(() => 0.3);
  server.join('me');
  const queue: { at: number; run: () => void }[] = [];
  const later = (at: number, run: () => void) => void queue.push({ at, run });
  let now = 0;

  const clock = new ClockSync();
  clock.sample(0, 2 * L, SERVER_EPOCH + L);
  const sim = new ClientSim('me', clock, (m) => {
    if (m.t === 'report') later(now + L, () => server.report('me', m.run, m.alive, m.f));
  });

  let delivered: LobbySnapshot | null = null;
  let tick = 0;
  let lastServerTick = 0;
  const HALF = { cactus: 0.05, bird: 0.03, log: 0.15 } as const;

  for (; now < 3000 + opts.runMs; now += 16) {
    for (const q of queue.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)) q.run();
    queue.splice(0, queue.length, ...queue.filter((x) => x.at > now));
    if (now - lastServerTick >= 66) {
      server.tick(now - lastServerTick);
      lastServerTick = now;
      const sims = server.simStart();
      const snapshot: LobbySnapshot = { t: 'state', tick: ++tick, game: server.snapshot(), ...(sims ? { sim: sims, clock: SERVER_EPOCH + now } : {}), voters: [], needed: 1, spinWaiting: false };
      later(now + L, () => {
        delivered = snapshot;
        if (opts.onClient) sim.onState(snapshot);
      });
    }
    const shown = opts.onClient ? sim.frame(now) : delivered;
    if (!shown || shown.game.phase !== 'playing') continue;
    const game = shown.game as unknown as RunnerSnapshot;
    // The bot: taps over cacti, holds across logs, ducks under birds, going by what it can see.
    const next = game.obstacles.filter((o) => o.x + o.w / 2 + 0.02 > RUNNER_X).sort((a, b) => a.x - b.x)[0];
    const ahead = next ? next.x - RUNNER_X : Infinity;
    const jump = next?.kind === 'cactus' && ahead < game.speed * 0.37;
    const hold = next?.kind === 'log' && ahead - HALF.log - 0.02 < game.speed * 0.22;
    const duck = next?.kind === 'bird' && ahead < game.speed * 0.5 && ahead > -next.w / 2 - 0.01;
    const dy = duck ? 1 : hold ? -1 : 0;
    if (opts.onClient) {
      if (jump) sim.action('jump');
      sim.input(0, dy);
    } else {
      // Without it, every press takes a trip to the server first.
      if (jump) later(now + L, () => server.action('me', 'jump'));
      later(now + L, () => server.input('me', 0, dy));
    }
  }
  return server.snapshot();
}

describe('a player with a slow connection', () => {
  it('plays as well as anyone when their own movement is worked out on their device', () => {
    for (const latency of [10, 120, 250]) {
      const result = simulate({ latency, onClient: true, runMs: 20_000 });
      expect(result.players[0].alive, `ping ${latency * 2}`).toBe(true);
    }
  });

  it('is knocked out by the same course when the server has to hear every press first', () => {
    const slow = simulate({ latency: 250, onClient: false, runMs: 20_000 });
    expect(slow.players[0].alive).toBe(false);
  });

  it('still manages with a quick connection either way', () => {
    expect(simulate({ latency: 5, onClient: false, runMs: 20_000 }).players[0].alive).toBe(true);
  });
});
