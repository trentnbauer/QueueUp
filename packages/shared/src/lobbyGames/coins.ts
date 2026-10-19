import { COINS_ITEM_SIZE, COINS_PLAYER_WIDTH, COINS_PLAYER_Y, clampDirection, type CoinItem, type CoinsSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0..1 down from the top.
const ROUND_S = 30;
const PLAYER_SPEED = 0.6;
const FALL_START = 0.4;
const FALL_GAIN = 0.01; // per second of the round
const FALL_MAX = 0.7;
/** Seconds between new items: starts slow and gets busier, down to a floor. */
const SPAWN_START_S = 0.55;
const SPAWN_GAIN_S = 0.008;
const SPAWN_MIN_S = 0.3;
const BOMB_CHANCE = 0.2;
/** A bomb stuns for this long (the catcher cannot move) and costs a coin. */
const STUN_S = 1;
const BOMB_COST = 1;
/** How far above or below a catcher an item can be and still be caught. */
const CATCH_DEPTH = 0.05;
const GONE_BELOW = 1.1;
const EDGE = 0.05;

interface Catcher extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
  /** Coins caught this round. */
  score: number;
  /** Seconds of stun left. */
  stun: number;
}

/** Coins and the odd bomb fall; slide left and right to catch the coins. Everyone catches on the same
 * field and goes for the same coins. When the 30 seconds are up, most coins wins. Nobody is knocked
 * out. See RoundGame for how rounds start and end. */
export class CoinsGame extends RoundGame<Catcher> {
  readonly id = 'coins' as const;
  private speed = FALL_START;
  private items: CoinItem[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private lastWasBomb = false;

  /** The score shown for the round: the most coins anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Catcher {
    return { id, x: 0.5, dir: 0, score: 0, stun: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Catcher): void {
    p.x = 0.5;
    p.dir = 0;
    p.score = 0;
    p.stun = 0;
  }

  protected resetCourse(): void {
    this.speed = FALL_START;
    this.items = [];
    this.spawned = 0;
    this.lastWasBomb = false;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // A moment before the first item, so there is time to get ready.
    this.spawnIn = 0.8;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Moving left and right is all there is to do.
  }

  snapshot(): CoinsSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'coins',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(this.speed) : 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      items: this.items.map((i) => ({ x: r3(i.x), y: r3(i.y), kind: i.kind, n: i.n })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        dir: p.stun > 0 ? 0 : p.dir,
        stunned: p.stun > 0,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : 0,
      })),
    };
  }

  protected override get ownLimitS(): number {
    return ROUND_S;
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.speed = Math.min(FALL_MAX, FALL_START + FALL_GAIN * seconds);

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnItem();
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }

    for (const i of this.items) i.y += this.speed * dt;

    const half = COINS_PLAYER_WIDTH / 2;
    const catchers = [...this.players.values()].filter((p) => p.alive);
    for (const p of catchers) {
      if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
      else p.x = Math.min(1 - half, Math.max(half, p.x + p.dir * PLAYER_SPEED * dt));
    }
    this.items = this.items.filter((item) => !this.caught(item, catchers) && item.y < GONE_BELOW);

    if (seconds >= ROUND_S) this.finishRound(catchers);
  }

  /** Hands the item to whoever it reaches (the nearest, if two do at once). True if someone took it. */
  private caught(item: CoinItem, catchers: Catcher[]): boolean {
    if (Math.abs(item.y - COINS_PLAYER_Y) >= CATCH_DEPTH) return false;
    let taker: Catcher | null = null;
    for (const p of catchers) {
      if (Math.abs(item.x - p.x) >= (COINS_PLAYER_WIDTH + COINS_ITEM_SIZE) / 2) continue;
      // A stunned player cannot be hit by another bomb, so a bomb falls past them.
      if (item.kind === 'bomb' && p.stun > 0) continue;
      if (!taker || Math.abs(item.x - p.x) < Math.abs(item.x - taker.x)) taker = p;
    }
    if (!taker) return false;
    if (item.kind === 'coin') taker.score++;
    else {
      taker.score = Math.max(0, taker.score - BOMB_COST);
      taker.stun = STUN_S;
    }
    return true;
  }

  /** Time is up: most coins wins. A tie for the most, or a solo round, has no winner. */
  private finishRound(catchers: Catcher[]): void {
    for (const p of catchers) p.outAtMeters = p.score;
    const best = Math.max(0, ...catchers.map((p) => p.score));
    const leaders = catchers.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }

  private spawnItem(): void {
    const bomb = !this.lastWasBomb && this.rng() < BOMB_CHANCE;
    this.lastWasBomb = bomb;
    const x = EDGE + this.rng() * (1 - 2 * EDGE);
    this.items.push({ x, y: -COINS_ITEM_SIZE, kind: bomb ? 'bomb' : 'coin', n: ++this.spawned });
  }
}
