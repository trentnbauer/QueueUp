import { describe, expect, it } from 'vitest';
import { LavaGame } from './lava.js';

const STEP = 33;
const run = (g: LavaGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: LavaGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new LavaGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Climbs: jumps the moment it is standing on a plank. */
function climb(g: LavaGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    if (me(g, id).grounded) g.action(id, 'jump');
    g.tick(STEP);
  }
}

describe('LavaGame', () => {
  it('starts everyone on the first plank with the lava below', () => {
    const g = started(['a', 'b']);
    const snap = g.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.lava).toBeGreaterThanOrEqual(0);
    for (const p of snap.players) expect(p).toMatchObject({ grounded: true, alive: true });
    expect(snap.planks[0].z).toBeGreaterThan(snap.lava);
  });

  it('makes the same planks for the same seed, and keeps them within a jump of each other', () => {
    const planks = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 1000);
      return g.snapshot().planks.map((p) => p.z);
    };
    expect(planks(0.4)).toEqual(planks(0.4));
    for (const seed of [0.1, 0.5, 0.9]) {
      const zs = planks(seed);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeLessThanOrEqual(0.23 + 1e-6);
    }
  });

  it('jumps only from a plank, and lands on the next one up', () => {
    const g = started(['a']);
    const first = me(g, 'a').z;
    g.action('a', 'jump');
    expect(me(g, 'a').grounded).toBe(false);
    g.action('a', 'jump'); // in the air: ignored
    run(g, 200);
    expect(me(g, 'a').z).toBeGreaterThan(first);
    for (let t = 0; t < 2000 && !me(g, 'a').grounded; t += STEP) g.tick(STEP);
    expect(me(g, 'a').grounded).toBe(true);
  });

  it('knocks out a player who stands still as the lava catches them', () => {
    const g = started(['a']);
    run(g, 60_000);
    expect(g.snapshot().phase).not.toBe('playing');
    expect(g.snapshot().history.at(-1)?.meters).toBeGreaterThan(0);
  });

  it('lets a player who keeps jumping climb for a long time, on several courses', () => {
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      climb(g, 'a', 20_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(5);
    }
  });

  it('raises the lava faster as the run goes on, so every run ends', () => {
    const g = started(['a']);
    const rate = () => g.snapshot().speed;
    const early = rate();
    climb(g, 'a', 20_000);
    expect(rate()).toBeGreaterThan(early);
    const far = started(['a']);
    let ended = false;
    for (let t = 0; t < 300_000 && !ended; t += STEP) {
      if (me(far, 'a').grounded) far.action('a', 'jump');
      far.tick(STEP);
      ended = far.snapshot().phase !== 'playing';
    }
    expect(ended).toBe(true);
  });

  it('gives the run to the last climber', () => {
    const g = started(['a', 'b']);
    // a keeps climbing while b stands still and is caught.
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
      if (me(g, 'a').grounded) g.action('a', 'jump');
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
  });

  it('works out a player who reports from their own device, and leaves them to it', () => {
    const g = started(['a', 'b']);
    g.report('a', g.snapshot().run, true, { z: 0.5, vy: 0, g: 1 });
    run(g, 100);
    expect(me(g, 'a').z).toBe(0.5);
  });
});
