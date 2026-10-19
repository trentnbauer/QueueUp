import { describe, expect, it } from 'vitest';
import { RopeGame } from './rope.js';

const STEP = 33;
const run = (g: RopeGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: RopeGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new RopeGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Seconds until the rope next reaches the floor. */
function untilFloor(g: RopeGame) {
  const s = g.snapshot();
  return (1 - s.angle) * s.period;
}

/** A player who watches the rope and jumps, once a swing, `lead` seconds before it reaches the floor. */
function playBot(g: RopeGame, ids: string[], ms: number, lead = 0.2) {
  let jumpedOn = -1;
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    if (untilFloor(g) < lead && g.snapshot().meters !== jumpedOn) {
      jumpedOn = g.snapshot().meters;
      for (const id of ids) g.action(id, 'jump');
    }
    g.tick(STEP);
  }
}

describe('RopeGame rounds', () => {
  it('counts down for a lone jumper, then starts a run', () => {
    const g = new RopeGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').alive).toBe(true);
  });

  it('catches someone who never jumps, and ends a solo run with no winner', () => {
    const g = started(['a']);
    for (let t = 0; t < 8000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(false);
  });

  it('only jumps from the floor, and lands again', () => {
    const g = started(['a']);
    g.action('a', 'jump');
    g.tick(100);
    expect(me(g, 'a').y).toBeGreaterThan(0.1);
    g.tick(200); // past the top of the jump, on the way down
    const falling = me(g, 'a').y;
    g.action('a', 'jump'); // in the air: ignored
    g.tick(100);
    expect(me(g, 'a').y).toBeLessThan(falling);
    run(g, 600);
    expect(me(g, 'a').y).toBe(0);
  });

  it('ignores jumps before the run starts and unknown actions', () => {
    const g = new RopeGame(seeded(0.3));
    g.join('a');
    g.action('a', 'jump');
    run(g, 3200);
    expect(me(g, 'a').y).toBe(0);
    g.action('a', 'flap');
    g.tick(100);
    expect(me(g, 'a').y).toBe(0);
  });

  it('spreads people across the floor', () => {
    const g = started(['a', 'b', 'c']);
    expect(g.snapshot().players.map((p) => p.x)).toEqual([0.167, 0.5, 0.833]);
  });

  it('gives the last jumper the win', () => {
    const g = started(['a', 'b']);
    // Both jump the first swing, then only `a` carries on.
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      if (untilFloor(g) < 0.2) {
        g.action('a', 'jump');
        if (g.snapshot().meters < 1) g.action('b', 'jump');
      }
      g.tick(STEP);
    }
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('is a draw when everyone is caught at once', () => {
    const g = started(['a', 'b']);
    run(g, 3000);
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('lets someone who arrives mid-run watch, then jump from the next one', () => {
    const g = started(['a']);
    g.join('b');
    expect(me(g, 'b').alive).toBe(false);
    for (let t = 0; t < 30_000 && g.snapshot().run < 2; t += STEP) g.tick(STEP);
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'b').alive).toBe(true);
  });
});

describe('RopeGame course', () => {
  it('can always be cleared: a bot that times its jumps lasts a minute on several seeds', () => {
    for (const seed of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const g = started(['a'], seed);
      playBot(g, ['a'], 60_000);
      expect(g.snapshot().phase, `seed ${seed}`).toBe('playing');
      expect(me(g, 'a').alive).toBe(true);
    }
  });

  it('counts the swings jumped as the score', () => {
    const g = started(['a']);
    playBot(g, ['a'], 20_000);
    expect(g.snapshot().meters).toBeGreaterThan(8);
    expect(me(g, 'a').meters).toBe(g.snapshot().meters);
  });

  it('speeds up, but never past the quickest a jump can be timed', () => {
    const g = started(['a']);
    const periods: number[] = [];
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      if (untilFloor(g) < 0.2) g.action('a', 'jump');
      g.tick(STEP);
      periods.push(g.snapshot().period);
    }
    expect(Math.min(...periods)).toBeGreaterThanOrEqual(0.65);
    expect(Math.min(...periods)).toBeLessThan(1.8);
  });

  it('makes the swings the same for the same seed', () => {
    const swings = (seed: number) => {
      const g = started(['a'], seed);
      const out: number[] = [];
      for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) {
        if (untilFloor(g) < 0.2) g.action('a', 'jump');
        g.tick(STEP);
        out.push(g.snapshot().period);
      }
      return JSON.stringify(out);
    };
    expect(swings(0.4)).toBe(swings(0.4));
    expect(swings(0.4)).not.toBe(swings(0.9));
  });

  it('catches a jumper who is too early or too late', () => {
    for (const lead of [0.6, -0.1]) {
      const g = started(['a']);
      playBot(g, ['a'], 20_000, lead);
      expect(g.snapshot().phase, `lead ${lead}`).toBe('over');
    }
  });
});
