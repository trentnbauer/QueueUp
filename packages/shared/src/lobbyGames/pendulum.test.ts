import { describe, expect, it } from 'vitest';
import { PENDULUM_AMPLITUDE, PendulumGame, pendulumLanding } from './pendulum.js';

const STEP = 20;
const run = (g: PendulumGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: PendulumGame) => g.snapshot();
const me = (g: PendulumGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new PendulumGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

function toSweep(g: PendulumGame, round = 1) {
  for (let i = 0; i < 1000; i++) {
    const s = snap(g);
    if (s.stage === 'sweep' && s.round >= round) return s;
    g.tick(STEP);
  }
  throw new Error('no swing started');
}

/** Lets go as soon as the ball would land within `within` of the middle of the platform. The landing is worked out the way a player would: from the angle on show and how fast it is moving (here, from the change since the last look). */
function dropInZone(g: PendulumGame, id: string, within: (half: number, excellent: number) => number): boolean {
  let last = snap(g).angle;
  for (let i = 0; i < 400 && snap(g).stage === 'sweep' && !me(g, id).dropped; i++) {
    g.tick(STEP);
    const s = snap(g);
    const speed = (s.angle - last) / (STEP / 1000);
    last = s.angle;
    if (Math.abs(pendulumLanding(s.angle, speed) - s.centre) < within(s.half, s.excellent)) {
      g.action(id, 'drop');
      return true;
    }
  }
  return false;
}

describe('pendulumLanding', () => {
  it('drops straight down from the bottom of the swing when it is not moving, and throws the way the arm is moving', () => {
    expect(pendulumLanding(0, 0)).toBeCloseTo(0.5, 5);
    expect(pendulumLanding(0, 2)).toBeGreaterThan(0.6);
    expect(pendulumLanding(0, -2)).toBeLessThan(0.4);
  });

  it('lands out to the side at the top of the swing, where the arm is still', () => {
    expect(pendulumLanding(PENDULUM_AMPLITUDE, 0)).toBeGreaterThan(0.6);
    expect(pendulumLanding(-PENDULUM_AMPLITUDE, 0)).toBeLessThan(0.4);
  });

  it('reaches every place the platform can be', () => {
    // Over a swing, the landing spot covers at least 0.2 to 0.8 at the first round's speed.
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 2 * Math.PI; t += 0.01) {
      const at = pendulumLanding(PENDULUM_AMPLITUDE * Math.sin(t), PENDULUM_AMPLITUDE * 2.4 * Math.cos(t));
      lo = Math.min(lo, at);
      hi = Math.max(hi, at);
    }
    expect(lo).toBeLessThan(0.2);
    expect(hi).toBeGreaterThan(0.8);
  });
});

describe('PendulumGame', () => {
  it('starts a swing after a moment, with the platform clear of the sides', () => {
    const g = started(['a']);
    const s = toSweep(g);
    expect(s.round).toBe(1);
    expect(s.centre - s.half).toBeGreaterThan(0.05);
    expect(s.centre + s.half).toBeLessThan(0.95);
    expect(Math.abs(s.angle)).toBeLessThanOrEqual(PENDULUM_AMPLITUDE);
    expect(s.excellent).toBeLessThan(s.half);
  });

  it('swings: the angle changes while it sweeps, and stays within the amplitude', () => {
    const g = started(['a']);
    toSweep(g);
    const angles = new Set<number>();
    for (let i = 0; i < 100 && snap(g).stage === 'sweep'; i++) {
      g.tick(STEP);
      angles.add(snap(g).angle);
      expect(Math.abs(snap(g).angle)).toBeLessThanOrEqual(PENDULUM_AMPLITUDE + 1e-3);
    }
    expect(angles.size).toBeGreaterThan(20);
  });

  it('scores 2 for a ball in the excellent middle and 1 for the rest of the platform, and goes on to the next round', () => {
    const g = started(['a', 'b']);
    toSweep(g);
    expect(dropInZone(g, 'a', (_h, e) => e * 0.5)).toBe(true);
    expect(dropInZone(g, 'b', (h, e) => (h + e) / 2)).toBe(true);
    // 'b' may have landed anywhere between the middle and the edge; it is in.
    expect(me(g, 'a')).toMatchObject({ dropped: true, alive: true });
    expect(me(g, 'b').alive).toBe(true);
    run(g, 200);
    expect(snap(g).stage).toBe('result');
    expect(me(g, 'a').meters).toBe(2);
    expect([1, 2]).toContain(me(g, 'b').meters);
  });

  it('puts a player out whose ball misses the platform, and shows where it landed', () => {
    const g = started(['a', 'b']);
    toSweep(g);
    // Let go when the ball would land well off the platform.
    let last = snap(g).angle;
    for (let i = 0; i < 400 && !me(g, 'a').dropped; i++) {
      g.tick(STEP);
      const s = snap(g);
      const speed = (s.angle - last) / (STEP / 1000);
      last = s.angle;
      if (Math.abs(pendulumLanding(s.angle, speed) - s.centre) > s.half + 0.1) g.action('a', 'drop');
    }
    expect(me(g, 'a')).toMatchObject({ alive: false, dropped: true });
    expect(me(g, 'a').at).toBeGreaterThanOrEqual(-1);
  });

  it('puts a player out who never lets go, and ignores a second drop', () => {
    const g = started(['a']);
    toSweep(g);
    run(g, 6500);
    expect(snap(g).phase === 'over' || snap(g).run > 1).toBe(true);
    const h = started(['a', 'b']);
    toSweep(h);
    dropInZone(h, 'a', (half) => half);
    const at = me(h, 'a').at;
    h.action('a', 'drop');
    expect(me(h, 'a').at).toBe(at);
  });

  it('makes each round faster with a smaller platform', () => {
    const g = started(['a']);
    const first = toSweep(g);
    expect(dropInZone(g, 'a', (_h, e) => e)).toBe(true);
    run(g, 100);
    const second = toSweep(g, 2);
    expect(second.half).toBeLessThan(first.half);
    expect(second.round).toBe(2);
  });

  it('can be cleared for several rounds by a player who works the landing out, on several seeds', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = started(['a'], seed);
      for (let round = 1; round <= 6; round++) {
        toSweep(g, round);
        const ok = dropInZone(g, 'a', (h) => h * 0.6);
        expect(ok, `seed ${seed} round ${round}`).toBe(true);
        expect(me(g, 'a').alive, `seed ${seed} round ${round}`).toBe(true);
        run(g, 100);
      }
      expect(me(g, 'a').meters).toBeGreaterThanOrEqual(6);
    }
  });

  it('judges a ball on what the player saw, not when the press arrived', () => {
    // A press that reaches the server late is judged on the angle from `pressBehindMs` earlier.
    const a = started(['a'], 5);
    const b = started(['a'], 5);
    toSweep(a);
    toSweep(b);
    run(a, 1000);
    run(b, 1000);
    a.action('a', 'drop');
    b.pressBehindMs = 300;
    b.action('a', 'drop');
    b.pressBehindMs = 0;
    expect(me(b, 'a').at).not.toBe(me(a, 'a').at);
  });
});
