import { describe, expect, it } from 'vitest';
import { LAVA_CEILING } from '../spinLobby.js';
import { LavaGame } from './lava.js';

const STEP = 33;
const run = (g: LavaGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: LavaGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new LavaGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** The plank each bot is heading for, kept while it is in the air (so it does not change its mind part way through a jump). */
const targets = new WeakMap<LavaGame, { n: number; x: number; w: number }>();

/** Climbs like a person would: heads for the lowest plank above that a jump can reach, slides under it, and jumps when there. */
function climbStep(g: LavaGame, id: string) {
  const snap = g.snapshot();
  const c = me(g, id);
  let next = targets.get(g);
  if (c.grounded || !next || !snap.planks.some((p) => p.n === next!.n)) {
    next = snap.planks.filter((p) => p.z > c.z + 0.02 && p.z <= c.z + 0.26 && p.z <= snap.lava + LAVA_CEILING - 0.03).sort((a, b) => a.z - b.z)[0];
    if (next) targets.set(g, next);
  }
  if (!next) {
    g.input(id, 0, 0);
    return;
  }
  const dx = next.x - c.x;
  g.input(id, Math.abs(dx) < 0.02 ? 0 : dx > 0 ? 1 : -1, 0);
  if (c.grounded && Math.abs(dx) < next.w / 2 - 0.04) g.action(id, 'jump');
}

function climb(g: LavaGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    climbStep(g, id);
    g.tick(STEP);
  }
}

describe('LavaGame', () => {
  it('starts everyone on the first, wide plank with the lava below', () => {
    const g = started(['a', 'b']);
    const snap = g.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.lava).toBeGreaterThanOrEqual(0);
    for (const p of snap.players) expect(p).toMatchObject({ grounded: true, alive: true });
    expect(snap.planks[0].z).toBeGreaterThan(snap.lava);
    expect(snap.planks[0].w).toBeGreaterThan(0.8);
  });

  it('makes the same planks for the same seed, narrowing, within a jump of each other in height and sideways', () => {
    const planks = (seed: number) => {
      const g = started(['a'], seed);
      climb(g, 'a', 8000);
      return g.snapshot().planks;
    };
    expect(planks(11)).toEqual(planks(11));
    for (const seed of [3, 11, 19]) {
      const zs = planks(seed).sort((a, b) => a.z - b.z);
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i].z - zs[i - 1].z).toBeLessThanOrEqual(0.23 + 1e-6);
        expect(Math.abs(zs[i].x - zs[i - 1].x)).toBeLessThanOrEqual(0.28 + 1e-6);
        expect(zs[i].w).toBeLessThanOrEqual(0.4 + 1e-6);
        expect(zs[i].w).toBeGreaterThanOrEqual(0.2 - 1e-6);
      }
    }
  });

  it('slides left and right, on a plank or in the air, and stays on the screen', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    run(g, 300);
    expect(me(g, 'a').x).toBeGreaterThan(0.5);
    g.input('a', -1, 0);
    run(g, 100);
    g.input('a', 99, 0); // junk input is no direction
    const x = me(g, 'a').x;
    run(g, 100);
    expect(me(g, 'a').x).toBe(x);
  });

  it('jumps only from a plank, and lands on a plank above', () => {
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

  it('drops a player who walks off the end of a plank', () => {
    const g = started(['a']);
    const first = me(g, 'a').z;
    g.input('a', 1, 0);
    // The first plank is 0.9 wide: walking right for a while takes them off its end.
    for (let t = 0; t < 2000 && me(g, 'a').grounded; t += STEP) g.tick(STEP);
    expect(me(g, 'a').grounded).toBe(false);
    run(g, 100);
    expect(me(g, 'a').z).toBeLessThan(first);
  });

  it('cannot be climbed out of sight: mashing jump never gets past the ceiling, and does not win', () => {
    const g = started(['a']);
    let highest = 0;
    for (let t = 0; t < 120_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      g.action('a', 'jump'); // mash it, standing still
      g.tick(STEP);
      const s = g.snapshot();
      highest = Math.max(highest, me(g, 'a').z - s.lava);
    }
    expect(highest).toBeLessThanOrEqual(LAVA_CEILING + 1e-6);
    // Standing in one spot, the lava catches them.
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('knocks out a player who stands still as the lava catches them', () => {
    const g = started(['a']);
    run(g, 60_000);
    expect(g.snapshot().phase).not.toBe('playing');
    expect(g.snapshot().history.at(-1)?.meters).toBeGreaterThan(0);
  });

  it('lets a player who slides under each plank and jumps climb for a long time, on several courses', () => {
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], seed);
      climb(g, 'a', 20_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(5);
    }
  });

  it('raises the lava faster as the run goes on, so every run ends, even for the best climber', () => {
    const g = started(['a']);
    const early = g.snapshot().speed;
    climb(g, 'a', 20_000);
    expect(g.snapshot().speed).toBeGreaterThan(early);
    const far = started(['a']);
    let ended = false;
    for (let t = 0; t < 400_000 && !ended; t += STEP) {
      climbStep(far, 'a');
      far.tick(STEP);
      ended = far.snapshot().phase !== 'playing';
    }
    expect(ended).toBe(true);
  });

  it('gives the run to the last climber', () => {
    const g = started(['a', 'b']);
    // a keeps climbing while b stands still and is caught.
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
      climbStep(g, 'a');
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
  });

  it('works out a player who reports from their own device, and leaves them to it', () => {
    const g = started(['a', 'b']);
    g.report('a', g.snapshot().run, true, { x: 0.3, z: 0.5, vy: 0, g: 1 });
    run(g, 100);
    expect(me(g, 'a').z).toBe(0.5);
    expect(me(g, 'a').x).toBe(0.3);
  });
});
