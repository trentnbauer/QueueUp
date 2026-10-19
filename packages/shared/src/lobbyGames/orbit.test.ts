import { describe, expect, it } from 'vitest';
import { ORBIT_MARKER_HALF, type OrbitSnapshot } from '../spinLobby.js';
import { OrbitGame } from './orbit.js';

const STEP = 33;
const TAU = Math.PI * 2;
const run = (g: OrbitGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: OrbitGame) => g.snapshot();
const me = (g: OrbitGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const gap = (a: number, b: number) => Math.abs((((a - b + Math.PI) % TAU) + TAU) % TAU - Math.PI);

function started(ids: string[], seed = 7) {
  const g = new OrbitGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

function untilOver(g: OrbitGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

// ---- A player who can see what is coming ----------------------------------------------------------------

const BOT_STEP_MS = 100;
const HORIZON = 12;
const MARGIN = 0.04;

/** Whether going round from `theta` in `dir`, flipping at the given steps, is clear of everything for the next `HORIZON` steps. */
function clear(s: OrbitSnapshot, theta: number, dir: number, flips: number[]): boolean {
  const dt = BOT_STEP_MS / 1000;
  let a = theta;
  let d = dir;
  for (let k = 0; k < HORIZON; k++) {
    if (flips.includes(k)) d = -d;
    a += d * s.omega * dt;
    for (let sub = 0; sub < 5; sub++) {
      const t = (k + (sub + 1) / 5) * BOT_STEP_MS;
      const at = a - d * s.omega * dt * (1 - (sub + 1) / 5);
      for (const h of s.hazards) if (Math.abs(h.hitInMs - t) <= 70 + 25 && gap(at, h.a) < h.w + ORBIT_MARKER_HALF + MARGIN) return false;
    }
  }
  return true;
}

/** Picks the fewest flips that get through the next second or so untouched, and flips now if the plan starts with one. `delay` makes it late. */
function flipsNow(g: OrbitGame, id: string): boolean {
  const s = snap(g);
  const p = s.players.find((q) => q.id === id)!;
  const steps = Array.from({ length: HORIZON }, (_, i) => i);
  const plans: number[][] = [[]];
  for (const a of steps) plans.push([a]);
  for (const a of steps) for (const b of steps) if (b > a) plans.push([a, b]);
  for (const a of steps) for (const b of steps) if (b > a) for (const c of steps) if (c > b) plans.push([a, b, c]);
  const ok = plans.find((plan) => clear(s, p.a, p.dir, plan));
  return !!ok && ok.includes(0);
}

function playBot(g: OrbitGame, id: string, ms: number): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing' && me(g, id).alive; t += BOT_STEP_MS) {
    if (flipsNow(g, id)) g.action(id, 'flip');
    for (let k = 0; k < BOT_STEP_MS; k += STEP) g.tick(STEP);
  }
  return t / 1000;
}

describe('OrbitGame course', () => {
  it('starts everyone at the top of the ring going clockwise, with the first thing coming after a moment, and a warning before it lands', () => {
    const g = started(['a', 'b']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => [p.a, p.dir])).toEqual([[expect.any(Number), 1], [expect.any(Number), 1]]);
    run(g, 1000);
    const seen = snap(g).hazards;
    expect(seen.length).toBeGreaterThan(0);
    for (const h of snap(g).hazards) expect(h.flyMs).toBeGreaterThan(800);
  });

  it('is the same for the same seed, and different for another', () => {
    const things = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 1500);
      return JSON.stringify(snap(g).hazards);
    };
    expect(things(5)).toBe(things(5));
    expect(things(5)).not.toBe(things(9));
  });

  it('goes quicker round the ring and brings things in quicker as the run goes on, then no quicker', () => {
    const g = started(['a']);
    const keep = () => g.report('a', 1, true, { a: 0, d: 1 });
    const start = snap(g).omega;
    for (let t = 0; t < 40_000; t += STEP) {
      keep();
      g.tick(STEP);
    }
    expect(snap(g).omega).toBeGreaterThan(start * 1.7);
    const late = snap(g).omega;
    for (let t = 0; t < 10_000; t += STEP) {
      keep();
      g.tick(STEP);
    }
    expect(snap(g).omega).toBeCloseTo(late, 2);
  });

  it('never puts anything on the hidden clear way round, so a way through always exists', () => {
    for (const seed of [3, 7, 11, 19]) {
      const g = started(['a'], seed);
      const hidden = g as unknown as { safeAt: (t: number) => number; things: { hitAt: number; angle: number; half: number }[] };
      run(g, 60_000 - 3200 + 3200);
      // Look at what has been laid: none of it is on the clear way at its moment.
      for (const x of hidden.things) expect(gap(hidden.safeAt(x.hitAt), x.angle), `seed ${seed} thing at ${x.hitAt}`).toBeGreaterThan(x.half + ORBIT_MARKER_HALF);
      g.leave('a');
    }
  });
});

describe('OrbitGame playing', () => {
  it('goes round the way it is going, and a flip turns it round', () => {
    const g = started(['a']);
    const before = me(g, 'a');
    run(g, 200);
    expect(me(g, 'a').a).toBeGreaterThan(before.a);
    g.action('a', 'flip');
    expect(me(g, 'a').dir).toBe(-1);
    g.action('a', 'flip');
    expect(me(g, 'a').dir).toBe(1);
    g.input('a', -1, 0); // the left key picks the way round, too
    expect(me(g, 'a').dir).toBe(-1);
  });

  it('ignores junk, other buttons and anything before the run starts', () => {
    const g = new OrbitGame(lcg(7));
    g.join('a'); // countdown
    g.action('a', 'flip');
    expect(me(g, 'a').dir).toBe(1);
    const p = started(['a']);
    p.action('a', 'jump');
    p.input('a', 99, 0);
    expect(me(p, 'a').dir).toBe(1);
  });

  it('knocks out a player who never flips, and ends a solo run with no winner, scoring the seconds they lasted', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 120_000);
    expect(seconds).toBeLessThan(20);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).history.at(-1)?.meters).toBe(me(g, 'a').meters);
    expect(me(g, 'a').meters).toBeGreaterThanOrEqual(Math.floor(seconds) - 1);
  });

  it('lets someone who sees what is coming last 15 seconds, on several seeds', () => {
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], seed);
      const seconds = playBot(g, 'a', 15_000);
      expect(me(g, 'a').alive, `seed ${seed}: out at ${seconds}s`).toBe(true);
    }
  });

  it('crowns the last one going, with their own seconds as the run', () => {
    const g = started(['a', 'b']);
    // b does nothing and is out first; a watches for what is coming.
    let guard = 0;
    while (snap(g).phase === 'playing' && guard++ < 4000) {
      if (me(g, 'a').alive && flipsNow(g, 'a')) g.action('a', 'flip');
      for (let k = 0; k < BOT_STEP_MS; k += STEP) g.tick(STEP);
    }
    expect(me(g, 'b').alive).toBe(false);
    if (snap(g).winnerId === 'a') expect(me(g, 'a').wins).toBe(1);
    else expect(snap(g).winnerId).toBeNull();
  });

  it('ends at the lobby time cap with whoever is still going keeping their seconds, and nobody winning', () => {
    const g = new OrbitGame(lcg(7));
    g.timeLimitS = 8;
    g.join('a');
    run(g, 3200);
    playBot(g, 'a', 10_000);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(true);
  });
});

describe('OrbitGame on each player’s own device', () => {
  it('works out its own marker there, and reports it', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { a: 2, d: -1 });
    expect(me(g, 'a')).toMatchObject({ a: 2, dir: -1, alive: true });
    // A marker that reports is not moved by the server, and its flips there are not counted twice.
    g.action('a', 'flip');
    run(g, 500);
    expect(me(g, 'a')).toMatchObject({ a: 2, dir: -1 });
  });

  it('takes a report of being out, and keeps a malformed one in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { a: Number.NaN, d: 7 });
    const p = me(g, 'a');
    expect(Number.isFinite(p.a)).toBe(true);
    expect(Math.abs(p.dir)).toBe(1);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
  });
});
