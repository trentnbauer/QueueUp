/** Spin the Wheel's "shake to nudge" physics (click the left side to slow it down, the right side
 * to speed it up - and change where it lands): a reel/wheel/card-row/crate is really just one
 * continuous position moving along a circular, weighted "strip" of candidates, decelerating under
 * friction like a real spinning object. Deterministic given a `SpinBase` (a position/velocity
 * snapshot and the moment it was taken) and a point in time - both the server (the single source
 * of truth for a room's shared spin) and every member's own client compute `positionAt`/
 * `velocityAt` from the exact same formula, so a poll only ever needs to ship the *base*, not a
 * per-frame position feed.
 *
 * Units: position is in "strip slots" (one slot = one candidate); velocity is slots/second.
 * Friction is modeled as pure exponential decay (v(t) = v0 * e^(-FRICTION*t)) rather than linear
 * decay, so it never overshoots into negative/reverse velocity on its own and the settle time has
 * a clean closed form (see settlesAtOf) instead of needing numeric root-finding. */

export interface SpinBase {
  /** Position (in strip slots) at `timestamp0`. */
  position0: number;
  /** Velocity (slots/second) at `timestamp0`. Always >= 0 - a "left" nudge slows the spin toward
   * a stop, it never reverses it into spinning backward (see applyNudge). */
  velocity0: number;
  /** Epoch ms this base was recorded - either when the spin started, or the moment of the most
   * recent nudge (a nudge replaces the base with a fresh one, not an adjustment layered on top of
   * the old one - see applyNudge). */
  timestamp0: number;
}

/** Exponential decay rate (per second) - tuned so an un-nudged spin settles in a satisfying few
 * seconds at SPIN_INITIAL_VELOCITY (see settlesAtOf's doc for the exact figure). Higher = the reel
 * loses speed faster, both on its own and per nudge. */
export const SPIN_FRICTION = 0.9;

/** Starting velocity for a freshly-started spin, before any nudge. */
export const SPIN_INITIAL_VELOCITY = 14;

/** How much a single nudge adds to (right) or removes from (left) the *current* velocity at the
 * moment it's clicked - not the base velocity, so a nudge mid-decay still feels proportionate
 * (see applyNudge). */
export const SPIN_NUDGE_DELTA = 4;

/** Hard ceiling on velocity - without one, repeatedly nudging right would let the spin run
 * arbitrarily long (and require an arbitrarily long strip to have something new to land on). */
export const SPIN_MAX_VELOCITY = 30;

/** Velocity below which the spin is considered at rest for all practical purposes - pure
 * exponential decay never mathematically reaches exactly zero, so "settled" means "slower than
 * this," not "stopped." Small enough that the remaining distance still to travel at this point
 * (velocity / FRICTION) is a small fraction of one slot - imperceptible. */
export const SPIN_STOP_THRESHOLD = 0.05;

function elapsedSeconds(base: SpinBase, atMs: number): number {
  return Math.max(0, (atMs - base.timestamp0) / 1000);
}

/** Current velocity at `atMs`, decaying exponentially from `base`. Never negative. */
export function velocityAt(base: SpinBase, atMs: number): number {
  return base.velocity0 * Math.exp(-SPIN_FRICTION * elapsedSeconds(base, atMs));
}

/** Current position at `atMs` - the integral of velocityAt from `base.timestamp0` to `atMs`. */
export function positionAt(base: SpinBase, atMs: number): number {
  const dt = elapsedSeconds(base, atMs);
  return base.position0 + (base.velocity0 / SPIN_FRICTION) * (1 - Math.exp(-SPIN_FRICTION * dt));
}

/** The position the spin asymptotically comes to rest at - position0 plus the total remaining
 * distance (velocity0 / FRICTION) the decay curve covers between now and forever. Well-defined
 * even when velocity0 is already at/under the stop threshold (the remaining distance is then
 * negligible, so this is just ~= position0). */
export function settledPositionOf(base: SpinBase): number {
  return base.position0 + base.velocity0 / SPIN_FRICTION;
}

/** Epoch ms at which velocityAt(base, t) first drops to SPIN_STOP_THRESHOLD - the moment this
 * base's spin is considered settled. Computed once, from the base itself, not "whenever someone
 * happens to check" - two different observers checking at different times must agree on the same
 * settle moment and the same settledPositionOf, or they'd see different winners. */
export function settlesAtOf(base: SpinBase): number {
  if (base.velocity0 <= SPIN_STOP_THRESHOLD) return base.timestamp0;
  return base.timestamp0 + (Math.log(base.velocity0 / SPIN_STOP_THRESHOLD) / SPIN_FRICTION) * 1000;
}

/** Applies one nudge (a click on the left or right side of the modal) at `atMs`: freezes the
 * *current* position/velocity (not the old base's) as the new reference point, then adds or
 * removes SPIN_NUDGE_DELTA from that current velocity, clamped to [0, SPIN_MAX_VELOCITY]. Basing
 * the delta on the current (decayed) velocity rather than the original base's makes a late nudge
 * (after it's already slowed way down) feel proportionate instead of re-adding a fixed chunk on
 * top of whatever's left. Returns a brand new SpinBase - the caller persists this in place of the
 * old one (see RoomSpin.position0/velocity0/timestamp0). */
export function applyNudge(base: SpinBase, atMs: number, direction: 'left' | 'right'): SpinBase {
  const currentPosition = positionAt(base, atMs);
  const currentVelocity = velocityAt(base, atMs);
  const delta = direction === 'right' ? SPIN_NUDGE_DELTA : -SPIN_NUDGE_DELTA;
  const velocity0 = Math.min(SPIN_MAX_VELOCITY, Math.max(0, currentVelocity + delta));
  return { position0: currentPosition, velocity0, timestamp0: atMs };
}

/** Maps a (possibly fractional, possibly negative) position onto an index into a circular strip
 * of `stripLength` slots - the strip repeats indefinitely in both directions, same as a real reel
 * doesn't "run out." Rounds to the nearest whole slot, since the spin always comes to rest with
 * one candidate square at the center marker, not between two. */
export function candidateIndexAt(position: number, stripLength: number): number {
  return ((Math.round(position) % stripLength) + stripLength) % stripLength;
}
