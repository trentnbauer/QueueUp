import { ORBIT_MARKER_HALF, clampDirection, type OrbitHazard, type OrbitSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const TAU = Math.PI * 2;
/** How fast everyone circles the ring (radians a second): brisk from the start, and quicker over `RAMP_S`, then no quicker. */
const OMEGA = [1.7, 3.2] as const;
/** Things come in from the edge or out of the middle toward a spot on the ring. They are in the air this long (a warning), and arrive this often. */
const FLY_S = [1.5, 0.85] as const;
const EVERY_S = [1.0, 0.32] as const;
/** How much of the ring (half, in radians) one of them takes, not counting the marker's own size. */
const HALF = [0.2, 0.34] as const;
const RAMP_S = 38;
/** A thing is deadly for this long either side of the moment it reaches the ring. */
const DEADLY_S = 0.07;
/** The first one comes after this long, so there is a moment to get going. */
const FIRST_S = 1.4;
/** A hidden way round the ring that is always clear of everything (see `safeAt`): it flips direction every so often, within these limits. */
const PATH_FLIP_MIN_S = 0.5;
const PATH_FLIP_EXTRA_S = 1.1;
/** How far from the clear path's spot at that moment a thing is put (radians, at least this, so the path is never touched). */
const CLEAR = 0.12;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;
const along = (seconds: number) => Math.min(1, Math.max(0, seconds / RAMP_S));
/** How far round the ring someone going the whole time has got by `t` seconds: the integral of the speed. */
function turned(t: number): number {
  const ramp = Math.min(t, RAMP_S);
  const early = OMEGA[0] * ramp + ((OMEGA[1] - OMEGA[0]) * ramp * ramp) / (2 * RAMP_S);
  return early + (t > RAMP_S ? OMEGA[1] * (t - RAMP_S) : 0);
}
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
/** The shortest way between two angles. */
const gap = (a: number, b: number) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);

interface Orbiter extends RoundPlayer {
  /** Where they are round the ring (radians, 0 at the top, going clockwise) and which way they are going (1 or -1). */
  theta: number;
  dir: number;
}

interface Thing {
  n: number;
  angle: number;
  /** Seconds into the run when it reaches the ring, and how long it was in the air before that. */
  hitAt: number;
  flyS: number;
  half: number;
  from: 'out' | 'in';
}

/** Circle the ring and dodge what flies at it: one button flips which way you go. Things come in from the edge or out of the middle, each
 * with a warning as it flies, and one that reaches the ring where you are is the end of your run. They get quicker and thicker, and you go
 * quicker round the ring, for 38 seconds, and then it stays that hard. Everything comes from the round's seed, and is made so that there
 * is always a way round that touches nothing, so it can always be done. Players never touch each other, so each device works out its own
 * marker (see RoundGame.clientSim). The score is how many seconds you lasted. See RoundGame for how runs start and end. */
export class OrbitGame extends RoundGame<Orbiter> {
  readonly id = 'orbit' as const;
  private things: Thing[] = [];
  private spawned = 0;
  /** When (seconds into the run) the next thing is to arrive. */
  private nextAt = FIRST_S;
  /** The clear way round: where it flips, as (time, direction, where it was) at each flip. */
  private path: { t: number; dir: number; from: number }[] = [];
  private pathUntil = 0;

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Orbiter, f: Record<string, number>): void {
    p.theta = wrap(RoundGame.num(f.a, p.theta));
    p.dir = f.d === -1 ? -1 : 1;
  }

  protected writeReport(p: Orbiter): Record<string, number> {
    return { a: Math.round(p.theta * 1000) / 1000, d: p.dir };
  }

  protected createPlayer(id: string, alive: boolean): Orbiter {
    return { id, theta: 0, dir: 1, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Orbiter): void {
    p.theta = 0;
    p.dir = 1;
  }

  protected resetCourse(): void {
    this.things = [];
    this.spawned = 0;
    this.nextAt = FIRST_S;
    this.path = [{ t: 0, dir: 1, from: 0 }];
    this.pathUntil = 0;
    this.lay(0);
  }

  protected beginCourse(): void {
    // The first things were laid when the countdown began.
  }

  input(userId: string, dx: number, _dy?: number): void {
    // Left and right on a keyboard pick the way round; the one button flips it.
    const p = this.players.get(userId);
    const d = clampDirection(dx);
    if (p && p.alive && d !== 0 && this.phase === 'playing' && this.simulated(p)) p.dir = d;
  }

  action(userId: string, name: string): void {
    if (name !== 'flip' || this.phase !== 'playing') return;
    const p = this.players.get(userId);
    // A device that reports its own marker flips it there.
    if (p?.alive && this.simulated(p)) p.dir = -p.dir;
  }

  protected override knockOut(p: Orbiter): void {
    super.knockOut(p);
    p.outAtMeters = Math.floor(this.roundMs / 1000);
  }

  /** Where the clear way round is at `t` seconds. It goes round at the same speed as everyone, flipping now and then. */
  private safeAt(t: number): number {
    while (this.pathUntil < t + 0.01) this.extendPath();
    let seg = this.path[0];
    for (const s of this.path) if (s.t <= t) seg = s;
    return wrap(seg.from + seg.dir * (turned(t) - turned(seg.t)));
  }

  private extendPath(): void {
    // Always take the same random number for each flip.
    const wait = PATH_FLIP_MIN_S + this.rng() * PATH_FLIP_EXTRA_S;
    const last = this.path[this.path.length - 1];
    const t = last.t + wait;
    this.pathUntil = t;
    this.path.push({ t, dir: -last.dir, from: wrap(last.from + last.dir * (turned(t) - turned(last.t))) });
  }

  /** Lays everything that is due to arrive up to a few seconds after `seconds`, so it is in the air long enough to be seen coming. */
  private lay(seconds: number): void {
    while (this.nextAt <= seconds + FLY_S[0] + 0.1) {
      const d = along(this.nextAt);
      // Always the same three random numbers, so one thing does not change the ones after it.
      const [where, origin, spread] = [this.rng(), this.rng(), this.rng()];
      const half = lerp(HALF, d) * (0.8 + 0.4 * spread);
      const keep = half + ORBIT_MARKER_HALF + CLEAR;
      const clear = this.safeAt(this.nextAt);
      // Anywhere on the ring except round the clear way's spot at that moment.
      const angle = wrap(clear + keep + where * (TAU - 2 * keep));
      this.things.push({ n: ++this.spawned, angle, hitAt: this.nextAt, flyS: lerp(FLY_S, d), half, from: origin < 0.5 ? 'out' : 'in' });
      this.nextAt += lerp(EVERY_S, d);
    }
  }

  snapshot(): OrbitSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    const d = along(t);
    return {
      id: 'orbit',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      omega: r3(lerp(OMEGA, d)),
      hazards: this.things
        .filter((x) => x.hitAt - x.flyS <= t + 0.001 && x.hitAt + DEADLY_S >= t)
        .map((x): OrbitHazard => ({ n: x.n, a: r3(x.angle), hitInMs: Math.round((x.hitAt - t) * 1000), flyMs: Math.round(x.flyS * 1000), w: r3(x.half), from: x.from })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        a: r3(p.theta),
        dir: p.dir,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const t = this.roundMs / 1000;
    this.distance = t / 20;
    this.lay(t);
    const omega = lerp(OMEGA, along(t));
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.theta = wrap(p.theta + p.dir * omega * dt);
      for (const x of this.things) {
        if (Math.abs(x.hitAt - t) <= DEADLY_S && gap(p.theta, x.angle) < x.half + ORBIT_MARKER_HALF) {
          this.knockOut(p);
          break;
        }
      }
    }
    this.things = this.things.filter((x) => x.hitAt + DEADLY_S >= t - 0.5);
  }
}
