import { describe, expect, it } from 'vitest';
import { CoinsGame } from './coins.js';
import { DodgeGame } from './dodge.js';
import { FlappyGame } from './flappy.js';
import { RaceGame } from './race.js';
import { RopeGame } from './rope.js';
import { RunnerGame } from './runner.js';

const STEP = 33;
const FIXED = 1 / 60;
const seeded = (seed: number) => () => seed;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};

/** A server's game with one person in it, past the countdown. */
function serverRunner(seed = 0.3) {
  const g = new RunnerGame(seeded(seed));
  g.join('a');
  run(g, 3200);
  return g;
}

describe('which games run each player on their own device', () => {
  it('is Runner, Flappy, Dodge, Jump rope and Obstacle race, whose players do not affect each other', () => {
    for (const g of [new RunnerGame(), new FlappyGame(), new DodgeGame(), new RopeGame(), new RaceGame()]) expect(g.clientSim).toBe(true);
  });

  it('is not Catch the coins, where players race for the same thing', () => {
    expect(new CoinsGame().clientSim).toBe(false);
    expect(new CoinsGame().simStart()).toBeNull();
  });
});

describe('simStart', () => {
  it('says when the run starts and what seed makes its course', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    const counting = g.simStart();
    expect(counting).not.toBeNull();
    expect(counting?.run).toBe(1);
    expect(counting?.startInMs).toBe(3000);
    run(g, 1000);
    expect(g.simStart()?.startInMs).toBeLessThan(2100);
    expect(g.simStart()?.seed).toBe(counting?.seed);
    run(g, 2400);
    // The run is on: negative, by how far in.
    const on = g.simStart();
    expect(on?.startInMs).toBeLessThan(0);
    expect(on?.seed).toBe(counting?.seed);
  });

  it('is gone between runs and when nobody is in', () => {
    const g = serverRunner();
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(g.simStart()).toBeNull();
    const empty = new RunnerGame();
    expect(empty.simStart()).toBeNull();
  });

  it('gives each run its own seed and number', () => {
    const g = new RunnerGame(Math.random);
    g.join('a');
    const first = g.simStart();
    run(g, 3200);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    run(g, 4200);
    const second = g.simStart();
    expect(second?.run).toBe(2);
    expect(second?.seed).not.toBe(first?.seed);
  });
});

describe('the server taking a report', () => {
  it('stops working out a player once they report, so a hit the server sees is not counted', () => {
    const g = serverRunner();
    // Never moves: left alone the server would have this runner hit the first cactus.
    g.report('a', 1, true, { h: 0, vy: 0, duck: 0 });
    for (let t = 0; t < 2400; t += STEP) {
      g.report('a', 1, true, { h: 0, vy: 0, duck: 0 });
      g.tick(STEP);
    }
    expect(g.snapshot().players[0].alive).toBe(true);
  });

  it('still works out a player who never reports (an old client, or a bot)', () => {
    const g = serverRunner();
    run(g, 5000);
    expect(g.snapshot().players[0].alive).toBe(false);
  });

  it('shows the reported position to everyone else', () => {
    const g = serverRunner();
    g.report('a', 1, true, { h: 0.4, vy: 1, duck: 0 });
    expect(g.snapshot().players[0].h).toBe(0.4);
    g.report('a', 1, true, { h: 0, vy: 0, duck: 1 });
    expect(g.snapshot().players[0].ducking).toBe(true);
  });

  it('knocks a player out when their client says it is out', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    g.join('b');
    run(g, 3200);
    g.report('a', 1, false, { h: 0, vy: 0, duck: 0 });
    expect(g.snapshot().players.find((p) => p.id === 'a')?.alive).toBe(false);
    expect(g.snapshot().players.find((p) => p.id === 'b')?.alive).toBe(true);
    // Last one in wins: `b`, once `b`'s own client keeps them in.
    for (let t = 0; t < 300; t += STEP) {
      g.report('b', 1, true, { h: 0, vy: 0, duck: 0 });
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('b');
  });

  it('ignores a report for another run, from someone out, or about nobody in the game', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    g.join('b');
    run(g, 3200);
    g.report('a', 7, false, {});
    expect(g.snapshot().players.find((p) => p.id === 'a')?.alive).toBe(true);
    g.report('stranger', 1, true, { h: 1 });
    expect(g.snapshot().players).toHaveLength(2);
    g.report('b', 1, false, {});
    g.report('b', 1, true, { h: 0.9, vy: 0, duck: 0 });
    expect(g.snapshot().players.find((p) => p.id === 'b')?.h).toBe(0);
  });

  it('ignores a report with too many fields, and takes a number only if it is a finite number', () => {
    const g = serverRunner();
    g.report('a', 1, true, Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 1])));
    expect(g.snapshot().players[0].h).toBe(0);
    g.report('a', 1, true, { h: Number.NaN, vy: Infinity, duck: 0 });
    expect(Number.isFinite(g.snapshot().players[0].h)).toBe(true);
    g.report('a', 1, true, { h: 1e12, vy: 0, duck: 0 });
    expect(g.snapshot().players[0].h).toBeLessThanOrEqual(1e4);
    g.report('a', 1, true, { h: 'x' as unknown as number, vy: 0, duck: 0 });
    expect(Number.isFinite(g.snapshot().players[0].h)).toBe(true);
  });

  it('accepts reports for a games with no client sim by ignoring them', () => {
    const g = new CoinsGame(seeded(0.3));
    g.join('a');
    g.join('b');
    run(g, 3200);
    g.report('a', 1, false, {});
    expect(g.snapshot().players.find((p) => p.id === 'a')?.alive).toBe(true);
  });

  it('knocks out a reporter who goes quiet for a few seconds', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    g.join('b');
    run(g, 3200);
    g.report('a', 1, true, { h: 0, vy: 0, duck: 0 });
    // `b` keeps reporting, `a` does not.
    for (let t = 0; t < 2800; t += STEP) {
      g.report('b', 1, true, { h: 0, vy: 0, duck: 0 });
      g.tick(STEP);
    }
    expect(g.snapshot().players.find((p) => p.id === 'a')?.alive).toBe(true);
    for (let t = 0; t < 700; t += STEP) {
      g.report('b', 1, true, { h: 0, vy: 0, duck: 0 });
      g.tick(STEP);
    }
    expect(g.snapshot().players.find((p) => p.id === 'a')?.alive).toBe(false);
  });

  it('forgets who reports when the next run starts', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    run(g, 3200);
    g.report('a', 1, true, { h: 0, vy: 0, duck: 0 });
    g.report('a', 1, false, {});
    for (let t = 0; t < 60_000 && g.snapshot().phase !== 'countdown'; t += STEP) g.tick(STEP);
    run(g, 3300);
    // Run 2, and this player has not reported yet, so the server works them out again.
    run(g, 5000);
    expect(g.snapshot().players[0].alive).toBe(false);
  });
});

describe('a one-person copy of a run on a client', () => {
  /** What a client does: the same game, one person in it, started from the server's seed. */
  function client(seed: number) {
    const g = new RunnerGame();
    g.join('me');
    g.startRunAt(seed);
    return g;
  }
  const stepFor = (g: RunnerGame, ms: number) => {
    for (let t = 0; t < ms; t += 1000 / 60) g.stepRun(FIXED);
  };

  it('is the same course as the server makes from the same seed', () => {
    const server = serverRunner(0.37);
    const info = server.simStart();
    expect(info).not.toBeNull();
    const local = client(info?.seed ?? 0);
    const before = server.snapshot();
    const elapsed = -(info?.startInMs ?? 0);
    stepFor(local, elapsed);
    // The server's own run is at `elapsed` ms and the client's copy has been run to the same point.
    const a = before.obstacles.map((o) => o.n);
    const b = local.snapshot().obstacles.map((o) => o.n);
    expect(b.slice(0, a.length)).toEqual(a.slice(0, b.length));
    expect(local.snapshot().obstacles[0].x).toBeCloseTo(before.obstacles[0].x, 1);
    expect(local.snapshot().speed).toBeCloseTo(before.speed, 1);
  });

  it('makes the same course every time from a seed, and a different one from another', () => {
    const course = (seed: number) => {
      const g = client(seed);
      stepFor(g, 8000);
      return JSON.stringify(g.snapshot().obstacles);
    };
    expect(course(123)).toBe(course(123));
    expect(course(123)).not.toBe(course(456));
  });

  it('reacts to the player straight away, with no server in between', () => {
    const g = client(5);
    g.action('me', 'jump');
    g.stepRun(FIXED);
    expect(g.snapshot().players[0].h).toBeGreaterThan(0);
    expect(g.localReport('me')?.f.h).toBeGreaterThan(0);
  });

  it('reports its own player: alive, and the fields the server reads', () => {
    const g = client(5);
    expect(g.localReport('me')).toEqual({ alive: true, f: { h: 0, vy: 0, duck: 0 } });
    expect(g.localReport('nobody')).toBeNull();
    g.input('me', 0, 1);
    expect(g.localReport('me')?.f.duck).toBe(1);
  });

  it('knocks its own player out on a hit, and carries on so they can watch', () => {
    const g = client(5);
    // Stand still until the first cactus arrives.
    for (let i = 0; i < 60 * 8 && g.localReport('me')?.alive; i++) g.stepRun(FIXED);
    expect(g.localReport('me')?.alive).toBe(false);
    const where = g.snapshot().obstacles[0]?.x;
    stepFor(g, 1000);
    // The run did not end for the copy: no result, and the course keeps moving.
    expect(g.snapshot().phase).toBe('playing');
    expect(g.snapshot().history).toEqual([]);
    expect(g.snapshot().obstacles[0]?.x).not.toBe(where);
    expect(g.snapshot().players[0].alive).toBe(false);
  });

  it('only steps while a run is on', () => {
    const g = new RunnerGame();
    g.join('me');
    g.stepRun(FIXED);
    expect(g.runMs).toBe(0);
    g.startRunAt(5);
    g.stepRun(FIXED);
    expect(g.runMs).toBeGreaterThan(0);
  });

  it('works for every game that runs on the client', () => {
    for (const make of [() => new RunnerGame(), () => new FlappyGame(), () => new DodgeGame(), () => new RopeGame(), () => new RaceGame()]) {
      const g = make();
      g.join('me');
      g.startRunAt(99);
      for (let i = 0; i < 60 * 3; i++) g.stepRun(FIXED);
      expect(g.runMs).toBeGreaterThan(2900);
      const report = g.localReport('me');
      expect(report).not.toBeNull();
      for (const v of Object.values(report?.f ?? {})) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
