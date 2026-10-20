import { describe, expect, it } from 'vitest';
import { TUNNEL_SHIP_W } from '../spinLobby.js';
import { TunnelGame, tunnelAt } from './tunnel.js';

const STEP = 33;
const run = (g: TunnelGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: TunnelGame) => g.snapshot();
const me = (g: TunnelGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new TunnelGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: TunnelGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A pilot who steers toward the middle of the tunnel a little way ahead of them, seeing it `delay` seconds late. */
function makePilot(g: TunnelGame, id: string, { delay = 0, ahead = 0.1 }: { delay?: number; ahead?: number } = {}) {
  const lag = Math.round((delay * 1000) / STEP);
  const hist: number[] = [];
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (s.phase !== 'playing' || !mine.alive) return;
    hist.push(s.dist);
    const seen = hist[Math.max(0, hist.length - 1 - lag)];
    const { mid } = tunnelAt(s.course, seen + ahead);
    g.input(id, Math.abs(mid - mine.x) < 0.01 ? 0 : mid > mine.x ? 1 : -1, 0);
  };
}

describe('tunnelAt', () => {
  const course = { f: [1.2, 2.2] as [number, number], p: [0.5, 2] as [number, number] };

  it('starts straight in the middle, and curves later', () => {
    expect(tunnelAt(course, 0).mid).toBeCloseTo(0.5, 5);
    let swing = 0;
    for (let z = 0; z < 40; z += 0.05) swing = Math.max(swing, Math.abs(tunnelAt(course, z).mid - 0.5));
    expect(swing).toBeGreaterThan(0.1);
  });

  it('narrows to a floor, and never leaves the screen', () => {
    expect(tunnelAt(course, 0).half).toBeCloseTo(0.24, 5);
    expect(tunnelAt(course, 100).half).toBeCloseTo(0.09, 5);
    for (let z = 0; z < 80; z += 0.05) {
      const { mid, half } = tunnelAt(course, z);
      expect(mid - half).toBeGreaterThan(0);
      expect(mid + half).toBeLessThan(1);
    }
  });

  it('never turns sharper than the ship can follow at a screen a second', () => {
    // The ship slides 0.6 of a screen a second, so at a screen a second of tunnel its middle may move 0.6 a screen of tunnel.
    for (const f of [[0.9, 1.8], [1.4, 2.6], [1.1, 2.2]] as [number, number][]) {
      let steepest = 0;
      for (let z = 0; z < 60; z += 0.01) steepest = Math.max(steepest, Math.abs(tunnelAt({ f, p: [0, 0] }, z + 0.01).mid - tunnelAt({ f, p: [0, 0] }, z).mid) / 0.01);
      expect(steepest).toBeLessThan(0.45);
    }
  });
});

describe('TunnelGame', () => {
  it('starts the ship in the middle of a straight tunnel', () => {
    const g = started(['a']);
    expect(snap(g).phase).toBe('playing');
    expect(me(g, 'a').x).toBe(0.5);
    expect(me(g, 'a').alive).toBe(true);
  });

  it('makes the same tunnel for the same seed, and another for another', () => {
    const course = (seed: number) => JSON.stringify(started(['a'], seed).snapshot().course);
    expect(course(5)).toBe(course(5));
    expect(course(5)).not.toBe(course(9));
  });

  it('steers while the button is held, and stays on the screen', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    run(g, 300);
    expect(me(g, 'a').x).toBeGreaterThan(0.5);
    g.input('a', 0, 0);
    const x = me(g, 'a').x;
    run(g, 100);
    expect(me(g, 'a').x).toBe(x);
    g.input('a', -1, 0);
    run(g, 3000);
    expect(me(g, 'a').x).toBeGreaterThanOrEqual(0);
  });

  it('puts a ship out when it touches a wall, and ends a solo run with no winner', () => {
    const g = started(['a']);
    g.input('a', 1, 0); // straight at the right-hand wall
    const s = untilOver(g, 60_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(5);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
    // The wall was 0.24 from the middle, less half the ship's width.
    expect(me(g, 'a').x).toBeGreaterThanOrEqual(0.5 + 0.24 - TUNNEL_SHIP_W);
  });

  it('lets a pilot who follows the middle last a good while, and gets too fast for everyone in the end', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 600_000, makePilot(g, 'a')));
    }
    for (const s of lasted) expect(s).toBeLessThan(600);
    expect(Math.min(...lasted)).toBeGreaterThan(30);
    // Someone who sees the tunnel half a second late does worse.
    const late = [3, 5, 7, 11].map((seed) => {
      const g = started(['a'], seed);
      return untilOver(g, 600_000, makePilot(g, 'a', { delay: 0.5 }));
    });
    expect(Math.max(...late)).toBeLessThan(Math.min(...lasted));
  });

  it('crowns the last one flying, with their own metres as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makePilot(g, 'a');
    untilOver(g, 600_000, keen);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their metres and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 30;
    const one = makePilot(g, 'a');
    const two = makePilot(g, 'b');
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
    g.input('a', 1, 0);
    untilOver(g, 60_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(me(g, 'a').x).toBe(0.5);
    expect(me(g, 'a').alive).toBe(true);
  });
});

describe('TunnelGame on each player’s own device', () => {
  it('works out its own ship there, and reports it', () => {
    const g = started(['a']);
    const copy = new TunnelGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.input('a', 1, 0);
    for (let t = 0; t < 200; t += 16) copy.stepRun(0.016);
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(8);
    g.report('a', 1, true, report.f);
    run(g, 500);
    expect(me(g, 'a').x).toBeCloseTo(report.f.x, 2);
  });

  it('takes a report of being out, and keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: 9, dir: 7 });
    expect(me(g, 'a').x).toBeLessThanOrEqual(1);
    g.report('a', 1, false, { x: 0.5, dir: 0 });
    expect(me(g, 'a').alive).toBe(false);
  });
});
