import { describe, expect, it } from 'vitest';
import { PARACHUTE_PLAYER_W } from '../spinLobby.js';
import { ParachuteGame } from './parachute.js';

const STEP = 33;
const run = (g: ParachuteGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: ParachuteGame) => g.snapshot();
const me = (g: ParachuteGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new ParachuteGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: ParachuteGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A skydiver who slides into the gap of the next row, seeing where they are `delay` seconds late, and lets go to fall once lined up. */
function makeDiver(g: ParachuteGame, id: string, { delay = 0 }: { delay?: number } = {}) {
  const lag = Math.round((delay * 1000) / STEP);
  const hist: number[] = [];
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (s.phase !== 'playing' || !mine.alive) return;
    hist.push(mine.x);
    const seen = hist[Math.max(0, hist.length - 1 - lag)];
    const next = s.rows.filter((r) => r.y >= mine.y - 0.04).reduce((a, b) => (b.y < a.y ? b : a), { y: 9, gap: 0.5, width: 1, n: 0 });
    const off = next.gap - seen;
    // Aim a little to the side of the middle that is toward the diver, and stop once safely inside.
    const dx = Math.abs(off) < 0.015 ? 0 : off > 0 ? 1 : -1;
    g.input(id, dx, 0);
  };
}

describe('ParachuteGame', () => {
  it('starts the skydiver in clear sky with the chute shut', () => {
    const g = started(['a']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(me(g, 'a')).toMatchObject({ x: 0.5, alive: true, open: false });
    expect(s.rows).toHaveLength(0);
  });

  it('sinks in free fall, and floats up while an arrow is held, within the screen', () => {
    const g = started(['a']);
    const start = me(g, 'a').y;
    run(g, 700);
    expect(me(g, 'a').y).toBeGreaterThan(start);
    g.input('a', 1, 0);
    expect(snap(g).phase).toBe('playing');
    run(g, 100);
    const open = me(g, 'a');
    expect(open.open).toBe(true);
    run(g, 1500);
    expect(me(g, 'a').y).toBeLessThan(open.y);
    expect(me(g, 'a').y).toBeGreaterThanOrEqual(0.14);
    g.input('a', 0, 0);
    run(g, 6000);
    expect(me(g, 'a').y).toBeLessThanOrEqual(0.62);
  });

  it('opens the chute on an arrow either way and shuts it on none, whatever up and down say', () => {
    const g = started(['a']);
    g.input('a', -1, 0);
    expect(me(g, 'a').open).toBe(true);
    g.input('a', 0, -1);
    expect(me(g, 'a').open).toBe(false);
    g.input('a', 1, 1);
    expect(me(g, 'a').open).toBe(true);
    g.input('a', 0, 0);
    expect(me(g, 'a').open).toBe(false);
  });

  it('lays the same sky for the same seed, and another for another', () => {
    const sky = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 6000);
      return JSON.stringify([snap(g).rows.map((r) => r.gap), snap(g).gusts.map((x) => x.push)]);
    };
    expect(sky(5)).toBe(sky(5));
    expect(sky(5)).not.toBe(sky(9));
  });

  it('always puts a gap within reach of the last, and narrows the gap as the run goes on', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = started(['a'], seed);
      g.input('a', 0, 0);
      const seen = new Map<number, { gap: number; width: number }>();
      for (let t = 0; t < 40_000 && snap(g).phase === 'playing'; t += STEP) {
        g.report('a', 1, true, { x: 0.5, y: 0.3, dir: 0, o: 0 }); // keep the skydiver safe, to watch the sky
        g.tick(STEP);
        for (const r of snap(g).rows) seen.set(r.n, { gap: r.gap, width: r.width });
      }
      const rows = [...seen.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      expect(rows.length).toBeGreaterThan(20);
      for (let i = 1; i < rows.length; i++) expect(Math.abs(rows[i].gap - rows[i - 1].gap)).toBeLessThan(0.2);
      expect(rows[rows.length - 1].width).toBeLessThan(rows[0].width);
    }
  });

  it('puts a skydiver who flies into a cloud out, and ends a solo run with no winner', () => {
    const g = started(['a']);
    const s = untilOver(g, 60_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(20);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
  });

  it('lets a diver who slides into the gaps last a good while, and the sky gets too fast for everyone in the end', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 900_000, makeDiver(g, 'a')));
    }
    for (const s of lasted) expect(s).toBeLessThan(900);
    expect(Math.min(...lasted)).toBeGreaterThan(25);
    // Someone who is half a second late does worse.
    const late = [3, 5, 7, 11].map((seed) => {
      const g = started(['a'], seed);
      return untilOver(g, 900_000, makeDiver(g, 'a', { delay: 0.5 }));
    });
    expect(Math.max(...late)).toBeLessThan(Math.min(...lasted));
  });

  it('crowns the last one falling, with their own metres as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makeDiver(g, 'a');
    untilOver(g, 900_000, keen);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their metres and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 30;
    const one = makeDiver(g, 'a');
    const two = makeDiver(g, 'b');
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
    untilOver(g, 60_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(me(g, 'a')).toMatchObject({ x: 0.5, alive: true });
    expect(PARACHUTE_PLAYER_W).toBeGreaterThan(0);
  });
});

describe('ParachuteGame on each player’s own device', () => {
  it('works out its own skydiver there, and reports it', () => {
    const g = started(['a']);
    const copy = new ParachuteGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.input('a', 1, 0);
    for (let t = 0; t < 300; t += 16) copy.stepRun(0.016);
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(report.f.o).toBe(1);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(8);
    g.report('a', 1, true, report.f);
    run(g, 500);
    expect(me(g, 'a').x).toBeCloseTo(report.f.x, 2);
  });

  it('takes a report of being out, and keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: 9, y: -5, dir: 7, o: 3 });
    const s = me(g, 'a');
    expect(s.x).toBeLessThanOrEqual(1);
    expect(s.y).toBeGreaterThanOrEqual(0.14);
    g.report('a', 1, false, { x: 0.5, y: 0.3, dir: 0, o: 0 });
    expect(me(g, 'a').alive).toBe(false);
  });
});
