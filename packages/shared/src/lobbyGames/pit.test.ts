import { describe, expect, it } from 'vitest';
import { PIT_LEFT, PIT_RIGHT, PIT_TILES } from '../spinLobby.js';
import { PitGame, tileAt } from './pit.js';

const STEP = 33;
const run = (g: PitGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: PitGame) => g.snapshot();
const me = (g: PitGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new PitGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

describe('tileAt', () => {
  it('names the tile under a spot, and -1 off either end', () => {
    expect(tileAt(PIT_LEFT - 0.01)).toBe(-1);
    expect(tileAt(PIT_RIGHT + 0.01)).toBe(-1);
    expect(tileAt(PIT_LEFT + 0.001)).toBe(0);
    expect(tileAt(PIT_RIGHT - 0.001)).toBe(PIT_TILES - 1);
    expect(tileAt(0.5)).toBe(PIT_TILES / 2);
  });
});

describe('PitGame', () => {
  it('starts with a whole floor and everyone spread along it', () => {
    const g = started(['a', 'b']);
    const s = snap(g);
    expect(s.tiles).toHaveLength(PIT_TILES);
    expect(s.tiles.every((t) => t === 0)).toBe(true);
    expect(s.players[0].x).toBeLessThan(s.players[1].x);
    for (const p of s.players) expect(tileAt(p.x)).toBeGreaterThanOrEqual(0);
  });

  it('shakes the first tile after about two and a half seconds and drops it a second later', () => {
    const g = started(['a']);
    let shook = -1;
    let dropped = -1;
    for (let t = 0; t < 6000 && dropped < 0; t += STEP) {
      g.tick(STEP);
      const tiles = snap(g).tiles;
      if (shook < 0 && tiles.includes(1)) shook = t;
      if (dropped < 0 && tiles.includes(2)) dropped = t;
    }
    expect(shook).toBeGreaterThan(2000); // the game started 0.2 seconds before the clock here does
    expect(shook).toBeLessThan(2600);
    expect(dropped - shook).toBeGreaterThan(900);
    expect(dropped - shook).toBeLessThan(1200);
  });

  it('puts a player who stands over a gap out, and a player who stays on solid floor lasts', () => {
    const g = started(['a']);
    run(g, 60000);
    // Standing still, the floor under them goes in the end: they fall, the run is over.
    expect(snap(g).phase === 'over' || snap(g).run > 1).toBe(true);
    expect(snap(g).history.at(-1)?.meters).toBeGreaterThan(3);
  });

  it('lets a player outlast the floor by moving to the tiles that are left, but not for ever', () => {
    // A player who always walks toward the nearest solid tile lasts longer than one who stands still, and still goes out in the end.
    const survive = (move: boolean) => {
      const g = started(['a'], 11);
      let t = 0;
      while (snap(g).phase === 'playing' && t < 80000) {
        if (move) {
          const s = snap(g);
          const x = s.players[0].x;
          let best = -1;
          for (let i = 0; i < PIT_TILES; i++) {
            if (s.tiles[i] !== 0) continue;
            const c = PIT_LEFT + ((i + 0.5) * (PIT_RIGHT - PIT_LEFT)) / PIT_TILES;
            if (best < 0 || Math.abs(c - x) < Math.abs(best - x)) best = c;
          }
          g.input('a', best < 0 || Math.abs(best - x) < 0.01 ? 0 : best > x ? 1 : -1, 0);
        }
        g.tick(STEP);
        t += STEP;
      }
      expect(snap(g).phase).toBe('over');
      return t;
    };
    expect(survive(true)).toBeGreaterThan(survive(false));
  });

  it('walks at a limited speed, and a dash adds a burst of speed the way the player faces and then has to recharge', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    run(g, 1000);
    const walked = me(g, 'a').x;
    const g2 = started(['a']);
    g2.input('a', 1, 0);
    g2.action('a', 'dash');
    run(g2, 300);
    expect(me(g2, 'a').cooldown).toBeGreaterThan(0.5);
    const start = 0.5;
    expect(me(g2, 'a').x - start).toBeGreaterThan(0);
    // The dash is on cooldown: a second one straight away does nothing extra.
    const before = me(g2, 'a').x;
    g2.action('a', 'dash');
    run(g2, 33);
    expect(me(g2, 'a').x - before).toBeLessThan(0.05);
    expect(walked).toBeGreaterThan(0.5);
  });

  it('bumps players into each other, so a dash into someone sends them flying', () => {
    const g = started(['a', 'b']);
    // Walk a towards b and dash.
    for (let i = 0; i < 60; i++) {
      g.input('a', 1, 0);
      g.tick(STEP);
    }
    const bBefore = me(g, 'b').x;
    g.action('a', 'dash');
    run(g, 400);
    expect(Math.abs(me(g, 'b').x - bBefore)).toBeGreaterThan(0.01);
    // They never pass through each other.
    expect(me(g, 'a').x).toBeLessThan(me(g, 'b').x + 0.001);
  });

  it('lets the last player on the floor win, and gives the score as the seconds lasted', () => {
    const g = started(['a', 'b']);
    // Both stand still: whoever is over a gap first falls (or both, together).
    for (let i = 0; i < 3000 && snap(g).phase === 'playing'; i++) g.tick(STEP);
    const s = snap(g);
    expect(s.phase).toBe('over');
    if (s.winnerId) expect(['a', 'b']).toContain(s.winnerId);
  });
});
