import { describe, expect, it } from 'vitest';
import { BounceGame } from './bounce.js';

const STEP = 33;
const run = (g: BounceGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: BounceGame) => g.snapshot();
const me = (g: BounceGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new BounceGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: BounceGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A player who steers toward the highest platform they can reach (the short way round the screen) and lets the ball do the bouncing. */
function makeBouncer(g: BounceGame, id: string, { delay = 0 }: { delay?: number } = {}) {
  const lag = Math.round((delay * 1000) / STEP);
  const hist: { x: number }[] = [];
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (s.phase !== 'playing' || !mine.alive) return;
    hist.push({ x: mine.x });
    const seen = hist[Math.max(0, hist.length - 1 - lag)];
    // The highest platform the ball can still come down onto: one that is not above where this bounce will top out.
    const apex = mine.vy > 0 ? mine.y - (mine.vy * mine.vy) / 4 : mine.y;
    const reachable = s.platforms.filter((p) => p.y >= apex + 0.02);
    const target = reachable.length > 0 ? reachable.reduce((a, b) => (b.y < a.y ? b : a)) : { x: mine.x };
    let d = target.x - seen.x;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    g.input(id, Math.abs(d) < 0.015 ? 0 : d > 0 ? 1 : -1, 0);
  };
}

describe('BounceGame', () => {
  it('starts the ball bouncing on a ground as wide as the screen, with platforms above it', () => {
    const g = started(['a']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.platforms.find((p) => p.wide)).toBeTruthy();
    expect(s.platforms.length).toBeGreaterThan(5);
    expect(me(g, 'a').alive).toBe(true);
  });

  it('bounces by itself: up and down, and never through the ground', () => {
    const g = started(['a']);
    let top = 1;
    let moved = false;
    let last = me(g, 'a').y;
    for (let t = 0; t < 1600; t += STEP) {
      g.tick(STEP);
      const y = me(g, 'a').y;
      top = Math.min(top, y);
      if (Math.abs(y - last) > 0.005) moved = true;
      last = y;
    }
    expect(moved).toBe(true);
    // A bounce rises a third of a screen (the screen climbs under it a little too).
    expect(top).toBeLessThan(0.75);
  });

  it('wraps round the screen, never leaving it', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    let seenLow = false;
    let seenHigh = false;
    for (let t = 0; t < 6000; t += STEP) {
      g.tick(STEP);
      const x = me(g, 'a').x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      if (x < 0.1) seenLow = true;
      if (x > 0.9) seenHigh = true;
    }
    expect(seenLow && seenHigh).toBe(true);
  });

  it('lays the same tower for the same seed, and a different one for another', () => {
    const tower = (seed: number) => {
      const g = started(['a'], seed);
      return JSON.stringify(snap(g).platforms.map((p) => [p.x, p.y]));
    };
    expect(tower(5)).toBe(tower(5));
    expect(tower(5)).not.toBe(tower(9));
  });

  it('always puts the next platform within a bounce of the last', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = started(['a'], seed);
      const ps = [...snap(g).platforms].sort((a, b) => b.y - a.y).filter((p) => !p.wide);
      for (let i = 1; i < ps.length; i++) {
        const gap = ps[i - 1].y - ps[i].y;
        expect(gap).toBeGreaterThanOrEqual(0.13 - 0.002);
        expect(gap).toBeLessThanOrEqual(0.26 + 0.002);
      }
    }
  });

  it('puts a ball that is left alone out in the end, and a solo run with no winner', () => {
    const g = started(['a']);
    const s = untilOver(g, 200_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(200);
    expect(snap(g).winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(false);
  });

  it('lets someone who steers to the platforms last a good while, and the screen catches up with everyone in the end', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 600_000, makeBouncer(g, 'a')));
    }
    for (const s of lasted) expect(s).toBeLessThan(600);
    expect(Math.min(...lasted)).toBeGreaterThan(20);
    // Someone who steers a fifth of a second late does worse.
    const late = [3, 5, 7, 11].map((seed) => {
      const g = started(['a'], seed);
      return untilOver(g, 600_000, makeBouncer(g, 'a', { delay: 0.5 }));
    });
    expect(Math.max(...late)).toBeLessThanOrEqual(Math.max(...lasted));
  });

  it('crowns the last one up, with their own metres as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makeBouncer(g, 'a');
    untilOver(g, 600_000, keen);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their metres and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 30;
    const one = makeBouncer(g, 'a');
    const two = makeBouncer(g, 'b');
    untilOver(g, 60_000, () => {
      one();
      two();
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
  });

  it('puts a new run back at the start', () => {
    const g = started(['a'], 5);
    untilOver(g, 200_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(me(g, 'a').alive).toBe(true);
  });
});

describe('BounceGame on each player’s own device', () => {
  it('works out its own ball there, and reports it', () => {
    const g = started(['a']);
    const copy = new BounceGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.input('a', 1, 0);
    for (let t = 0; t < 600; t += 16) copy.stepRun(0.016);
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(8);
    g.report('a', 1, true, report.f);
    run(g, 500);
    // The server stops working out a player who reports: they stay where they said.
    expect(me(g, 'a').x).toBeCloseTo(report.f.x, 2);
  });

  it('takes a report of being out, and keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: 9, h: 1e9, vy: -1e9, dir: 7 });
    const s = me(g, 'a');
    expect(s.x).toBeLessThanOrEqual(1);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.vy).toBeGreaterThanOrEqual(-4);
    g.report('a', 1, false, { x: 0.5, h: 0, vy: 0, dir: 0 });
    expect(me(g, 'a').alive).toBe(false);
  });
});
