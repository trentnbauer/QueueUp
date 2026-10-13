import { RUNNER_X, clampDirection, type RunnerObstacle, type RunnerObstacleKind, type RunnerSnapshot, type LobbyRoundPhase } from '@queueup/shared';
import type { LobbyGame } from './types.js';

// Distances are in screens (the track is 1.0 wide), heights in lane heights (a lane is 1.0 tall),
// times in seconds unless a name ends in Ms.
const GRAVITY = 9;
const JUMP_SPEED = 3.3; // airborne for about 0.73s, up to a height of about 0.6
const RUNNER_WIDTH = 0.04;
const STAND_HEIGHT = 0.45;
const DUCK_HEIGHT = 0.25;
// Cactus: low, must be jumped. Bird: flies mid-height, must be ducked under (a jump runs into it).
const OBSTACLES: Record<RunnerObstacleKind, { width: number; from: number; to: number }> = {
  cactus: { width: 0.04, from: 0, to: 0.35 },
  bird: { width: 0.06, from: 0.3, to: 0.7 },
};
const SPEED_START = 0.5;
const SPEED_GAIN = 0.015; // per second of the run
const SPEED_MAX = 1.0;
/** Obstacles are made this far ahead of the screen's left edge, i.e. just off the right edge. */
const SPAWN_AHEAD = 1.3;
/** The nearest two obstacles may be this many seconds of running apart (plus up to GAP_EXTRA more):
 * enough to land and react, so every course can be cleared. */
const GAP_MIN_S = 1.05;
const GAP_EXTRA_S = 0.9;
/** Birds only show up this far into a run, so it opens with cacti. */
const BIRDS_AFTER_MS = 8000;
const BIRD_CHANCE = 0.3;
const METERS_PER_SCREEN = 20;
const COUNTDOWN_MS = 3000;
const OVER_MS = 4000;
const MAX_STEP_S = 1 / 60;
const VISIBLE_BEHIND = 0.2;

interface Runner {
  id: string;
  h: number;
  vy: number;
  wantDuck: boolean;
  alive: boolean;
  wins: number;
  /** Metres at the moment they were knocked out. */
  outAtMeters: number;
}

/** A small seeded generator, so a course is the same for everyone and tests can replay one. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The offline dinosaur game with everyone on one course: obstacles scroll in, faster and faster. Jump
 * the cacti, duck the birds; hit one and you are out. Last runner standing wins the run, and a new
 * one starts by itself. Alone it is a high-score run. */
export class RunnerGame implements LobbyGame {
  readonly id = 'runner' as const;
  private readonly runners = new Map<string, Runner>();
  private phase: LobbyRoundPhase = 'lobby';
  private timerMs = 0;
  private roundMs = 0;
  private distance = 0;
  private speed = SPEED_START;
  private obstacles: { x: number; kind: RunnerObstacleKind }[] = [];
  private nextSpawnX = 0;
  private rng: () => number;
  private startedWith = 0;
  private winnerId: string | null = null;

  constructor(private readonly seedSource: () => number = Math.random) {
    this.rng = mulberry32(Math.floor(this.seedSource() * 4294967296));
  }

  join(userId: string): void {
    if (this.runners.has(userId)) return;
    this.runners.set(userId, {
      id: userId,
      h: 0,
      vy: 0,
      wantDuck: false,
      // Someone who arrives mid-run watches it, and runs from the next one.
      alive: this.phase !== 'playing' && this.phase !== 'over',
      wins: 0,
      outAtMeters: 0,
    });
    if (this.phase === 'lobby') this.startCountdown();
  }

  leave(userId: string): void {
    this.runners.delete(userId);
    if (this.runners.size === 0) {
      this.phase = 'lobby';
      return;
    }
    if (this.phase === 'playing') this.checkRunEnd();
  }

  input(userId: string, _dx: number, dy: number): void {
    const r = this.runners.get(userId);
    if (!r) return;
    const dir = clampDirection(dy);
    r.wantDuck = dir === 1;
    if (dir === -1) this.jump(r);
  }

  action(userId: string, name: string): void {
    if (name !== 'jump') return;
    const r = this.runners.get(userId);
    if (r) this.jump(r);
  }

  tick(dtMs: number): void {
    let left = Math.min(dtMs, 250) / 1000;
    while (left > 1e-9) {
      const step = Math.min(left, MAX_STEP_S);
      left -= step;
      this.step(step);
    }
  }

  snapshot(): RunnerSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const metersNow = Math.floor(this.distance * METERS_PER_SCREEN);
    return {
      id: 'runner',
      phase: this.phase,
      meters: metersNow,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      obstacles: this.obstacles
        .map((o): RunnerObstacle => ({ x: r3(o.x - this.distance), kind: o.kind }))
        .filter((o) => o.x > -VISIBLE_BEHIND && o.x < SPAWN_AHEAD),
      players: [...this.runners.values()].map((r) => ({
        id: r.id,
        h: r3(r.h),
        ducking: this.isDucking(r),
        alive: r.alive,
        wins: r.wins,
        meters: r.alive && this.phase === 'playing' ? metersNow : r.outAtMeters,
      })),
    };
  }

  private onGround(r: Runner): boolean {
    return r.h <= 0 && r.vy <= 0;
  }

  private isDucking(r: Runner): boolean {
    return r.alive && this.phase === 'playing' && r.wantDuck && this.onGround(r);
  }

  private jump(r: Runner): void {
    if (this.phase !== 'playing' || !r.alive || !this.onGround(r)) return;
    r.vy = JUMP_SPEED;
    r.h = 1e-6;
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
        this.advanceRun(dt);
        break;
      case 'over':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) {
          if (this.runners.size > 0) this.startCountdown();
          else this.phase = 'lobby';
        }
        break;
    }
  }

  private advanceRun(dt: number): void {
    this.roundMs += dt * 1000;
    this.speed = Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * (this.roundMs / 1000));
    this.distance += this.speed * dt;
    this.spawnObstacles();

    for (const r of this.runners.values()) {
      if (!r.alive) continue;
      if (r.h > 0 || r.vy > 0) {
        r.vy -= GRAVITY * dt;
        r.h += r.vy * dt;
        if (r.h <= 0) {
          r.h = 0;
          r.vy = 0;
        }
      }
      if (this.hitsObstacle(r)) {
        r.alive = false;
        r.outAtMeters = Math.floor(this.distance * METERS_PER_SCREEN);
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x - this.distance > -VISIBLE_BEHIND);
    this.checkRunEnd();
  }

  private hitsObstacle(r: Runner): boolean {
    const top = r.h + (this.isDucking(r) ? DUCK_HEIGHT : STAND_HEIGHT);
    for (const o of this.obstacles) {
      const spec = OBSTACLES[o.kind];
      const rel = o.x - this.distance;
      if (Math.abs(rel - RUNNER_X) >= (spec.width + RUNNER_WIDTH) / 2) continue;
      if (r.h < spec.to && top > spec.from) return true;
    }
    return false;
  }

  private spawnObstacles(): void {
    while (this.nextSpawnX < this.distance + SPAWN_AHEAD) {
      const bird = this.roundMs >= BIRDS_AFTER_MS && this.rng() < BIRD_CHANCE;
      const kind: RunnerObstacleKind = bird ? 'bird' : 'cactus';
      this.obstacles.push({ x: this.nextSpawnX, kind });
      this.nextSpawnX += this.speed * (GAP_MIN_S + this.rng() * GAP_EXTRA_S);
    }
  }

  /** A run ends when one runner (or none) is left; alone, when you are out. */
  private checkRunEnd(): void {
    if (this.phase !== 'playing') return;
    const alive = [...this.runners.values()].filter((r) => r.alive);
    if (alive.length > (this.startedWith > 1 ? 1 : 0)) return;
    this.phase = 'over';
    this.timerMs = OVER_MS;
    const winner = this.startedWith > 1 && alive.length === 1 ? alive[0] : null;
    this.winnerId = winner?.id ?? null;
    if (winner) {
      winner.wins++;
      winner.outAtMeters = Math.floor(this.distance * METERS_PER_SCREEN);
    }
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.timerMs = COUNTDOWN_MS;
    this.winnerId = null;
    this.distance = 0;
    this.speed = SPEED_START;
    this.obstacles = [];
    this.rng = mulberry32(Math.floor(this.seedSource() * 4294967296));
    for (const r of this.runners.values()) {
      r.alive = true;
      r.h = 0;
      r.vy = 0;
      r.wantDuck = false;
      r.outAtMeters = 0;
    }
  }

  private beginRun(): void {
    this.phase = 'playing';
    this.timerMs = 0;
    this.roundMs = 0;
    this.distance = 0;
    this.speed = SPEED_START;
    this.startedWith = [...this.runners.values()].filter((r) => r.alive).length;
    // The first obstacle is a little way in, so there is time to see it coming.
    this.nextSpawnX = 1.1;
    this.obstacles = [];
    this.spawnObstacles();
  }
}
