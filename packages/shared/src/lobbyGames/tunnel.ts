import { TUNNEL_SHIP_W, clampDirection, type TunnelCourse, type TunnelSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// x runs 0..1 across the screen. The tunnel scrolls down toward the ship, which stays at TUNNEL_SHIP_Y; `dist` is how far it has gone, in screens.
const SHIP_SPEED = 0.6;
/** How fast the tunnel comes: from this, and quicker by this every second of the run (no top speed, so it always ends). */
const SPEED_START = 0.45;
const SPEED_GAIN = 0.018;
/** The tunnel starts straight and has its curves grow over this many screens. */
const STRAIGHT_Z = 6;
/** The tunnel's half width: starts roomy, narrows by this a screen to a floor. */
const HALF_START = 0.24;
const HALF_SHRINK = 0.01;
const HALF_MIN = 0.09;
/** The two waves a tunnel's middle follows: how far each swings, and how fast (radians a screen) in a range, so the middle never turns sharper than the ship can follow. */
const AMP = [0.14, 0.08] as const;
const FREQ_LO = [0.9, 1.8] as const;
const FREQ_SPAN = [0.5, 0.8] as const;

interface Pilot extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Where the tunnel's middle is across the screen, and how far each wall is from it (its half width), `z` screens into the course. */
export function tunnelAt(c: TunnelCourse, z: number): { mid: number; half: number } {
  const grow = Math.min(1, Math.max(0, z) / STRAIGHT_Z);
  const mid = 0.5 + grow * (AMP[0] * Math.sin(c.f[0] * z + c.p[0]) + AMP[1] * Math.sin(c.f[1] * z + c.p[1]));
  const half = Math.max(HALF_MIN, HALF_START - HALF_SHRINK * Math.max(0, z));
  return { mid, half };
}

/** A ship flies down a tunnel that twists and narrows: steer left and right to stay between the walls, and touch one and you are out. Everyone is in the same tunnel, side
 * by side, and never touches (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class TunnelGame extends RoundGame<Pilot> {
  readonly id = 'tunnel' as const;
  private course: TunnelCourse = { f: [FREQ_LO[0], FREQ_LO[1]], p: [0, 0] };

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Pilot, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.dir = clampDirection(f.dir);
  }

  protected writeReport(p: Pilot): Record<string, number> {
    return { x: r3(p.x), dir: p.dir };
  }

  protected createPlayer(id: string, alive: boolean): Pilot {
    return { id, x: 0.5, dir: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Pilot): void {
    p.x = 0.5;
    p.dir = 0;
  }

  protected resetCourse(): void {
    this.course = { f: [FREQ_LO[0], FREQ_LO[1]], p: [0, 0] };
  }

  protected beginCourse(): void {
    // The two waves' speeds and where they start, always the same four random numbers.
    const [f0, f1, p0, p1] = [this.rng(), this.rng(), this.rng(), this.rng()];
    this.course = { f: [FREQ_LO[0] + FREQ_SPAN[0] * f0, FREQ_LO[1] + FREQ_SPAN[1] * f1], p: [p0 * Math.PI * 2, p1 * Math.PI * 2] };
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Steering left and right is all there is to do.
  }

  /** How fast the tunnel comes right now, in screens a second. */
  private get speed(): number {
    return SPEED_START + SPEED_GAIN * (this.roundMs / 1000);
  }

  snapshot(): TunnelSnapshot {
    return {
      id: 'tunnel',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(this.speed) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      course: { f: [r3(this.course.f[0]), r3(this.course.f[1])], p: [r3(this.course.p[0]), r3(this.course.p[1])] },
      dist: r3(this.distance),
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
    this.distance += this.speed * dt;
    const half = TUNNEL_SHIP_W / 2;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.x = Math.min(1, Math.max(0, p.x + p.dir * SHIP_SPEED * dt));
      if (this.touches(p.x, half)) this.knockOut(p);
    }
  }

  /** The ship is touching a wall: checked at its nose, middle and tail, since the tunnel moves under it. */
  private touches(x: number, half: number): boolean {
    for (const along of [-0.03, 0, 0.03]) {
      const { mid, half: w } = tunnelAt(this.course, this.distance + along);
      if (x - half < mid - w || x + half > mid + w) return true;
    }
    return false;
  }
}

