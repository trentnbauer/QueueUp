import type { StopSnapshot, StopStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** The marker crosses the bar this many times a second in the first round, a bit faster every round, up to a limit. */
const RATE_START = 1.1;
const RATE_GAIN = 0.18;
const RATE_MAX = 2.6;
/** The target zone is this wide (half-width, as a share of the bar) in the first round, narrower every round, down to a floor. */
const HALF_START = 0.15;
const HALF_SHRINK = 0.011;
const HALF_MIN = 0.03;
/** The zone's middle is kept this far from the ends of the bar. */
const CENTRE_EDGE = 0.18;
/** A sweep lasts this long; anyone who has not stopped by then is out. */
const SWEEP_S = 5;
const FIRST_ROUND_S = 1;
const RESULT_S = 1.3;

interface Stopper extends RoundPlayer {
  /** Stopped their marker this round (inside the zone: outside it, they are out at once). */
  stopped: boolean;
  /** Where they stopped it (0..1), or -1. */
  at: number;
  /** Rounds cleared. */
  cleared: number;
}

/** Where a marker is on the bar (0..1) after `u` crossings' worth of travel: it goes up, then back down, again and again. */
function bounce(u: number): number {
  const m = ((u % 2) + 2) % 2;
  return m <= 1 ? m : 2 - m;
}

/** One marker sweeps back and forth along a bar with a target zone, the same for everyone. Press to stop your marker: inside
 * the zone and you go on to the next round; outside, or too late, and you are out. Each round it is faster and the zone is
 * smaller. Last one in wins. See RoundGame for how runs start and end. */
export class StopGame extends RoundGame<Stopper> {
  readonly id = 'stop' as const;
  private stage: StopStage = 'result';
  private round = 0;
  private elapsed = 0;
  private wait = 0;
  private centre = 0.5;
  private half = HALF_START;
  private rate = RATE_START;
  /** Where in its sweep the marker starts, so it does not always begin at the same end. */
  private phase0 = 0;

  /** The score shown for the run: the rounds everyone left in has cleared (the round under way does not count yet). */
  protected get meters(): number {
    return Math.max(0, this.round - (this.stage === 'sweep' ? 1 : 0));
  }

  protected createPlayer(id: string, alive: boolean): Stopper {
    return { id, stopped: false, at: -1, cleared: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Stopper): void {
    p.stopped = false;
    p.at = -1;
    p.cleared = 0;
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
    // Stopping is an action; there is nothing to hold.
  }

  private get marker(): number {
    return bounce(this.phase0 + this.rate * this.elapsed);
  }

  /** Stops the marker where it is right now. */
  action(userId: string, name: string): void {
    const p = this.players.get(userId);
    if (name !== 'stop' || this.phase !== 'playing' || this.stage !== 'sweep' || !p || !p.alive || p.stopped) return;
    p.at = this.marker;
    if (Math.abs(p.at - this.centre) <= this.half) {
      p.stopped = true;
      return;
    }
    this.fail(p);
  }

  /** Out, with the rounds they cleared as their score. */
  private fail(p: Stopper): void {
    this.knockOut(p);
    p.outAtMeters = p.cleared;
  }

  snapshot(): StopSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'stop',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      round: this.round,
      centre: r3(this.centre),
      half: r3(this.half),
      marker: r3(this.stage === 'sweep' ? this.marker : -1),
      sweepLeftMs: this.stage === 'sweep' ? Math.max(0, Math.round((SWEEP_S - this.elapsed) * 1000)) : 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.cleared : p.outAtMeters, stopped: p.stopped, at: r3(p.at) })),
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
      // Too late: anyone who has not stopped is out.
      for (const p of racers) if (!p.stopped) this.fail(p);
      this.endSweep();
    } else if (racers.length > 0 && racers.every((p) => p.stopped)) {
      this.endSweep();
    }
  }

  private endSweep(): void {
    for (const p of this.players.values()) if (p.alive && p.stopped) p.cleared++;
    this.stage = 'result';
    this.wait = RESULT_S;
  }

  private startRound(): void {
    this.round++;
    this.rate = Math.min(RATE_MAX, RATE_START + RATE_GAIN * (this.round - 1));
    this.half = Math.max(HALF_MIN, HALF_START - HALF_SHRINK * (this.round - 1));
    this.centre = CENTRE_EDGE + this.rng() * (1 - 2 * CENTRE_EDGE);
    this.phase0 = this.rng() * 2;
    this.elapsed = 0;
    this.stage = 'sweep';
    for (const p of this.players.values()) {
      p.stopped = false;
      p.at = -1;
    }
  }
}
