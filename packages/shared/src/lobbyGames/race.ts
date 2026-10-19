import {
  RACE_CAR_HEIGHT,
  RACE_CAR_WIDTH,
  RACE_FRONT_Y,
  RACE_KERB,
  RACE_OUT_Y,
  clampDirection,
  type RaceObstacle,
  type RaceObstacleKind,
  type RacePit,
  type RaceSnapshot,
} from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0..1 down from the top. The track scrolls down.
const STEER_SPEED = 0.6;
const SPEED_START = 0.45;
const SPEED_GAIN = 0.012; // per second of the run
const SPEED_MAX = 0.95;
/** Seconds between new obstacles: starts roomy and gets busier, down to a floor. */
const SPAWN_START_S = 0.9;
const SPAWN_GAIN_S = 0.015;
const SPAWN_MIN_S = 0.22;
/** How hard each kind knocks a driver back: the speed (screens per second) they start sliding down the
 * screen at. A cone is a nudge, a rock a real drop; one hit is never enough to go off the bottom. */
const KNOCK: Record<RaceObstacleKind, number> = { cone: 0.5, oil: 0.65, rock: 0.8 };
/** After a hit a driver slows their slide and climbs back toward the front: their speed down the screen
 * falls by this much every second... */
const RECOVER_ACCEL = 1.2;
/** ...until they are climbing at this speed, which they keep until they reach the front line. */
const RECOVER_MAX = 0.06;
/** No second hit for this long after one, so a driver is not hit by the same mess twice. */
const GRACE_S = 0.5;
/** Obstacles are never made over the "safe lane", a strip that wanders slowly from side to side, so a way
 * through always exists for someone who keeps up with it. */
const SAFE_HALF_WIDTH = 0.1;
const SAFE_DRIFT = 0.08;
const SAFE_MIN = RACE_KERB + SAFE_HALF_WIDTH;
const SAFE_MAX = 1 - RACE_KERB - SAFE_HALF_WIDTH;
const OBSTACLE_TRIES = 10;
const GONE_BELOW = 1.2;
/** Drivers start spread across this part of the track, each at a spot that comes from their own id, so
 * the server and a player's own device agree on it without knowing who else is racing. */
/** Pit lanes come in stretches this long (in screens of track), and a driver in one is dragged back down the
 * screen at this speed (screens a second): a hit knocks harder, but this never lets up while they stay in. */
const PIT_LENGTH = 0.8;
const PIT_SLIDE = 0.14;
/** The first stretches are clear, so a run starts on a plain road. */
const PIT_CLEAR_STRETCHES = 3;
/** A stretch has a first pit lane this often, and a second this often. A pit is between these widths (a tenth of the track to a third),
 * and sits against the left kerb, the right one or anywhere in the middle; which of the sides is likelier swings slowly over the run. */
const PIT_FIRST_CHANCE = 0.75;
const PIT_SECOND_CHANCE = 0.35;
const PIT_MIN_W = 0.1;
const PIT_MAX_W = 0.32;
/** A pit never comes closer than this to the safe lane (beyond its half width), so there is always a clear way through, and the
 * safe lane has room to drift without running into one. */
const PIT_SAFE_MARGIN = 0.1;
const START_MIN = 0.3;
const START_SPAN = 0.4;

interface Driver extends RoundPlayer {
  x: number;
  y: number;
  /** How fast they are sliding down the screen (screens per second); negative while climbing back. */
  vy: number;
  /** -1, 0 or 1: the direction they are steering. */
  dir: number;
  /** Seconds left in which they cannot be hit again. */
  grace: number;
  /** The last obstacle that hit them, which cannot hit them again. */
  lastHit: number;
}

/** Where a driver starts across the track: the same for an id wherever it is worked out. */
export function raceStartX(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return START_MIN + ((h >>> 0) / 4294967296) * START_SPAN;
}

/** A top-down race: obstacles scroll down the track, steer clear of them. A hit slows a driver and they
 * slide down the screen, then recover and climb back, but never past the middle line (full speed). Off the
 * bottom and you are out; last driver on the screen wins. See RoundGame for how runs start and end. */
export class RaceGame extends RoundGame<Driver> {
  readonly id = 'race' as const;
  private speed = SPEED_START;
  private obstacles: RaceObstacle[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private safe = 0.5;
  private pits: RacePit[] = [];
  private pitStretches = 0;
  /** Track still to scroll before the next stretch of pit lane is made. */
  private pitFeed = 0;
  /** Where in its slow swing the pit lanes' busier side is when the run starts, from the seed. */
  private pitPhase = 0;

  /** Each player's own device works out where they drive (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Driver, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.y = Math.min(RACE_OUT_Y + 0.1, Math.max(RACE_FRONT_Y, RoundGame.num(f.y, p.y)));
    p.vy = RoundGame.num(f.vy, p.vy);
    p.dir = clampDirection(f.dir);
    p.grace = Math.min(GRACE_S, Math.max(0, RoundGame.num(f.grace, 0)));
  }

  protected writeReport(p: Driver): Record<string, number> {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { x: r3(p.x), y: r3(p.y), vy: r3(p.vy), dir: p.dir, grace: r3(p.grace) };
  }

  protected createPlayer(id: string, alive: boolean): Driver {
    const p: Driver = { id, x: 0.5, y: RACE_FRONT_Y, vy: 0, dir: 0, grace: 0, lastHit: 0, alive, wins: 0, outAtMeters: 0 };
    this.resetPlayer(p);
    return p;
  }

  protected resetPlayer(p: Driver): void {
    p.x = raceStartX(p.id);
    p.y = RACE_FRONT_Y;
    p.vy = 0;
    p.dir = 0;
    p.grace = 0;
    p.lastHit = 0;
  }

  protected resetCourse(): void {
    this.speed = SPEED_START;
    this.obstacles = [];
    this.safe = 0.5;
    this.spawned = 0;
    this.pits = [];
    this.pitStretches = 0;
    this.pitFeed = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.pitPhase = this.rng() * Math.PI * 2;
    // A moment before the first obstacle, so there is time to get ready.
    this.spawnIn = 1;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Steering is all there is to do.
  }

  snapshot(): RaceSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'race',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      obstacles: this.obstacles.map((o) => ({ x: r3(o.x), y: r3(o.y), w: r3(o.w), h: r3(o.h), kind: o.kind, n: o.n })),
      pits: this.pits.map((s) => ({ x0: r3(s.x0), x1: r3(s.x1), y: r3(s.y), h: s.h, n: s.n })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        y: r3(p.y),
        dir: p.dir,
        hit: p.grace > 0,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.speed = Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * seconds);
    this.distance += this.speed * dt;

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnObstacle();
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }

    for (const o of this.obstacles) o.y += this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.y < GONE_BELOW);

    this.pitFeed -= this.speed * dt;
    while (this.pitFeed <= 0) {
      this.spawnPits(-this.pitFeed);
      this.pitFeed += PIT_LENGTH;
    }
    for (const s of this.pits) s.y += this.speed * dt;
    this.pits = this.pits.filter((s) => s.y < GONE_BELOW);

    const half = RACE_CAR_WIDTH / 2;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.x = Math.min(1 - RACE_KERB - half, Math.max(RACE_KERB + half, p.x + p.dir * STEER_SPEED * dt));
      // Sliding back slows down and turns into a climb back to the front, which is as far as anyone gets.
      p.vy = Math.max(-RECOVER_MAX, p.vy - RECOVER_ACCEL * dt);
      // In a pit lane the drag never lets up, so the way out is to steer back onto the road.
      if (this.inPit(p)) p.vy = Math.max(p.vy, PIT_SLIDE);
      p.y += p.vy * dt;
      if (p.y <= RACE_FRONT_Y) {
        p.y = RACE_FRONT_Y;
        p.vy = 0;
      }
      p.grace = Math.max(0, p.grace - dt);
      const hit = p.grace > 0 ? null : this.hit(p);
      if (hit) {
        p.vy = Math.max(p.vy, 0) + KNOCK[hit.kind];
        p.grace = GRACE_S;
        p.lastHit = hit.n;
      }
      if (p.y > RACE_OUT_Y) this.knockOut(p);
    }
  }

  /** Whether the driver's middle is over a pit lane right now. */
  private inPit(p: Driver): boolean {
    return this.pits.some((s) => p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y && p.y <= s.y + s.h);
  }

  /** Makes the next stretch of pit lanes at the top of the screen, `over` screens further down than its start: up to two,
   * against either kerb or anywhere in the middle, each from a tenth to a third of the track wide, never over the safe lane
   * and the room it needs. Which of the left, right and middle is likelier swings slowly over the run. The same random
   * numbers are always taken, so the course does not depend on what was refused. */
  private spawnPits(over: number): void {
    const k = this.pitStretches++;
    const lean = Math.sin(this.pitPhase + k * 0.3);
    const draws = [0, 1].map(() => ({ here: this.rng(), where: this.rng(), width: this.rng(), at: this.rng() }));
    if (k < PIT_CLEAR_STRETCHES) return;
    const y = over - PIT_LENGTH;
    const left = 0.3 - 0.2 * lean;
    const right = 0.3 + 0.2 * lean;
    const keepClear = SAFE_HALF_WIDTH + PIT_SAFE_MARGIN;
    const placed: { x0: number; x1: number }[] = [];
    draws.forEach((d, slot) => {
      if (d.here >= (slot === 0 ? PIT_FIRST_CHANCE : PIT_SECOND_CHANCE)) return;
      const w = PIT_MIN_W + d.width * (PIT_MAX_W - PIT_MIN_W);
      const total = left + right + 0.4;
      const pick = d.where * total;
      let x0: number;
      if (pick < left) x0 = RACE_KERB;
      else if (pick < left + right) x0 = 1 - RACE_KERB - w;
      else x0 = RACE_KERB + d.at * (1 - 2 * RACE_KERB - w);
      const x1 = x0 + w;
      if (x1 > this.safe - keepClear && x0 < this.safe + keepClear) return;
      if (placed.some((o) => x1 > o.x0 - 0.04 && x0 < o.x1 + 0.04)) return;
      placed.push({ x0, x1 });
      this.pits.push({ x0, x1, y, h: PIT_LENGTH, n: k * 2 + slot + 1 });
    });
  }

  private hit(p: Driver): RaceObstacle | null {
    for (const o of this.obstacles) {
      if (o.n === p.lastHit) continue;
      if (Math.abs(o.x - p.x) < (o.w + RACE_CAR_WIDTH) / 2 && Math.abs(o.y - p.y) < (o.h + RACE_CAR_HEIGHT) / 2) return o;
    }
    return null;
  }

  private spawnObstacle(): void {
    // The safe lane drifts, but never into a pit lane that is on the track where this obstacle starts: it stays in the gap its
    // last position was in (pits are never made over it, see spawnPits).
    let lo = SAFE_MIN;
    let hi = SAFE_MAX;
    for (const s of this.pits) {
      if (s.y > 0 || s.y + s.h < 0) continue;
      if (s.x1 <= this.safe) lo = Math.max(lo, s.x1 + SAFE_HALF_WIDTH);
      else if (s.x0 >= this.safe) hi = Math.min(hi, s.x0 - SAFE_HALF_WIDTH);
    }
    this.safe = Math.min(hi, Math.max(lo, this.safe + (this.rng() - 0.5) * 2 * SAFE_DRIFT));
    for (let i = 0; i < OBSTACLE_TRIES; i++) {
      const roll = this.rng();
      const kind: RaceObstacleKind = roll < 0.45 ? 'cone' : roll < 0.75 ? 'oil' : 'rock';
      const w = kind === 'cone' ? 0.04 : kind === 'oil' ? 0.1 + this.rng() * 0.06 : 0.07 + this.rng() * 0.03;
      const h = kind === 'cone' ? 0.045 : kind === 'oil' ? 0.05 : 0.07;
      const x = RACE_KERB + w / 2 + this.rng() * (1 - 2 * RACE_KERB - w);
      if (Math.abs(x - this.safe) < SAFE_HALF_WIDTH + w / 2) continue;
      this.obstacles.push({ x, y: -h, w, h, kind, n: ++this.spawned });
      return;
    }
  }
}
