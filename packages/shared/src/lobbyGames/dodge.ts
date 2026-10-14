import { DODGE_BLOCK_HEIGHT, DODGE_PLAYER_WIDTH, DODGE_PLAYER_Y, clampDirection, type DodgeBlock, type DodgeSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0..1 down from the top.
const PLAYER_SPEED = 0.5;
const FALL_START = 0.35;
const FALL_GAIN = 0.012; // per second of the run
const FALL_MAX = 0.9;
/** Seconds between new blocks: starts slow and gets busier, down to a floor. */
const SPAWN_START_S = 0.75;
const SPAWN_GAIN_S = 0.01;
const SPAWN_MIN_S = 0.28;
const BLOCK_MIN_W = 0.06;
const BLOCK_EXTRA_W = 0.1;
/** Blocks are never made over the "safe lane", a strip that wanders slowly from side to side, so a way
 * through always exists for someone who keeps up with it. */
const SAFE_HALF_WIDTH = 0.11;
const SAFE_DRIFT = 0.08;
const SAFE_MIN = 0.12;
const SAFE_MAX = 0.88;
const BLOCK_TRIES = 10;
const GONE_BELOW = 1.1;

interface Dodger extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
}

/** Blocks fall faster and faster; slide left and right to stay clear. Last one standing wins. See
 * RoundGame for how runs start and end. */
export class DodgeGame extends RoundGame<Dodger> {
  readonly id = 'dodge' as const;
  private speed = FALL_START;
  private blocks: DodgeBlock[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private safe = 0.5;

  /** Each player's own device works out where they stand (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Dodger, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    p.dir = clampDirection(f.dir);
  }

  protected writeReport(p: Dodger): Record<string, number> {
    return { x: Math.round(p.x * 1000) / 1000, dir: p.dir };
  }

  protected createPlayer(id: string, alive: boolean): Dodger {
    return { id, x: 0.5, dir: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Dodger): void {
    p.x = 0.5;
    p.dir = 0;
  }

  protected resetCourse(): void {
    this.speed = FALL_START;
    this.blocks = [];
    this.safe = 0.5;
    this.spawned = 0;
  }

  protected beginCourse(): void {
    this.speed = FALL_START;
    this.blocks = [];
    this.safe = 0.5;
    this.spawned = 0;
    // A moment before the first block, so there is time to get ready.
    this.spawnIn = 1;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Moving left and right is all there is to do.
  }

  snapshot(): DodgeSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'dodge',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      blocks: this.blocks.map((b) => ({ x: r3(b.x), y: r3(b.y), w: r3(b.w), n: b.n })),
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
      this.spawnBlock();
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }

    for (const b of this.blocks) b.y += this.speed * dt;
    this.blocks = this.blocks.filter((b) => b.y < GONE_BELOW);

    const half = DODGE_PLAYER_WIDTH / 2;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.x = Math.min(1 - half, Math.max(half, p.x + p.dir * PLAYER_SPEED * dt));
      if (this.hit(p)) this.knockOut(p);
    }
  }

  private hit(p: Dodger): boolean {
    for (const b of this.blocks) {
      if (Math.abs(b.x - p.x) < (b.w + DODGE_PLAYER_WIDTH) / 2 && Math.abs(b.y - DODGE_PLAYER_Y) < DODGE_BLOCK_HEIGHT) return true;
    }
    return false;
  }

  private spawnBlock(): void {
    this.safe = Math.min(SAFE_MAX, Math.max(SAFE_MIN, this.safe + (this.rng() - 0.5) * 2 * SAFE_DRIFT));
    for (let i = 0; i < BLOCK_TRIES; i++) {
      const w = BLOCK_MIN_W + this.rng() * BLOCK_EXTRA_W;
      const x = w / 2 + this.rng() * (1 - w);
      if (Math.abs(x - this.safe) < SAFE_HALF_WIDTH + w / 2) continue;
      this.blocks.push({ x, y: -DODGE_BLOCK_HEIGHT, w, n: ++this.spawned });
      return;
    }
  }
}
