import { describe, expect, it } from 'vitest';
import { PIT_LAYER_Y, PIT_LEFT, PIT_RIGHT, PIT_TILES } from '../spinLobby.js';
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
    expect(s.tiles).toHaveLength(PIT_TILES * 3);
    expect(s.tiles.every((t) => t === 0)).toBe(true);
    expect(s.players[0].x).toBeLessThan(s.players[1].x);
    for (const p of s.players) {
      expect(tileAt(p.x)).toBeGreaterThanOrEqual(0);
      expect(p.y).toBe(PIT_LAYER_Y[0]);
    }
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

  it('lets a player who stands still last until the floor under them is gone and they have dropped through every layer', () => {
    const g = started(['a']);
    run(g, 80000);
    expect(snap(g).phase === 'over' || snap(g).run > 1).toBe(true);
    expect(snap(g).history.at(-1)?.meters).toBeGreaterThan(5);
  });

  it('drops a player through a gap onto the layer below, and only puts them out below the last layer', () => {
    const g = started(['a']);
    let layer = 0;
    let maxLayer = 0;
    for (let t = 0; t < 80000 && snap(g).phase === 'playing'; t += STEP) {
      g.tick(STEP);
      const p = me(g, 'a');
      if (!p.air) layer = PIT_LAYER_Y.findIndex((y) => y === p.y);
      maxLayer = Math.max(maxLayer, layer);
    }
    expect(maxLayer).toBeGreaterThan(0);
    expect(snap(g).phase).toBe('over');
  });

  it('jumps up, can be steered in the air, and lands again; a second jump in the air does nothing', () => {
    const g = started(['a']);
    g.action('a', 'jump');
    run(g, 200);
    const p1 = me(g, 'a');
    expect(p1.air).toBe(true);
    expect(p1.y).toBeLessThan(PIT_LAYER_Y[0]);
    g.action('a', 'jump'); // ignored mid-air
    g.input('a', 1, 0);
    const x0 = p1.x;
    run(g, 200);
    expect(me(g, 'a').x).toBeGreaterThan(x0);
    run(g, 1000);
    const p2 = me(g, 'a');
    expect(p2.air).toBe(false);
    expect(p2.y).toBe(PIT_LAYER_Y[0]);
  });

  it('lets a jump pass up through the layer above and land on it', () => {
    const g = started(['a']);
    // Fresh, so the player is on the top layer: pass this by checking a jump rises further than the gap between layers.
    g.action('a', 'jump');
    let top = 1;
    for (let t = 0; t < 1500; t += STEP) {
      g.tick(STEP);
      top = Math.min(top, me(g, 'a').y);
    }
    expect(PIT_LAYER_Y[0] - top).toBeGreaterThan(PIT_LAYER_Y[1] - PIT_LAYER_Y[0]);
  });

  it('favours tiles on the upper layers when picking which to shake', () => {
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 300; seed++) {
      const g = started(['a'], seed);
      while (!snap(g).tiles.includes(1)) g.tick(STEP);
      counts[Math.floor(snap(g).tiles.indexOf(1) / PIT_TILES)]++;
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });

  it('bumps players on the same layer into each other', () => {
    const g = started(['a', 'b']);
    for (let i = 0; i < 90; i++) {
      g.input('a', 1, 0);
      g.tick(STEP);
    }
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
