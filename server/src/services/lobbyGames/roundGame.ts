import type { LobbyGameId, LobbyGameSnapshot, LobbyRoundPhase } from '@queueup/shared';
import type { LobbyGame } from './types.js';

const COUNTDOWN_MS = 3000;
const OVER_MS = 4000;
/** Physics runs in steps no longer than this, so a slow tick cannot skip over an obstacle. */
const MAX_STEP_S = 1 / 60;
const METERS_PER_SCREEN = 20;

/** What every player in a round-based game has. */
export interface RoundPlayer {
  id: string;
  /** Still in the current run. False once knocked out, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Metres at the moment they were knocked out. */
  outAtMeters: number;
}

/** A small seeded generator, so a course is the same for everyone and tests can replay one. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The run lifecycle that "everyone on one course" games share: wait for a player, count down, run
 * until one player (or none) is left standing, show the result, start again. A game fills in its
 * players, its course and its physics; this takes care of the phases.
 *
 * - With several runners the last one standing wins; alone it is a high-score run (no winner).
 * - Someone who joins mid-run watches it and plays from the next one.
 * - The course comes from a seed, so everyone sees the same thing and tests can replay it. */
export abstract class RoundGame<P extends RoundPlayer> implements LobbyGame {
  abstract readonly id: LobbyGameId;
  protected readonly players = new Map<string, P>();
  protected phase: LobbyRoundPhase = 'lobby';
  protected timerMs = 0;
  /** Milliseconds into the current run. */
  protected roundMs = 0;
  /** How far the course has scrolled, in screens. */
  protected distance = 0;
  protected winnerId: string | null = null;
  protected rng: () => number;
  private startedWith = 0;

  constructor(protected readonly seedSource: () => number = Math.random) {
    this.rng = mulberry32(Math.floor(this.seedSource() * 4294967296));
  }

  /** The game's player record for someone arriving. `alive` is false when they arrive mid-run. */
  protected abstract createPlayer(id: string, alive: boolean): P;
  /** Puts a player back at the start for a new run. */
  protected abstract resetPlayer(p: P): void;
  /** Clears the course (called when a countdown starts, after the seed is renewed). */
  protected abstract resetCourse(): void;
  /** Sets up the first obstacles when the countdown ends. */
  protected abstract beginCourse(): void;
  /** Moves the course and the players on by `dt` seconds. Call `knockOut` for anyone who is hit. */
  protected abstract advance(dt: number): void;
  abstract input(userId: string, dx: number, dy: number): void;
  abstract action(userId: string, name: string): void;
  abstract snapshot(): LobbyGameSnapshot;

  /** Metres run so far. */
  protected get meters(): number {
    return Math.floor(this.distance * METERS_PER_SCREEN);
  }

  protected knockOut(p: P): void {
    if (!p.alive) return;
    p.alive = false;
    p.outAtMeters = this.meters;
  }

  join(userId: string): void {
    if (this.players.has(userId)) return;
    // Someone who arrives mid-run watches it, and runs from the next one.
    this.players.set(userId, this.createPlayer(userId, this.phase !== 'playing' && this.phase !== 'over'));
    if (this.phase === 'lobby') this.startCountdown();
  }

  leave(userId: string): void {
    this.players.delete(userId);
    if (this.players.size === 0) {
      this.phase = 'lobby';
      return;
    }
    if (this.phase === 'playing') this.checkRunEnd();
  }

  tick(dtMs: number): void {
    let left = Math.min(dtMs, 250) / 1000;
    while (left > 1e-9) {
      const step = Math.min(left, MAX_STEP_S);
      left -= step;
      this.step(step);
    }
  }

  private step(dt: number): void {
    switch (this.phase) {
      case 'lobby':
        break;
      case 'countdown':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) this.beginRun();
        break;
      case 'playing':
        this.roundMs += dt * 1000;
        this.advance(dt);
        this.checkRunEnd();
        break;
      case 'over':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) {
          if (this.players.size > 0) this.startCountdown();
          else this.phase = 'lobby';
        }
        break;
    }
  }

  /** A run ends when one runner (or none) is left; alone, when you are out. */
  protected checkRunEnd(): void {
    if (this.phase !== 'playing') return;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length > (this.startedWith > 1 ? 1 : 0)) return;
    this.phase = 'over';
    this.timerMs = OVER_MS;
    const winner = this.startedWith > 1 && alive.length === 1 ? alive[0] : null;
    this.winnerId = winner?.id ?? null;
    if (winner) {
      winner.wins++;
      winner.outAtMeters = this.meters;
    }
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.timerMs = COUNTDOWN_MS;
    this.winnerId = null;
    this.distance = 0;
    this.rng = mulberry32(Math.floor(this.seedSource() * 4294967296));
    this.resetCourse();
    for (const p of this.players.values()) {
      p.alive = true;
      p.outAtMeters = 0;
      this.resetPlayer(p);
    }
  }

  private beginRun(): void {
    this.phase = 'playing';
    this.timerMs = 0;
    this.roundMs = 0;
    this.distance = 0;
    this.startedWith = [...this.players.values()].filter((p) => p.alive).length;
    this.beginCourse();
  }
}
