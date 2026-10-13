import { FLAPPY_BIRD_RADIUS, FLAPPY_GAP, FLAPPY_PIPE_WIDTH, FLAPPY_X, type FlappyPipe, type FlappySnapshot } from '@queueup/shared';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Distances are in screens (the course is 1.0 wide), heights 0 (floor) to 1 (ceiling).
const GRAVITY = 2.8;
/** Each flap sets the bird's upward speed to this (so it rises about 0.14 before it starts to fall). */
const FLAP_SPEED = 0.9;
const SPEED_START = 0.4;
const SPEED_GAIN = 0.008; // per second of the run
const SPEED_MAX = 0.7;
const SPAWN_AHEAD = 1.3;
/** Pipes are this many seconds of flying apart (plus up to GAP_EXTRA_S more). */
const GAP_MIN_S = 1.5;
const GAP_EXTRA_S = 0.4;
/** Where the middle of an opening can be, and the most it moves from one pipe to the next, so there is
 * always time to flap up or sink down to the next one. */
const GAP_CENTRE_MIN = 0.22;
const GAP_CENTRE_MAX = 0.78;
const GAP_MAX_STEP = 0.2;
const VISIBLE_BEHIND = 0.2;

interface Bird extends RoundPlayer {
  y: number;
  vy: number;
}

/** Flap through the gaps in the pipes, everyone on the same course. Touch a pipe, the floor or the
 * ceiling and you are out. See RoundGame for how runs start and end. */
export class FlappyGame extends RoundGame<Bird> {
  readonly id = 'flappy' as const;
  private speed = SPEED_START;
  private pipes: FlappyPipe[] = [];
  private spawned = 0;
  private nextSpawnX = 0;
  private lastGap = 0.5;

  protected createPlayer(id: string, alive: boolean): Bird {
    return { id, y: 0.5, vy: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(b: Bird): void {
    b.y = 0.5;
    b.vy = 0;
  }

  protected resetCourse(): void {
    this.speed = SPEED_START;
    this.pipes = [];
    this.lastGap = 0.5;
    this.spawned = 0;
  }

  protected beginCourse(): void {
    this.speed = SPEED_START;
    this.pipes = [];
    this.lastGap = 0.5;
    this.spawned = 0;
    // The first pipe is a little way in, so there is time to see it coming.
    this.nextSpawnX = 1.1;
    this.spawnPipes();
  }

  input(): void {
    // Flapping is an action; there is nothing to hold.
  }

  action(userId: string, name: string): void {
    if (name !== 'flap' || this.phase !== 'playing') return;
    const b = this.players.get(userId);
    if (b?.alive) b.vy = FLAP_SPEED;
  }

  snapshot(): FlappySnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'flappy',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      pipes: this.pipes.map((p) => ({ x: r3(p.x - this.distance), gap: r3(p.gap), n: p.n })).filter((p) => p.x > -VISIBLE_BEHIND && p.x < SPAWN_AHEAD),
      players: [...this.players.values()].map((b) => ({
        id: b.id,
        y: r3(b.y),
        vy: r3(b.vy),
        alive: b.alive,
        wins: b.wins,
        meters: b.alive && this.phase === 'playing' ? this.meters : b.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    this.speed = Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * (this.roundMs / 1000));
    this.distance += this.speed * dt;
    this.spawnPipes();

    for (const b of this.players.values()) {
      if (!b.alive) continue;
      b.vy -= GRAVITY * dt;
      b.y += b.vy * dt;
      if (b.y - FLAPPY_BIRD_RADIUS <= 0 || b.y + FLAPPY_BIRD_RADIUS >= 1 || this.hitsPipe(b)) {
        b.y = Math.min(1, Math.max(0, b.y));
        this.knockOut(b);
      }
    }
    this.pipes = this.pipes.filter((p) => p.x - this.distance > -VISIBLE_BEHIND);
  }

  private hitsPipe(b: Bird): boolean {
    for (const p of this.pipes) {
      const rel = p.x - this.distance;
      if (Math.abs(rel - FLAPPY_X) >= (FLAPPY_PIPE_WIDTH + FLAPPY_BIRD_RADIUS * 2) / 2) continue;
      if (b.y - FLAPPY_BIRD_RADIUS < p.gap - FLAPPY_GAP / 2 || b.y + FLAPPY_BIRD_RADIUS > p.gap + FLAPPY_GAP / 2) return true;
    }
    return false;
  }

  private spawnPipes(): void {
    while (this.nextSpawnX < this.distance + SPAWN_AHEAD) {
      const lo = Math.max(GAP_CENTRE_MIN, this.lastGap - GAP_MAX_STEP);
      const hi = Math.min(GAP_CENTRE_MAX, this.lastGap + GAP_MAX_STEP);
      const gap = lo + this.rng() * (hi - lo);
      this.pipes.push({ x: this.nextSpawnX, gap, n: ++this.spawned });
      this.lastGap = gap;
      this.nextSpawnX += this.speed * (GAP_MIN_S + this.rng() * GAP_EXTRA_S);
    }
  }
}
