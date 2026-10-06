import { describe, it, expect } from 'vitest';
import {
  velocityAt,
  positionAt,
  settledPositionOf,
  settlesAtOf,
  applyNudge,
  candidateIndexAt,
  displayPositionAt,
  snappedSettledPosition,
  tickPosition,
  SPIN_FRICTION,
  SPIN_INITIAL_VELOCITY,
  SPIN_NUDGE_DELTA,
  SPIN_MAX_VELOCITY,
  SPIN_STOP_THRESHOLD,
  SPIN_NUDGE_COOLDOWN_MS,
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

  it('a negative (reversed) velocity0 decays toward zero from below, staying negative (issue #487)', () => {
    const base: SpinBase = { position0: 0, velocity0: -10, timestamp0: T0 };
    const v1 = velocityAt(base, T0 + 500);
    const v2 = velocityAt(base, T0 + 1500);
    expect(v1).toBeLessThan(0);
    expect(v1).toBeGreaterThan(-10);
    expect(v2).toBeGreaterThan(v1);
    expect(velocityAt(base, T0 + 1_000_000)).toBeLessThanOrEqual(0);
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

  it('moves backward (decreasing) under a negative velocity0, converging to its own settledPositionOf (issue #487)', () => {
    const base: SpinBase = { position0: 10, velocity0: -10, timestamp0: T0 };
    const p1 = positionAt(base, T0 + 500);
    const p2 = positionAt(base, T0 + 1500);
    expect(p1).toBeLessThan(10);
    expect(p2).toBeLessThan(p1);
    expect(positionAt(base, T0 + 60_000)).toBeCloseTo(settledPositionOf(base), 3);
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

  it('keys off velocity magnitude, not sign - a reversed spin settles the same as a forward one at the same speed (issue #487)', () => {
    const forward: SpinBase = { position0: 0, velocity0: 12, timestamp0: T0 };
    const reversed: SpinBase = { position0: 0, velocity0: -12, timestamp0: T0 };
    expect(settlesAtOf(reversed)).toBe(settlesAtOf(forward));
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
    expect(nudged.velocity0).toBeCloseTo(currentVelocity - SPIN_NUDGE_DELTA, 6);
  });

  it('freezes the current (decayed) position as the new position0, not the old base position0', () => {
    const base = freshBase();
    const atMs = T0 + 500;
    const currentPosition = positionAt(base, atMs);
    const nudged = applyNudge(base, atMs, 'right');
    expect(nudged.position0).toBeCloseTo(currentPosition, 6);
    expect(nudged.position0).not.toBeCloseTo(base.position0, 3);
  });

  it('clamps velocity at -SPIN_MAX_VELOCITY when a left nudge would push past it, reversing rather than stopping dead (issue #487)', () => {
    const base: SpinBase = { position0: 0, velocity0: -SPIN_MAX_VELOCITY, timestamp0: T0 };
    const nudged = applyNudge(base, T0 + SPIN_NUDGE_COOLDOWN_MS, 'left');
    expect(nudged.velocity0).toBe(-SPIN_MAX_VELOCITY);
  });

  it('clamps velocity at SPIN_MAX_VELOCITY - a right nudge never pushes past it', () => {
    const base: SpinBase = { position0: 0, velocity0: SPIN_MAX_VELOCITY, timestamp0: T0 };
    const nudged = applyNudge(base, T0 + SPIN_NUDGE_COOLDOWN_MS, 'right');
    expect(nudged.velocity0).toBe(SPIN_MAX_VELOCITY);
  });

  it('a nudge within SPIN_NUDGE_COOLDOWN_MS of the base is rejected as a no-op (issue #487 spam-click guard)', () => {
    const base = freshBase();
    const tooSoon = applyNudge(base, base.timestamp0 + SPIN_NUDGE_COOLDOWN_MS - 1, 'left');
    expect(tooSoon).toBe(base);
  });

  it('a nudge exactly at the cooldown boundary or later is accepted', () => {
    const base = freshBase();
    const nudged = applyNudge(base, base.timestamp0 + SPIN_NUDGE_COOLDOWN_MS, 'left');
    expect(nudged).not.toBe(base);
    expect(nudged.timestamp0).toBe(base.timestamp0 + SPIN_NUDGE_COOLDOWN_MS);
  });

  it('spam-clicking left flattens into a bounded number of accepted nudges rather than an instant stop', () => {
    // 50 clicks 5ms apart (well under the cooldown) all starting from a fresh spin - the old
    // behavior floored velocity at 0 almost immediately, settling the spin the instant the last
    // of a rapid-fire burst landed. Now most of the burst is rejected by the cooldown, and the
    // ones that do land only ever reverse the spin - it never reports itself as already settled
    // partway through a still-active mash.
    let base = freshBase();
    let accepted = 0;
    let t = base.timestamp0;
    for (let i = 0; i < 50; i++) {
      t += 5;
      const next = applyNudge(base, t, 'left');
      if (next !== base) accepted++;
      base = next;
    }
    expect(accepted).toBeLessThan(50);
    expect(Math.abs(base.velocity0)).toBeLessThanOrEqual(SPIN_MAX_VELOCITY);
    expect(settlesAtOf(base)).toBeGreaterThan(base.timestamp0);
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

// ---- the drawn reel: ticks from card to card and lands exactly on the winner ----
const displayBase = (over: Partial<SpinBase> = {}): SpinBase => ({ position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: 1_000_000, ...over });

describe('tickPosition', () => {
  it('holds each card for the first half of its slot and moves over the second', () => {
    expect(tickPosition(3)).toBe(3);
    expect(tickPosition(3.25)).toBe(3);
    expect(tickPosition(3.5)).toBe(3);
    expect(tickPosition(3.75)).toBeCloseTo(3.5, 5);
    expect(tickPosition(3.9999)).toBeCloseTo(4, 3);
    expect(tickPosition(-2.75)).toBe(-3);
    expect(tickPosition(-2.25)).toBeCloseTo(-2.5, 5);
  });

  it('never goes backwards as the position moves forwards', () => {
    let prev = -Infinity;
    for (let p = -3; p <= 3; p += 0.01) {
      const v = tickPosition(p);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
});

describe('displayPositionAt', () => {
  it('starts where the spin started', () => {
    expect(displayPositionAt(displayBase({ position0: 4 }), 1_000_000)).toBe(4);
  });

  it('comes to rest exactly on a whole slot, the same one the winner is read from', () => {
    for (const [position0, velocity0] of [[0, 24], [3.4, 24], [10.7, 17.3], [0, -12.6], [5.5, 30]] as const) {
      const b = displayBase({ position0, velocity0 });
      const end = displayPositionAt(b, settlesAtOf(b) + 60_000);
      expect(Number.isInteger(end)).toBe(true);
      expect(end).toBe(snappedSettledPosition(b));
      // The slot under the marker is the slot the server names as the winner.
      expect(candidateIndexAt(end, 50)).toBe(candidateIndexAt(settledPositionOf(b), 50));
    }
  });

  it('is within a few pixels of the winning slot when the spin is declared settled (it then snaps the last bit)', () => {
    for (const velocity0 of [24, 19.37, 8.8, -9.1]) {
      const b = displayBase({ position0: 1.3, velocity0 });
      expect(Math.abs(displayPositionAt(b, settlesAtOf(b)) - snappedSettledPosition(b))).toBeLessThan(0.06);
    }
  });

  it('only ever moves in the direction of the spin', () => {
    for (const velocity0 of [24, -24, 12.3]) {
      const b = displayBase({ position0: 2.2, velocity0 });
      let prev = displayPositionAt(b, b.timestamp0);
      for (let ms = 0; ms <= settlesAtOf(b) - b.timestamp0 + 2000; ms += 25) {
        const p = displayPositionAt(b, b.timestamp0 + ms);
        expect((p - prev) * Math.sign(velocity0)).toBeGreaterThanOrEqual(-1e-9);
        prev = p;
      }
    }
  });

  it('lands on a whole slot after nudges too', () => {
    let b = displayBase({ position0: 0 });
    b = applyNudge(b, b.timestamp0 + 1500, 'left');
    b = applyNudge(b, b.timestamp0 + 700, 'right');
    const end = displayPositionAt(b, settlesAtOf(b) + 10_000);
    expect(Number.isInteger(end)).toBe(true);
    expect(end).toBe(snappedSettledPosition(b));
  });

  it('copes with a spin that has almost no distance left', () => {
    const b = displayBase({ position0: 7.2, velocity0: 0 });
    expect(displayPositionAt(b, b.timestamp0 + 5000)).toBe(7);
  });
});
