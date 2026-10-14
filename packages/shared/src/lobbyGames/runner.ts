import { RUNNER_X, clampDirection, type RunnerObstacle, type RunnerObstacleKind, type RunnerSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Distances are in screens (the track is 1.0 wide), heights in lane heights (a lane is 1.0 tall),
// times in seconds unless a name ends in Ms.
const GRAVITY = 9;
const JUMP_SPEED = 3.3; // a tap: airborne for about 0.73s, up to a height of about 0.6
/** While the jump button is held on the way up, gravity is this much weaker, so a held jump goes
 * higher (about 1.1) and stays above a low obstacle for nearly twice as long (about 0.95s) - long
 * enough to clear a log. Letting go (or never holding) falls back to GRAVITY. */
const GRAVITY_HELD = 5;
const RUNNER_WIDTH = 0.04;
const STAND_HEIGHT = 0.45;
const DUCK_HEIGHT = 0.25;
// Cactus: low, must be jumped. Bird: flies mid-height, must be ducked under (a tap jump runs into it).
// Log: low but wide, so only a held jump stays in the air long enough.
const OBSTACLES: Record<RunnerObstacleKind, { width: number; from: number; to: number }> = {
  cactus: { width: 0.1, from: 0, to: 0.35 },
  bird: { width: 0.06, from: 0.3, to: 0.7 },
  log: { width: 0.3, from: 0, to: 0.35 },
};
const SPEED_START = 0.5;
const SPEED_GAIN = 0.015; // per second of the run
const SPEED_MAX = 1.0;
/** Obstacles are made this far ahead of the screen's left edge, i.e. just off the right edge. */
const SPAWN_AHEAD = 1.3;
/** There is this many seconds of running between the edges of two obstacles (plus up to GAP_EXTRA
 * more): enough to land and react, so every course can be cleared. */
const GAP_MIN_S = 1.05;
const GAP_EXTRA_S = 0.9;
/** Birds and logs only show up this far into a run, so it opens with cacti. */
const LOGS_AFTER_MS = 5000;
const LOG_CHANCE = 0.2;
const BIRDS_AFTER_MS = 8000;
const BIRD_CHANCE = 0.3;
const VISIBLE_BEHIND = 0.2;

interface Runner extends RoundPlayer {
  h: number;
  vy: number;
  wantDuck: boolean;
  /** The jump button is held down right now. */
  holding: boolean;
  /** This jump started with the button held, and it still is: gravity is eased on the way up. */
  boost: boolean;
}

/** The offline dinosaur game with everyone on one course: obstacles scroll in, faster and faster. Jump
 * the cacti, duck the birds; hit one and you are out. See RoundGame for how runs start and end. */
export class RunnerGame extends RoundGame<Runner> {
  readonly id = 'runner' as const;
  private speed = SPEED_START;
  private obstacles: { x: number; kind: RunnerObstacleKind; n: number }[] = [];
  private spawned = 0;
  /** Where the next obstacle's near edge may be: the far edge of the last one plus a gap. */
  private nextEdgeX = 0;

  protected createPlayer(id: string, alive: boolean): Runner {
    return { id, h: 0, vy: 0, wantDuck: false, holding: false, boost: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(r: Runner): void {
    r.h = 0;
    r.vy = 0;
    r.wantDuck = false;
    r.holding = false;
    r.boost = false;
  }

  protected resetCourse(): void {
    this.speed = SPEED_START;
    this.obstacles = [];
    this.spawned = 0;
  }

  protected beginCourse(): void {
    this.speed = SPEED_START;
    // The first obstacle is a little way in, so there is time to see it coming.
    this.nextEdgeX = 1.05;
    this.obstacles = [];
    this.spawned = 0;
    this.spawnObstacles();
  }

  /** Up (or the held Jump button) jumps, and keeps jumping higher for as long as it is held; Down ducks.
   * A new jump needs the button let go and pressed again, so holding it does not bounce forever. */
  input(userId: string, _dx: number, dy: number): void {
    const r = this.players.get(userId);
    if (!r) return;
    const dir = clampDirection(dy);
    r.wantDuck = dir === 1;
    if (dir === -1) {
      if (!r.holding) this.jump(r, true);
      r.holding = true;
    } else {
      r.holding = false;
      r.boost = false;
    }
  }

  /** A tap on the arena (or a jump with no hold to follow): a short hop. */
  action(userId: string, name: string): void {
    if (name !== 'jump') return;
    const r = this.players.get(userId);
    if (r) this.jump(r, false);
  }

  snapshot(): RunnerSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'runner',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      obstacles: this.obstacles
        .map((o): RunnerObstacle => ({ x: r3(o.x - this.distance), kind: o.kind, n: o.n }))
        .filter((o) => o.x > -VISIBLE_BEHIND && o.x < SPAWN_AHEAD),
      players: [...this.players.values()].map((r) => ({
        id: r.id,
        h: r3(r.h),
        ducking: this.isDucking(r),
        alive: r.alive,
        wins: r.wins,
        meters: r.alive && this.phase === 'playing' ? this.meters : r.outAtMeters,
      })),
    };
  }

  private onGround(r: Runner): boolean {
    return r.h <= 0 && r.vy <= 0;
  }

  private isDucking(r: Runner): boolean {
    return r.alive && this.phase === 'playing' && r.wantDuck && this.onGround(r);
  }

  private jump(r: Runner, held: boolean): void {
    if (this.phase !== 'playing' || !r.alive || !this.onGround(r)) return;
    r.vy = JUMP_SPEED;
    r.h = 1e-6;
    r.boost = held;
  }

  protected advance(dt: number): void {
    this.speed = Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * (this.roundMs / 1000));
    this.distance += this.speed * dt;
    this.spawnObstacles();

    for (const r of this.players.values()) {
      if (!r.alive) continue;
      if (r.h > 0 || r.vy > 0) {
        r.vy -= (r.boost && r.vy > 0 ? GRAVITY_HELD : GRAVITY) * dt;
        r.h += r.vy * dt;
        if (r.h <= 0) {
          r.h = 0;
          r.vy = 0;
          r.boost = false;
        }
      }
      if (this.hitsObstacle(r)) this.knockOut(r);
    }
    this.obstacles = this.obstacles.filter((o) => o.x - this.distance > -VISIBLE_BEHIND);
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
    while (this.nextEdgeX < this.distance + SPAWN_AHEAD) {
      const kind = this.nextKind();
      const half = OBSTACLES[kind].width / 2;
      this.obstacles.push({ x: this.nextEdgeX + half, kind, n: ++this.spawned });
      // The next one starts a gap after this one's far edge.
      this.nextEdgeX += OBSTACLES[kind].width + this.speed * (GAP_MIN_S + this.rng() * GAP_EXTRA_S);
    }
  }

  /** Cacti to begin with; logs and then birds join in as the run goes on. */
  private nextKind(): RunnerObstacleKind {
    if (this.roundMs >= BIRDS_AFTER_MS && this.rng() < BIRD_CHANCE) return 'bird';
    if (this.roundMs >= LOGS_AFTER_MS && this.rng() < LOG_CHANCE) return 'log';
    return 'cactus';
  }
}
