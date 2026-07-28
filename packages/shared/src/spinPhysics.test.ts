import { describe, it, expect } from 'vitest';
import {
  velocityAt,
  positionAt,
  settledPositionOf,
  settlesAtOf,
  applyNudge,
  candidateIndexAt,
  SPIN_FRICTION,
  SPIN_INITIAL_VELOCITY,
  SPIN_NUDGE_DELTA,
  SPIN_MAX_VELOCITY,
  SPIN_STOP_THRESHOLD,
  type SpinBase,
} from './spinPhysics.js';

const T0 = 1_000_000; // arbitrary epoch ms reference

function freshBase(): SpinBase {
  return { position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: T0 };
}

describe('velocityAt', () => {
  it('equals velocity0 at timestamp0', () => {
    expect(velocityAt(freshBase(), T0)).toBeCloseTo(SPIN_INITIAL_VELOCITY, 6);
  });

  it('decays exponentially over time', () => {
    const base = freshBase();
    const v1 = velocityAt(base, T0 + 1000);
    const v2 = velocityAt(base, T0 + 2000);
    expect(v1).toBeLessThan(SPIN_INITIAL_VELOCITY);
    expect(v2).toBeLessThan(v1);
    expect(v1).toBeCloseTo(SPIN_INITIAL_VELOCITY * Math.exp(-SPIN_FRICTION * 1), 6);
  });

  it('never goes negative or clamps before timestamp0 (treats earlier times as t=0)', () => {
    expect(velocityAt(freshBase(), T0 - 5000)).toBeCloseTo(SPIN_INITIAL_VELOCITY, 6);
  });

  it('approaches zero but never resolves to a negative number, arbitrarily far out', () => {
    expect(velocityAt(freshBase(), T0 + 1_000_000)).toBeGreaterThanOrEqual(0);
  });
});

describe('positionAt', () => {
  it('equals position0 at timestamp0', () => {
    expect(positionAt(freshBase(), T0)).toBeCloseTo(0, 6);
  });

  it('is monotonically increasing while velocity is positive', () => {
    const base = freshBase();
    const p1 = positionAt(base, T0 + 500);
    const p2 = positionAt(base, T0 + 1500);
    const p3 = positionAt(base, T0 + 5000);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it('converges to settledPositionOf as time goes to infinity', () => {
    const base = freshBase();
    const farOut = positionAt(base, T0 + 60_000);
    expect(farOut).toBeCloseTo(settledPositionOf(base), 3);
  });
});

describe('settledPositionOf', () => {
  it('equals position0 + velocity0 / FRICTION', () => {
    const base = freshBase();
    expect(settledPositionOf(base)).toBeCloseTo(base.velocity0 / SPIN_FRICTION, 6);
  });

  it('is ~= position0 when velocity0 is already at/under the stop threshold', () => {
    const base: SpinBase = { position0: 12.3, velocity0: SPIN_STOP_THRESHOLD, timestamp0: T0 };
    expect(settledPositionOf(base)).toBeCloseTo(12.3 + SPIN_STOP_THRESHOLD / SPIN_FRICTION, 6);
  });
});

describe('settlesAtOf', () => {
  it('is in the future for a freshly-started spin', () => {
    const base = freshBase();
    expect(settlesAtOf(base)).toBeGreaterThan(T0);
  });

  it('is exactly timestamp0 when velocity0 is already at/under the stop threshold', () => {
    const base: SpinBase = { position0: 0, velocity0: SPIN_STOP_THRESHOLD, timestamp0: T0 };
    expect(settlesAtOf(base)).toBe(T0);
    const slower: SpinBase = { position0: 0, velocity0: SPIN_STOP_THRESHOLD / 2, timestamp0: T0 };
    expect(settlesAtOf(slower)).toBe(T0);
  });

  it('velocityAt(settlesAt) is (approximately) exactly the stop threshold', () => {
    const base = freshBase();
    const settlesAt = settlesAtOf(base);
    expect(velocityAt(base, settlesAt)).toBeCloseTo(SPIN_STOP_THRESHOLD, 6);
  });

  it('a higher starting velocity settles later', () => {
    const slow: SpinBase = { position0: 0, velocity0: 5, timestamp0: T0 };
    const fast: SpinBase = { position0: 0, velocity0: 20, timestamp0: T0 };
    expect(settlesAtOf(fast)).toBeGreaterThan(settlesAtOf(slow));
  });

  it('positionAt(settlesAt) is within the stop threshold\'s remaining distance of settledPositionOf', () => {
    const base = freshBase();
    const settlesAt = settlesAtOf(base);
    const remainingDistance = SPIN_STOP_THRESHOLD / SPIN_FRICTION;
    expect(settledPositionOf(base) - positionAt(base, settlesAt)).toBeCloseTo(remainingDistance, 6);
  });
});

describe('applyNudge', () => {
  it('right increases the current velocity by SPIN_NUDGE_DELTA', () => {
    const base = freshBase();
    const atMs = T0 + 500;
    const currentVelocity = velocityAt(base, atMs);
    const nudged = applyNudge(base, atMs, 'right');
    expect(nudged.velocity0).toBeCloseTo(currentVelocity + SPIN_NUDGE_DELTA, 6);
    expect(nudged.timestamp0).toBe(atMs);
  });

  it('left decreases the current velocity by SPIN_NUDGE_DELTA', () => {
    const base = freshBase();
    const atMs = T0 + 500;
    const currentVelocity = velocityAt(base, atMs);
    const nudged = applyNudge(base, atMs, 'left');
    expect(nudged.velocity0).toBeCloseTo(Math.max(0, currentVelocity - SPIN_NUDGE_DELTA), 6);
  });

  it('freezes the current (decayed) position as the new position0, not the old base position0', () => {
    const base = freshBase();
    const atMs = T0 + 500;
    const currentPosition = positionAt(base, atMs);
    const nudged = applyNudge(base, atMs, 'right');
    expect(nudged.position0).toBeCloseTo(currentPosition, 6);
    expect(nudged.position0).not.toBeCloseTo(base.position0, 3);
  });

  it('clamps velocity at 0 - repeated left nudges never go negative', () => {
    let base = freshBase();
    for (let i = 0; i < 20; i++) {
      base = applyNudge(base, base.timestamp0 + 10, 'left');
    }
    expect(base.velocity0).toBe(0);
  });

  it('clamps velocity at SPIN_MAX_VELOCITY - repeated right nudges never exceed it', () => {
    let base = freshBase();
    for (let i = 0; i < 20; i++) {
      base = applyNudge(base, base.timestamp0 + 10, 'right');
    }
    expect(base.velocity0).toBe(SPIN_MAX_VELOCITY);
  });

  it('a right nudge always pushes the eventual settle position further than doing nothing', () => {
    const base = freshBase();
    const atMs = T0 + 800;
    const unnudgedFinal = settledPositionOf(base);
    const nudged = applyNudge(base, atMs, 'right');
    expect(settledPositionOf(nudged)).toBeGreaterThan(unnudgedFinal);
  });

  it('a left nudge always pulls the eventual settle position closer than doing nothing (given the same clock)', () => {
    const base = freshBase();
    const atMs = T0 + 800;
    const unnudged = settledPositionOf(base);
    const nudged = applyNudge(base, atMs, 'left');
    expect(settledPositionOf(nudged)).toBeLessThan(unnudged);
  });

  it('a nudge that arrives after the spin already settled is a well-defined no-worse-than-frozen operation', () => {
    const base: SpinBase = { position0: 4, velocity0: 0, timestamp0: T0 };
    const nudged = applyNudge(base, T0 + 5000, 'right');
    expect(nudged.velocity0).toBeCloseTo(SPIN_NUDGE_DELTA, 6);
    expect(nudged.position0).toBeCloseTo(4, 6);
  });
});

describe('candidateIndexAt', () => {
  it('rounds to the nearest whole slot', () => {
    expect(candidateIndexAt(3.2, 10)).toBe(3);
    expect(candidateIndexAt(3.6, 10)).toBe(4);
  });

  it('wraps forward past the strip length', () => {
    expect(candidateIndexAt(10, 10)).toBe(0);
    expect(candidateIndexAt(23, 10)).toBe(3);
  });

  it('wraps negative positions into range', () => {
    expect(candidateIndexAt(-1, 10)).toBe(9);
    expect(candidateIndexAt(-11, 10)).toBe(9);
  });

  it('handles a length-1 strip (single eligible candidate) without dividing by zero', () => {
    expect(candidateIndexAt(0, 1)).toBe(0);
    expect(candidateIndexAt(17.8, 1)).toBe(0);
    expect(candidateIndexAt(-4.2, 1)).toBe(0);
  });
});

describe('two observers checking at different times agree on the outcome', () => {
  it('settledPositionOf/settlesAtOf are pure functions of the base alone, not of when they are called', () => {
    const base = applyNudge(freshBase(), T0 + 1234, 'right');
    // Simulates two clients (or the server, twice) independently reading the same persisted base
    // at different wall-clock moments - both must derive the identical eventual winner slot.
    const observedAtA = settledPositionOf(base);
    const observedAtB = settledPositionOf(base);
    expect(observedAtA).toBe(observedAtB);
    expect(settlesAtOf(base)).toBe(settlesAtOf(base));
  });
});
