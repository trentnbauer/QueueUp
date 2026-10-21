import { SWING_PLAYER_R, SWING_REACH, SWING_START_X, clampDirection, type SwingAnchor, type SwingSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// x runs along the course in screens (the screen shows about one and a bit of it, following the player); y runs 0 at the top to 1 at the bottom.
/** Gravity (screens a second squared) on a swing and in flight. */
const G = 2.2;
/** How hard left and right pump the swing (radians a second squared), and the most it can swing (angle from straight down, and angular speed). */
const PUMP = 2.5;
const THETA_MAX = 1.4;
const OMEGA_MAX = 3;
/** The rope never gets shorter than this when it grabs. */
const LEN_MIN = 0.2;
/** Falling this far down the screen is the end of a run. */
const FALL_Y = 1.06;
/** The first anchor, and the one a run starts hanging from: where it is, and how long its rope is and how far back it is swung at the start. */
const FIRST_Y = 0.1;
const START_LEN = 0.45;
const START_THETA = -0.6;
/** The anchors that follow: each is this far on from the last (plus up to GAP_EXTRA more) and this much further for each one so far, at a height between these. */
const GAP_START = 0.28;
const GAP_GROW = 0.012;
const GAP_EXTRA = 0.1;
const Y_MIN = 0.06;
const Y_SPAN = 0.12;
/** The chase wall comes from behind at this speed (screens a second), quicker by this every second, with no top speed: anyone it catches is out. */
const WALL_START_X = -0.4;
const WALL_SPEED = 0.14;
const WALL_GAIN = 0.012;
/** How far ahead of the furthest player the course is laid. */
const LAID_AHEAD = 2;
const METERS_PER_SCREEN = 20;

interface Swinger extends RoundPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The anchor they hang from (its number), or -1 in flight. */
  a: number;
  /** On a swing: the rope's length, its angle from straight down (radians, forward is positive) and how fast that is changing. */
  len: number;
  th: number;
  w: number;
  /** The highest-numbered anchor they have held: a grab only takes one further on, so they cannot go back to one they let go of. */
  last: number;
  /** The furthest along the course they have been. */
  best: number;
  /** -1, 0 or 1: the direction they are holding (they pump the swing that way). */
  dir: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How far the chase wall has come `seconds` into a run. */
export function wallAt(seconds: number): number {
  return WALL_START_X + WALL_SPEED * seconds + 0.5 * WALL_GAIN * seconds * seconds;
}

/** Swing from anchor to anchor and let go at the right moment: hold left or right to pump the swing, and press to let go and, in the air, to grab the
 * anchor ahead. Fall off the bottom or be caught by the wall that chases you, and you are out. The anchors get further apart. Everyone swings the same course,
 * side by side, and never touches (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class SwingGame extends RoundGame<Swinger> {
  readonly id = 'swing' as const;
  private anchors: SwingAnchor[] = [{ n: 0, x: SWING_START_X, y: FIRST_Y }];

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Swinger, f: Record<string, number>): void {
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    p.x = clamp(RoundGame.num(f.x, p.x), -1, 1e4);
    p.y = clamp(RoundGame.num(f.y, p.y), -2, FALL_Y + 0.5);
    p.vx = clamp(RoundGame.num(f.vx, p.vx), -20, 20);
    p.vy = clamp(RoundGame.num(f.vy, p.vy), -20, 20);
    p.a = Math.floor(clamp(RoundGame.num(f.a, -1), -1, 1e5));
    p.len = clamp(RoundGame.num(f.l, p.len), LEN_MIN, SWING_REACH);
    p.th = clamp(RoundGame.num(f.th, p.th), -THETA_MAX, THETA_MAX);
    p.w = clamp(RoundGame.num(f.w, p.w), -OMEGA_MAX, OMEGA_MAX);
    p.best = Math.max(p.best, clamp(RoundGame.num(f.b, p.best), -1, 1e4));
    p.last = Math.max(p.last, Math.floor(clamp(RoundGame.num(f.lt, p.last), 0, 1e5)));
  }

  protected writeReport(p: Swinger): Record<string, number> {
    return { x: r3(p.x), y: r3(p.y), vx: r3(p.vx), vy: r3(p.vy), a: p.a, l: r3(p.len), th: r3(p.th), w: r3(p.w), b: r3(p.best), lt: p.last };
  }

  protected createPlayer(id: string, alive: boolean): Swinger {
    const p = { id, alive, wins: 0, outAtMeters: 0 } as Swinger;
    this.resetPlayer(p);
    return p;
  }

  protected resetPlayer(p: Swinger): void {
    // Hanging from the first anchor, swung back, so the first thing to happen is a swing forward.
    p.a = 0;
    p.last = 0;
    p.len = START_LEN;
    p.th = START_THETA;
    p.w = 0;
    p.vx = 0;
    p.vy = 0;
    p.dir = 0;
    this.place(p);
    p.best = p.x;
  }

  protected resetCourse(): void {
    this.anchors = [{ n: 0, x: SWING_START_X, y: FIRST_Y }];
  }

  protected beginCourse(): void {
    // The anchors are laid as far as they are needed, from the seed, in order.
    this.lay(SWING_START_X + LAID_AHEAD);
  }

  /** Lays anchors until the course reaches `x`. Always takes the same two random numbers for each, so one does not change the ones after it. */
  private lay(x: number): void {
    for (let last = this.anchors[this.anchors.length - 1]; last.x < x; last = this.anchors[this.anchors.length - 1]) {
      const [gap, height] = [this.rng(), this.rng()];
      const n = last.n + 1;
      this.anchors.push({ n, x: r3(last.x + GAP_START + GAP_GROW * n + GAP_EXTRA * gap), y: r3(Y_MIN + Y_SPAN * height) });
    }
  }

  private anchor(n: number): SwingAnchor | undefined {
    return this.anchors[n];
  }

  /** Puts a player hanging from their anchor where their angle says. */
  private place(p: Swinger): void {
    const a = this.anchor(p.a) ?? this.anchors[0];
    p.x = a.x + p.len * Math.sin(p.th);
    p.y = a.y + p.len * Math.cos(p.th);
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  /** `grab`: on a swing, lets go; in the air, grabs the nearest anchor ahead that is within reach and above the player (if there is one). */
  action(userId: string, name: string): void {
    if (name !== 'grab' || this.phase !== 'playing') return;
    const p = this.players.get(userId);
    if (!p?.alive || !this.simulated(p)) return;
    if (p.a >= 0) this.release(p);
    else this.grab(p);
  }

  private release(p: Swinger): void {
    // The speed along the arc the bob is going, in x and y.
    p.vx = p.len * p.w * Math.cos(p.th);
    p.vy = -p.len * p.w * Math.sin(p.th);
    p.a = -1;
  }

  /** The anchor a grab would take: the nearest one that is further on than any held so far, above the player (by a little) and within reach. */
  private candidate(p: Swinger): SwingAnchor | null {
    let best: SwingAnchor | null = null;
    let nearest = SWING_REACH * SWING_REACH;
    for (const a of this.anchors) {
      if (a.n <= p.last || a.y >= p.y - 0.03) continue;
      const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      if (d <= nearest) {
        best = a;
        nearest = d;
      }
    }
    return best;
  }

  private grab(p: Swinger): void {
    const a = this.candidate(p);
    if (!a) return;
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    p.len = Math.max(LEN_MIN, Math.hypot(dx, dy));
    p.th = Math.min(THETA_MAX, Math.max(-THETA_MAX, Math.atan2(dx, dy)));
    // Only the speed along the arc is kept: the rope takes the rest.
    p.w = Math.min(OMEGA_MAX, Math.max(-OMEGA_MAX, (p.vx * Math.cos(p.th) - p.vy * Math.sin(p.th)) / p.len));
    p.a = a.n;
    p.last = a.n;
    this.place(p);
  }

  /** The score of a player: how far along the course they got, in metres. */
  private metersOf(p: Swinger): number {
    return Math.max(0, Math.floor((p.best - SWING_START_X) * METERS_PER_SCREEN));
  }

  /** The score shown for the run: the furthest anyone has got. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? this.metersOf(p) : p.outAtMeters);
    return best;
  }

  protected override knockOut(p: Swinger): void {
    super.knockOut(p);
    p.outAtMeters = this.metersOf(p);
  }

  protected override endRun(winner: Swinger | null): void {
    super.endRun(winner);
    if (winner) winner.outAtMeters = this.metersOf(winner);
  }

  snapshot(): SwingSnapshot {
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    const wall = wallAt(t);
    return {
      id: 'swing',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(WALL_SPEED + WALL_GAIN * t) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      wall: r3(wall),
      anchors: this.anchors.filter((a) => a.x > wall - 0.6).map((a) => ({ ...a })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        y: r3(p.y),
        a: p.a,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.metersOf(p) : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const wall = wallAt(this.roundMs / 1000);
    let front = SWING_START_X;
    for (const p of this.players.values()) front = Math.max(front, p.x);
    this.lay(front + LAID_AHEAD);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      if (p.a >= 0) {
        p.w += (-(G / p.len) * Math.sin(p.th) + PUMP * p.dir) * dt;
        p.w = Math.min(OMEGA_MAX, Math.max(-OMEGA_MAX, p.w));
        p.th += p.w * dt;
        if (Math.abs(p.th) > THETA_MAX) {
          p.th = Math.sign(p.th) * THETA_MAX;
          p.w = 0;
        }
        this.place(p);
      } else {
        p.vy += G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.best = Math.max(p.best, p.x);
      if (p.y > FALL_Y || p.x < wall + SWING_PLAYER_R) this.knockOut(p);
    }
  }
}
