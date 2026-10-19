import { describe, expect, it } from 'vitest';
import { LASER_HEIGHT, LASER_PLAYER_HEIGHT, LASER_PLAYER_WIDTH, LASER_PLAYER_Y } from '../spinLobby.js';
import { LaserGame } from './laser.js';

const STEP = 33;
const run = (g: LaserGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: LaserGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;
/** A varying random source, so the gaps are not all in one place. */
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], rng: () => number = seeded(0.3)) {
  const g = new LaserGame(rng);
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Slides to the middle of the gap in the next row to reach it (the lowest one that has not passed yet). */
function playBot(g: LaserGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const reach = (LASER_HEIGHT + LASER_PLAYER_HEIGHT) / 2;
    const next = snap.rows.filter((r) => r.y < LASER_PLAYER_Y + reach).sort((a, b) => b.y - a.y)[0];
    const x = me(g, id).x;
    const want = next ? next.gap : 0.5;
    g.input(id, Math.abs(want - x) < 0.01 ? 0 : want > x ? 1 : -1, 0);
    g.tick(STEP);
  }
}

describe('LaserGame', () => {
  it('starts everyone in the middle with no rows yet', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().phase).toBe('playing');
    for (const p of g.snapshot().players) expect(p).toMatchObject({ x: 0.5, alive: true });
  });

  it('slides left and right and stays on the screen', () => {
    const g = started(['a']);
    g.input('a', -1, 0);
    run(g, 5000);
    expect(me(g, 'a').x).toBeGreaterThanOrEqual(LASER_PLAYER_WIDTH / 2 - 1e-9);
    g.input('a', 99, 0); // junk input is no direction
    const before = me(g, 'a').x;
    run(g, 200);
    expect(me(g, 'a').x).toBe(before);
  });

  it('makes the same rows for the same seed, with a gap that narrows and never jumps further than can be slid', () => {
    const rows = (seed: number) => {
      const g = started(['a'], lcg(seed));
      const seen: { gap: number; width: number; n: number }[] = [];
      for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
        playBot(g, 'a', STEP);
        for (const r of g.snapshot().rows) if (!seen.some((s) => s.n === r.n)) seen.push({ gap: r.gap, width: r.width, n: r.n });
      }
      return seen;
    };
    expect(rows(7)).toEqual(rows(7));
    const seen = rows(11);
    expect(seen.length).toBeGreaterThan(20);
    expect(seen.at(-1)!.width).toBeLessThan(seen[0].width);
    for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i].gap - seen[i - 1].gap)).toBeLessThanOrEqual(0.35 * 1.1 + 1e-6);
  });

  it('knocks out a player who stays out of the gap', () => {
    const g = started(['a'], lcg(5));
    g.input('a', 1, 0);
    for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('lets a player who slides into each gap last a long time, on several courses', () => {
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], lcg(seed));
      playBot(g, 'a', 90_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(100);
    }
  });

  it('gives the run to the last one standing', () => {
    const g = started(['a', 'b'], lcg(5));
    for (let t = 0; t < 90_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const snap = g.snapshot();
      const next = snap.rows.filter((r) => r.y < LASER_PLAYER_Y + 0.04).sort((x, y) => y.y - x.y)[0];
      const x = me(g, 'a').x;
      const want = next ? next.gap : 0.5;
      g.input('a', Math.abs(want - x) < 0.01 ? 0 : want > x ? 1 : -1, 0);
      g.input('b', 0, 0);
      g.tick(STEP);
    }
    expect(g.snapshot().winnerId).toBe('a');
  });
});
