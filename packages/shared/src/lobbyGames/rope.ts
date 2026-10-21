import { ROPE_CLEAR_HEIGHT, type RopeSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Heights are fractions of the screen, 0 at the floor. One jump lasts 2 * JUMP_SPEED / GRAVITY, about 0.49s,
// of which the jumper is above ROPE_CLEAR_HEIGHT for roughly 0.43s.
const GRAVITY = 9;
const JUMP_SPEED = 2.2;
/** The rope is under the jumpers' feet for this many seconds either side of the bottom of its swing. */
const CONTACT_S = 0.04;
/** Seconds one swing takes: it starts at PERIOD_START and gets quicker for as long as the run lasts (it is PERIOD_START / (1 + PERIOD_RATE * seconds), about 0.78 after
 * 16 seconds), with no floor, so in the end a swing is quicker than a jump can be timed and nobody can go on for ever. */
const PERIOD_START = 1.4;
const PERIOD_RATE = 0.0485;
/** Now and then a swing is slower (a pause) or quicker, to keep people honest. */
const SLOW_CHANCE = 0.12;
const SLOW_FACTOR = 1.5;
const FAST_CHANCE = 0.15;
const FAST_FACTOR = 0.85;
/** The rope starts part way round, so there is time to get ready. */
const START_ANGLE = 0.3;

interface Jumper extends RoundPlayer {
  x: number;
  y: number;
  vy: number;
  /** Swings jumped this run. */
  jumps: number;
}

/** A rope swings round and everyone jumps it together; mistime it and you are out. Last one jumping
 * wins. See RoundGame for how runs start and end. */
export class RopeGame extends RoundGame<Jumper> {
  readonly id = 'rope' as const;
  private angle = START_ANGLE;
  private period = PERIOD_START;
  private swings = 0;

  /** The score is swings jumped, shown where the other games show metres. */
  protected get meters(): number {
    return this.swings;
  }

  /** Each player's own device works out their jumps (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Jumper, f: Record<string, number>): void {
    p.y = Math.max(0, RoundGame.num(f.y, p.y));
    p.vy = RoundGame.num(f.vy, p.vy);
  }

  protected writeReport(p: Jumper): Record<string, number> {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { y: r3(p.y), vy: r3(p.vy) };
  }

  protected createPlayer(id: string, alive: boolean): Jumper {
    return { id, x: 0.5, y: 0, vy: 0, jumps: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Jumper): void {
    p.y = 0;
    p.vy = 0;
    p.jumps = 0;
    this.spread();
  }

  protected resetCourse(): void {
    this.angle = START_ANGLE;
    this.period = PERIOD_START;
    this.swings = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  join(userId: string): void {
    super.join(userId);
    this.spread();
  }

  leave(userId: string): void {
    super.leave(userId);
    this.spread();
  }

  input(): void {
    // Jumping is an action; there is nothing to hold.
  }

  action(userId: string, name: string): void {
    if (name !== 'jump' || this.phase !== 'playing') return;
    const p = this.players.get(userId);
    // Only from the floor, so a jump cannot be topped up in the air.
    if (p?.alive && p.y === 0) p.vy = JUMP_SPEED;
  }

  snapshot(): RopeSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'rope',
      phase: this.phase,
      meters: this.meters,
      angle: r3(this.angle),
      period: r3(this.period),
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        y: r3(p.y),
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    this.angle += dt / this.period;
    if (this.angle >= 1) {
      this.angle -= 1;
      this.swings++;
      this.period = this.nextPeriod();
    }
    // The rope is at the floor around angle 0 (and 1); how long that is in seconds depends on the swing.
    const underFeet = Math.min(this.angle, 1 - this.angle) * this.period < CONTACT_S;

    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      if (p.y > 0 || p.vy > 0) {
        p.vy -= GRAVITY * dt;
        p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y === 0) p.vy = 0;
      }
      if (underFeet && p.y < ROPE_CLEAR_HEIGHT) this.knockOut(p);
    }
  }

  /** How long the next swing takes: it shortens over the run, with the odd slow or quick one. */
  private nextPeriod(): number {
    const base = PERIOD_START / (1 + (PERIOD_RATE * this.roundMs) / 1000);
    const roll = this.rng();
    if (roll < SLOW_CHANCE) return base * SLOW_FACTOR;
    if (roll < SLOW_CHANCE + FAST_CHANCE) return base * FAST_FACTOR;
    return base;
  }

  /** Stands everyone in a row across the floor, in the order they joined. */
  private spread(): void {
    const n = this.players.size;
    let i = 0;
    for (const p of this.players.values()) p.x = (i++ + 0.5) / n;
  }
}
