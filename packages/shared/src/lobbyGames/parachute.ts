import { PARACHUTE_GUST_H, PARACHUTE_PLAYER_H, PARACHUTE_PLAYER_W, PARACHUTE_ROW_H, clampDirection, parachuteGustStrength, type ParachuteGust, type ParachuteRow, type ParachuteSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0..1 down from the top. The skydiver falls, so the course comes up the screen.
/** How fast the course comes up: from this, and quicker by this every second of the run (no top speed, so it always ends). */
const RISE_START = 0.2;
const RISE_GAIN = 0.12;
/** A row of clouds comes every this much of course. */
const ROW_EVERY = 0.5;
/** The gap in a row: starts roomy and narrows to a floor. */
const GAP_START = 0.34;
const GAP_SHRINK = 0.0015; // per second of the run
const GAP_MIN = 0.17;
const GAP_EDGE = 0.03;
/** A gap is never further from the last one's than this share of what the skydiver can slide in the least time between two rows. */
const REACH = 0.55;
/** Where on the screen the skydiver can be: the chute shut they sink toward the bottom, open they float up toward the top. */
const Y_MIN = 0.14;
const Y_MAX = 0.62;
const SINK = 0.3;
const FLOAT = 0.2;
/** How fast they slide while an arrow is held (that is what opens the chute; with none held they are in free fall and go nowhere sideways but with the wind). */
const SLIDE = 0.7;
/** Gusts between rows push sideways this fast, and the open chute catches them more. */
const GUST_PUSH = 0.25;
const GUST_OPEN_FACTOR = 1.4;
/** About this share of the gaps between rows has a gust; it fades in and out (see parachuteGustStrength), so it never arrives all at once. */
const GUST_SHARE = 0.55;
const GONE_ABOVE = -0.2;

interface Skydiver extends RoundPlayer {
  x: number;
  y: number;
  /** How fast they are moving down the screen (smoothed, so opening the chute does not jerk). */
  vy: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
  /** The chute is open: an arrow is held. */
  open: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A skydiver falls through rows of clouds, each with a gap, and gusts that shove them sideways. Hold left or right to slide into the gap, which opens the chute: open, they
 * float up (so the next row takes longer to come) and the gusts push harder; with no arrow held they are in free fall and sink. Touch a cloud and they are out. Everyone falls through the same sky,
 * and never touches (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class ParachuteGame extends RoundGame<Skydiver> {
  readonly id = 'parachute' as const;
  private rows: ParachuteRow[] = [];
  private gusts: ParachuteGust[] = [];
  private spawned = 0;
  /** How far the course has come when the next row is due. */
  private nextRowAt = 0;
  private lastGap = 0.5;

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Skydiver, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.y = Math.min(Y_MAX, Math.max(Y_MIN, RoundGame.num(f.y, p.y)));
    p.dir = clampDirection(f.dir);
    p.open = f.o === 1;
  }

  protected writeReport(p: Skydiver): Record<string, number> {
    return { x: r3(p.x), y: r3(p.y), dir: p.dir, o: p.open ? 1 : 0 };
  }

  protected createPlayer(id: string, alive: boolean): Skydiver {
    return { id, x: 0.5, y: 0.3, vy: 0, dir: 0, open: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Skydiver): void {
    p.x = 0.5;
    p.y = 0.3;
    p.vy = 0;
    p.dir = 0;
    p.open = false;
  }

  protected resetCourse(): void {
    this.rows = [];
    this.gusts = [];
    this.spawned = 0;
    this.nextRowAt = 0;
    this.lastGap = 0.5;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // A little clear sky before the first row.
    this.nextRowAt = 0.45;
  }

  input(userId: string, dx: number, _dy: number): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.dir = clampDirection(dx);
    // An arrow held is the chute open (so you float and steer); none is free fall.
    p.open = p.dir !== 0;
  }

  action(): void {
    // Sliding and the chute (held) are all there is to do.
  }

  /** How fast the course comes up the screen right now. */
  private get rise(): number {
    return RISE_START + RISE_GAIN * (this.roundMs / 1000);
  }

  snapshot(): ParachuteSnapshot {
    return {
      id: 'parachute',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(this.rise) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      rows: this.rows.map((r) => ({ y: r3(r.y), gap: r3(r.gap), width: r3(r.width), n: r.n })),
      gusts: this.gusts.map((g) => ({ y: r3(g.y), push: g.push, n: g.n })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        y: r3(p.y),
        dir: p.dir,
        open: p.open,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const rise = this.rise;
    this.distance += rise * dt;
    // Rows and gusts are laid by how far the course has come, so they are the same wherever the steps fall.
    while (this.distance >= this.nextRowAt) {
      this.spawnRow();
      this.nextRowAt += ROW_EVERY;
    }
    for (const r of this.rows) r.y -= rise * dt;
    for (const g of this.gusts) g.y -= rise * dt;
    this.rows = this.rows.filter((r) => r.y > GONE_ABOVE);
    this.gusts = this.gusts.filter((g) => g.y + PARACHUTE_GUST_H / 2 > 0);

    const half = PARACHUTE_PLAYER_W / 2;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      // The chute shut they sink; open they float up. It eases, so it is a glide rather than a jerk.
      p.vy += ((p.open ? -FLOAT : SINK) - p.vy) * Math.min(1, dt * 6);
      p.y = Math.min(Y_MAX, Math.max(Y_MIN, p.y + p.vy * dt));
      let vx = p.dir * SLIDE;
      for (const g of this.gusts) vx += g.push * GUST_PUSH * parachuteGustStrength(g.y - p.y) * (p.open ? GUST_OPEN_FACTOR : 1);
      p.x = Math.min(1 - half, Math.max(half, p.x + vx * dt));
      if (this.hit(p)) this.knockOut(p);
    }
  }

  /** Touching a cloud: level with a row, and not entirely inside its gap. */
  private hit(p: Skydiver): boolean {
    for (const r of this.rows) {
      if (Math.abs(r.y - p.y) >= (PARACHUTE_ROW_H + PARACHUTE_PLAYER_H) / 2) continue;
      if (p.x - PARACHUTE_PLAYER_W / 2 < r.gap - r.width / 2 || p.x + PARACHUTE_PLAYER_W / 2 > r.gap + r.width / 2) return true;
    }
    return false;
  }

  /** Makes a row at the bottom, with its gap within reach of the last one's even for someone who sinks as fast as they can, and sometimes a gust in the sky before it.
   * Always takes the same three random numbers, so one row does not change the ones after it. */
  private spawnRow(): void {
    const [gapAt, gustAt, gustSide] = [this.rng(), this.rng(), this.rng()];
    const seconds = this.roundMs / 1000;
    const width = Math.max(GAP_MIN, GAP_START - GAP_SHRINK * seconds);
    // The least time to see a row coming is from when it appears at the bottom to when it reaches a skydiver as low and as fast as they can be.
    const leastWait = (1.05 - Y_MAX) / (this.rise + SINK);
    const reach = REACH * (SLIDE - GUST_PUSH * GUST_OPEN_FACTOR) * leastWait;
    const lo = Math.max(width / 2 + GAP_EDGE, this.lastGap - reach);
    const hi = Math.min(1 - width / 2 - GAP_EDGE, this.lastGap + reach);
    const gap = lo + gapAt * Math.max(0, hi - lo);
    this.rows.push({ y: 1.05, gap, width, n: ++this.spawned });
    this.lastGap = gap;
    if (gustAt < GUST_SHARE && this.spawned > 1) this.gusts.push({ y: 1.05 - ROW_EVERY / 2, push: gustSide < 0.5 ? -1 : 1, n: this.spawned });
  }
}
