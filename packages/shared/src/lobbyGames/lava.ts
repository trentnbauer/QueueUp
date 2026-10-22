import { LAVA_PLATFORM_W, LAVA_PLAYER_W, clampDirection, type LavaPlatform, type LavaSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Heights are in screens, measured up from where the run started. The screen climbs the tower (`cam` is the height of its bottom edge), and x runs 0..1 across and wraps.
const GRAVITY = 2;
/** The speed a bounce launches at: it rises V0^2 / (2 * GRAVITY) = about 0.34 of a screen. */
const LAVA_V = 1.166;
const MOVE_SPEED = 0.6;
/** How fast the screen climbs: slowly at first and quicker over `RAMP_S`, to a speed nobody can keep up with for ever (a bounce gains about a quarter of a screen a second). */
const CAM_START = 0.11;
const CAM_END = 0.36;
const RAMP_S = 50;
/** The screen holds still for this long at the start of a run, so there is a second to get under the next platform before it begins to climb. */
const START_DELAY_S = 1;
/** Platform spacing: each is this far above the last (always within a bounce's reach), and no more than this far sideways from it. */
const GAP_MIN = 0.13;
const GAP_MAX = 0.26;
const SIDE_REACH = 0.3;
const EDGE = 0.12;
/** From this height on some platforms slide from side to side, more and more of them. */
const MOVERS_FROM = 1.2;
const MOVER_SHARE_MAX = 0.4;
const MOVER_AMP = 0.12;
const START_H = 0.1;
/** Out: the feet are this far below the bottom of the screen. There is no ceiling: a high bounce carries the ball out of the top of the screen and it comes back down. */
const FALL_OUT = 0.03;
/** The highest a reported height may be above the screen's bottom edge (a bounce reaches about 0.34 above a platform, and platforms stay in view). */
const HEIGHT_MAX = 2;

interface Platform {
  n: number;
  /** Height of its top, and where it slides about (`amp` 0 is one that stays put). */
  h: number;
  cx: number;
  amp: number;
  omega: number;
  phase: number;
}

interface Bouncer extends RoundPlayer {
  x: number;
  /** Height of the feet and how fast they are going up. */
  h: number;
  vy: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const wrap = (x: number) => ((x % 1) + 1) % 1;

/** A ball that bounces by itself, up a tower of platforms that the screen climbs faster and faster: slide left and right (the screen wraps round) to land on
 * the next platform. Fall off the bottom and you are out. Everyone climbs the same tower, and never touches (see RoundGame.clientSim). */
export class LavaGame extends RoundGame<Bouncer> {
  readonly id = 'lava' as const;
  private cam = 0;
  private platforms: Platform[] = [];
  private made = 0;
  private lastH = START_H;
  private lastX = 0.5;

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Bouncer, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.h = Math.min(this.cam + HEIGHT_MAX, Math.max(this.cam - 0.1, RoundGame.num(f.h, p.h)));
    p.vy = Math.min(2, Math.max(-4, RoundGame.num(f.vy, p.vy)));
    p.dir = clampDirection(f.dir);
  }

  protected writeReport(p: Bouncer): Record<string, number> {
    return { x: r3(p.x), h: r3(p.h), vy: r3(p.vy), dir: p.dir };
  }

  protected createPlayer(id: string, alive: boolean): Bouncer {
    return { id, x: 0.5, h: START_H, vy: LAVA_V, dir: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Bouncer): void {
    p.x = 0.5;
    p.h = START_H;
    p.vy = LAVA_V;
    p.dir = 0;
  }

  protected resetCourse(): void {
    this.cam = 0;
    this.platforms = [];
    this.made = 0;
    this.lastH = START_H;
    this.lastX = 0.5;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // The ground everyone starts on, as wide as the screen: it falls away below as the screen climbs.
    this.platforms.push({ n: ++this.made, h: START_H, cx: 0.5, amp: 0, omega: 0, phase: 0 });
    this.build();
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Sliding left and right is all there is to do: the ball bounces by itself.
  }

  /** The screen's climb right now, in screens a second. */
  private get speed(): number {
    const seconds = this.roundMs / 1000;
    if (seconds < START_DELAY_S) return 0;
    return CAM_START + (CAM_END - CAM_START) * Math.min(1, (seconds - START_DELAY_S) / RAMP_S);
  }

  /** Where a platform is across the screen at `seconds` into the run. */
  private platformX(p: Platform, seconds: number): number {
    return p.amp === 0 ? p.cx : p.cx + p.amp * Math.sin(p.omega * seconds + p.phase);
  }

  /** Lays platforms up to a screen above the top of the screen. Always takes the same five random numbers for each, so one does not change the ones after it. */
  private build(): void {
    while (this.lastH < this.cam + 1.3) {
      const [gap, side, mover, omega, phase] = [this.rng(), this.rng(), this.rng(), this.rng(), this.rng()];
      const h = this.lastH + GAP_MIN + gap * (GAP_MAX - GAP_MIN);
      const x = Math.min(1 - EDGE, Math.max(EDGE, this.lastX + (side * 2 - 1) * SIDE_REACH));
      const share = h < MOVERS_FROM ? 0 : Math.min(MOVER_SHARE_MAX, ((h - MOVERS_FROM) / 6) * MOVER_SHARE_MAX);
      const moves = mover < share;
      const cx = moves ? Math.min(1 - EDGE - MOVER_AMP, Math.max(EDGE + MOVER_AMP, x)) : x;
      this.platforms.push({ n: ++this.made, h, cx, amp: moves ? MOVER_AMP : 0, omega: 1 + omega * 0.8, phase: phase * Math.PI * 2 });
      this.lastH = h;
      this.lastX = cx;
    }
  }

  snapshot(): LavaSnapshot {
    const seconds = this.roundMs / 1000;
    return {
      id: 'lava',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(this.speed) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      platforms: this.platforms.map((p): LavaPlatform => ({ n: p.n, x: r3(wrap(this.platformX(p, seconds))), y: r3(1 - (p.h - this.cam)), moving: p.amp > 0, wide: p.n === 1 })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        y: r3(1 - (p.h - this.cam)),
        vy: r3(p.vy),
        dir: p.dir,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.cam += this.speed * dt;
    this.distance = this.cam;
    this.build();
    this.platforms = this.platforms.filter((p) => p.h > this.cam - 0.2);

    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.x = wrap(p.x + p.dir * MOVE_SPEED * dt);
      const before = p.h;
      p.vy -= GRAVITY * dt;
      p.h += p.vy * dt;
      // Coming down onto a platform from above bounces off it.
      if (p.vy <= 0) {
        for (const plat of this.platforms) {
          if (before < plat.h || p.h > plat.h) continue;
          if (plat.n === 1 || this.reaches(p.x, wrap(this.platformX(plat, seconds)))) {
            p.h = plat.h;
            p.vy = LAVA_V;
            break;
          }
        }
      }
      if (p.h < this.cam - FALL_OUT) this.knockOut(p);
    }
  }

  /** The ball is over a platform (the screen wraps, so the distance is measured the short way round). */
  private reaches(x: number, platformX: number): boolean {
    const d = Math.abs(x - platformX);
    return Math.min(d, 1 - d) <= LAVA_PLATFORM_W / 2 + LAVA_PLAYER_W * 0.3;
  }
}

