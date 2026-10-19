import { LASER_HEIGHT, LASER_PLAYER_HEIGHT, LASER_PLAYER_WIDTH, LASER_PLAYER_Y, clampDirection, type LaserRow, type LaserSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0..1 down from the top.
const PLAYER_SPEED = 0.5;
const FALL_START = 0.35;
const FALL_GAIN = 0.01; // per second of the run
const FALL_MAX = 0.8;
/** Seconds between rows: starts roomy and gets busier, down to a floor. */
const SPAWN_START_S = 1.1;
const SPAWN_GAIN_S = 0.011;
const SPAWN_MIN_S = 0.65;
/** How wide the gap in a row is: starts roomy and narrows, down to a floor. */
const GAP_START = 0.3;
const GAP_SHRINK = 0.002; // per second of the run
const GAP_MIN = 0.17;
/** A row's gap can be this much of the player's travel between rows away from the last one's, so there is
 * always time to slide across. */
const REACH = 0.7;
const GAP_EDGE = 0.04;
const GONE_BELOW = 1.1;

interface Slider extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
}

/** Rows of lasers fall down the screen, each with a gap somewhere. Slide left and right to be in the gap as the row
 * reaches you; touch a beam and you are out. Everyone is on the same floor. See RoundGame for how runs start and end. */
export class LaserGame extends RoundGame<Slider> {
  readonly id = 'laser' as const;
  private speed = FALL_START;
  private rows: LaserRow[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private lastGap = 0.5;

  /** Each player's own device works out where they stand (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Slider, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.dir = clampDirection(f.dir);
  }

  protected writeReport(p: Slider): Record<string, number> {
    return { x: Math.round(p.x * 1000) / 1000, dir: p.dir };
  }

  protected createPlayer(id: string, alive: boolean): Slider {
    return { id, x: 0.5, dir: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Slider): void {
    p.x = 0.5;
    p.dir = 0;
  }

  protected resetCourse(): void {
    this.speed = FALL_START;
    this.rows = [];
    this.spawned = 0;
    this.lastGap = 0.5;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // A moment before the first row, so there is time to get ready.
    this.spawnIn = 1;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Moving left and right is all there is to do.
  }

  snapshot(): LaserSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'laser',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      rows: this.rows.map((r) => ({ y: r3(r.y), gap: r3(r.gap), width: r3(r.width), n: r.n })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        dir: p.dir,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.speed = Math.min(FALL_MAX, FALL_START + FALL_GAIN * seconds);
    this.distance += this.speed * dt;

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      const wait = Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
      this.spawnRow(wait);
      this.spawnIn += wait;
    }

    for (const r of this.rows) r.y += this.speed * dt;
    this.rows = this.rows.filter((r) => r.y < GONE_BELOW);

    const half = LASER_PLAYER_WIDTH / 2;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.x = Math.min(1 - half, Math.max(half, p.x + p.dir * PLAYER_SPEED * dt));
      if (this.hit(p)) this.knockOut(p);
    }
  }

  /** Touching a beam: level with a row, and not entirely inside its gap. */
  private hit(p: Slider): boolean {
    for (const r of this.rows) {
      if (Math.abs(r.y - LASER_PLAYER_Y) >= (LASER_HEIGHT + LASER_PLAYER_HEIGHT) / 2) continue;
      if (p.x - LASER_PLAYER_WIDTH / 2 < r.gap - r.width / 2 || p.x + LASER_PLAYER_WIDTH / 2 > r.gap + r.width / 2) return true;
    }
    return false;
  }

  /** Makes a row at the top. Its gap is never further from the last row's than the player can slide in the time between them. */
  private spawnRow(wait: number): void {
    const seconds = this.roundMs / 1000;
    const width = Math.max(GAP_MIN, GAP_START - GAP_SHRINK * seconds);
    const lo = Math.max(width / 2 + GAP_EDGE, this.lastGap - REACH * PLAYER_SPEED * wait);
    const hi = Math.min(1 - width / 2 - GAP_EDGE, this.lastGap + REACH * PLAYER_SPEED * wait);
    const gap = lo + this.rng() * Math.max(0, hi - lo);
    this.rows.push({ y: -LASER_HEIGHT, gap, width, n: ++this.spawned });
    this.lastGap = gap;
  }
}
