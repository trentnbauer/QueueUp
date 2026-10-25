import type { PendulumSnapshot, PendulumStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Distances are fractions of the arena's side; times are seconds.
/** Where the pendulum hangs from (x is the middle), how long its arm is, how high it swings (radians either side of straight down), and the ground the balls land on. */
export const PENDULUM_PIVOT_X = 0.5;
export const PENDULUM_PIVOT_Y = 0.33;
export const PENDULUM_ARM = 0.25;
export const PENDULUM_AMPLITUDE = 1.05;
export const PENDULUM_GROUND_Y = 0.88;
/** How hard a ball is pulled down, in arena sides a second squared. */
const GRAVITY = 2;
/** The pendulum swings this many radians a second (its phase moves at this rate) in the first round, faster every round, up to a limit. */
const RATE_START = 2.4;
const RATE_GAIN = 0.12;
const RATE_MAX = 4.2;
/** The platform's half-width in the first round, narrower every round, down to a floor. */
const HALF_START = 0.16;
const HALF_SHRINK = 0.008;
const HALF_MIN = 0.03;
/** The excellent middle: a share of the platform's half-width (not under a floor), worth double. */
const EXCELLENT_SHARE = 0.25;
const EXCELLENT_MIN = 0.015;
/** The platform's middle is kept this far from the sides, where the balls can reach. */
const CENTRE_EDGE = 0.22;
/** A swing lasts this long; anyone who has not let go by then is out. */
const SWEEP_S = 6;
const FIRST_ROUND_S = 1;
const RESULT_S = 1.4;

interface Dropper extends RoundPlayer {
  /** Let go of the ball this round. */
  dropped: boolean;
  /** Where it landed (0..1), or -1. */
  at: number;
  /** Points so far. */
  points: number;
  /** Points this round's ball is worth, added once the round is over. */
  gain: number;
}

/** Where a ball lands on the ground when it is let go with the arm at `angle` and swinging at `speed` radians a second (right is positive). */
export function pendulumLanding(angle: number, speed: number): number {
  const bx = PENDULUM_PIVOT_X + PENDULUM_ARM * Math.sin(angle);
  const by = PENDULUM_PIVOT_Y + PENDULUM_ARM * Math.cos(angle);
  const vx = PENDULUM_ARM * speed * Math.cos(angle);
  const vy = -PENDULUM_ARM * speed * Math.sin(angle);
  const fall = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * (PENDULUM_GROUND_Y - by))) / GRAVITY;
  return bx + vx * fall;
}

/** One pendulum swings back and forth over a platform on the ground. Press to let go of your ball: it flies off the way the arm was moving and
 * lands where it lands. On the platform and you go on to the next round (a ball in the middle scores double); off it, or too late, and you are
 * out. Each round the pendulum is faster and the platform is smaller and somewhere else. Last one in wins. See RoundGame for how runs start and
 * end. */
export class PendulumGame extends RoundGame<Dropper> {
  readonly id = 'pendulum' as const;
  private stage: PendulumStage = 'result';
  private round = 0;
  private elapsed = 0;
  private wait = 0;
  private centre = 0.5;
  private half = HALF_START;
  private rate = RATE_START;
  /** Where in its swing the pendulum starts, so it does not always begin at the same place. */
  private phase0 = 0;

  /** The score shown for the run: the most points anyone has (the round under way does not count yet). */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.points : p.outAtMeters);
    return best;
  }

  /** Half-width of the excellent middle of the platform. */
  private get excellent(): number {
    return Math.min(this.half, Math.max(EXCELLENT_MIN, this.half * EXCELLENT_SHARE));
  }

  protected createPlayer(id: string, alive: boolean): Dropper {
    return { id, dropped: false, at: -1, points: 0, gain: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Dropper): void {
    p.dropped = false;
    p.at = -1;
    p.points = 0;
    p.gain = 0;
  }

  protected resetCourse(): void {
    this.stage = 'result';
    this.round = 0;
    this.elapsed = 0;
    this.wait = 0;
    this.centre = 0.5;
    this.half = HALF_START;
    this.rate = RATE_START;
    this.phase0 = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.wait = FIRST_ROUND_S;
  }

  input(): void {
    // Letting go is an action; there is nothing to hold.
  }

  /** The arm's angle `ms` ago (not before the swing began): what a player with a slow connection was looking at when they pressed. */
  private angleAgo(ms: number): number {
    return PENDULUM_AMPLITUDE * Math.sin(this.phase0 + this.rate * Math.max(0, this.elapsed - ms / 1000));
  }

  /** Lets go of the ball the way the player saw the arm (see `pressBehindMs`), so a slow connection does not count against them. */
  action(userId: string, name: string): void {
    const p = this.players.get(userId);
    if (name !== 'drop' || this.phase !== 'playing' || this.stage !== 'sweep' || !p || !p.alive || p.dropped) return;
    const t = Math.max(0, this.elapsed - this.pressBehindMs / 1000);
    const angle = PENDULUM_AMPLITUDE * Math.sin(this.phase0 + this.rate * t);
    const speed = PENDULUM_AMPLITUDE * this.rate * Math.cos(this.phase0 + this.rate * t);
    p.at = pendulumLanding(angle, speed);
    const off = Math.abs(p.at - this.centre);
    if (off <= this.half) {
      p.dropped = true;
      p.gain = off <= this.excellent ? 2 : 1;
      return;
    }
    p.dropped = true;
    this.fail(p);
  }

  /** Out, with the points they scored as their score. */
  private fail(p: Dropper): void {
    this.knockOut(p);
    p.outAtMeters = p.points;
  }

  snapshot(): PendulumSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'pendulum',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      round: this.round,
      angle: r3(this.stage === 'sweep' ? this.angleAgo(0) : 0),
      centre: r3(this.centre),
      half: r3(this.half),
      excellent: r3(this.excellent),
      sweepLeftMs: this.stage === 'sweep' ? Math.max(0, Math.round((SWEEP_S - this.elapsed) * 1000)) : 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.points : p.outAtMeters, dropped: p.dropped, at: r3(p.at) })),
    };
  }

  protected advance(dt: number): void {
    if (this.stage === 'result') {
      this.wait -= dt;
      if (this.wait <= 0) this.startRound();
      return;
    }
    this.elapsed += dt;
    const racers = [...this.players.values()].filter((p) => p.alive);
    if (this.elapsed >= SWEEP_S) {
      // Too late: anyone who has not let go is out.
      for (const p of racers) if (!p.dropped) this.fail(p);
      this.endSweep();
    } else if (racers.length > 0 && racers.every((p) => p.dropped)) {
      this.endSweep();
    }
  }

  private endSweep(): void {
    for (const p of this.players.values()) if (p.alive && p.dropped) p.points += p.gain;
    this.stage = 'result';
    this.wait = RESULT_S;
  }

  private startRound(): void {
    this.round++;
    this.rate = Math.min(RATE_MAX, RATE_START + RATE_GAIN * (this.round - 1));
    this.half = Math.max(HALF_MIN, HALF_START - HALF_SHRINK * (this.round - 1));
    this.centre = CENTRE_EDGE + this.rng() * (1 - 2 * CENTRE_EDGE);
    this.phase0 = this.rng() * Math.PI * 2;
    this.elapsed = 0;
    this.stage = 'sweep';
    for (const p of this.players.values()) {
      p.dropped = false;
      p.at = -1;
      p.gain = 0;
    }
  }
}
