import { COINS_ITEM_SIZE, COINS_PLAYER_WIDTH, COINS_PLAYER_Y, ENDLESS_LIVES, clampDirection, type CoinItem, type CoinsSnapshot } from '../spinLobby.js';
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
/** The share of items that are bombs: it starts here and climbs as the run goes on (over `ENDLESS_RAMP_S` in an endless run, the 30 seconds
 * of a timed round otherwise), so there are more of them the longer you last. */
const BOMB_START = 0.15;
const BOMB_END = 0.5;
/** Endless (no time limit): things fall quicker and come thicker without stopping short of very hard, and more of them are bombs. Each pair is the
 * value at the start and the one it ramps to over `ENDLESS_RAMP_S`. */
const ENDLESS_RAMP_S = 40;
const ENDLESS_FALL: readonly [number, number] = [0.45, 1.2];
const ENDLESS_SPAWN_S: readonly [number, number] = [0.8, 0.28];
/** In an endless run each coin is within this of the one before it across the screen, so a catcher can get from one to the next (and, as it gets busier,
 * only just): a coin that gets away costs a life, so they cannot be thrown anywhere. */
const ENDLESS_COIN_STEP = 0.35;
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
  /** Lives left (endless runs only): a coin that gets away from the catcher nearest it costs one. A bomb costs all of them. */
  lives: number;
}

/** Coins and the odd bomb fall; slide left and right to catch the coins. Everyone catches on the same
 * field and goes for the same coins. With a time limit it is a 30 second round: most coins wins (a bomb puts a catcher out of it). With none it
 * is endless: each catcher has three lives and a coin that gets away costs the catcher nearest it one, everything keeps getting faster,
 * and the last one standing wins. A bomb is instant death either way, and more of the items are bombs the longer the run lasts. See RoundGame for how rounds start and end. */
export class CoinsGame extends RoundGame<Catcher> {
  readonly id = 'coins' as const;
  private speed = FALL_START;
  private items: CoinItem[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private lastWasBomb = false;
  private lastCoinX = 0.5;
  /** Coins that have fallen past the catchers without anyone taking them (by number), so each costs a life once. */
  private missed = new Set<number>();

  /** The score shown for the round: the most coins anyone has, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  /** How hard it is right now: 0 at the start of an endless run, 1 from `ENDLESS_RAMP_S` seconds in. */
  private get ramp(): number {
    return Math.min(1, this.roundMs / 1000 / ENDLESS_RAMP_S);
  }

  protected createPlayer(id: string, alive: boolean): Catcher {
    return { id, x: 0.5, dir: 0, score: 0, lives: ENDLESS_LIVES, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Catcher): void {
    p.x = 0.5;
    p.dir = 0;
    p.score = 0;
    p.lives = ENDLESS_LIVES;
  }

  protected resetCourse(): void {
    this.speed = FALL_START;
    this.items = [];
    this.spawned = 0;
    this.lastWasBomb = false;
    this.lastCoinX = 0.5;
    this.missed = new Set();
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
        dir: p.dir,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.outAtMeters,
        lives: this.endless ? p.lives : null,
      })),
    };
  }

  protected override get ownLimitS(): number | null {
    return this.endless ? null : ROUND_S;
  }

  protected override knockOut(p: Catcher): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  private loseLife(p: Catcher): void {
    if (--p.lives <= 0) this.knockOut(p);
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    const endless = this.endless;
    const ramp = this.ramp;
    const along = (pair: readonly [number, number]) => pair[0] + (pair[1] - pair[0]) * ramp;
    this.speed = endless ? along(ENDLESS_FALL) : Math.min(FALL_MAX, FALL_START + FALL_GAIN * seconds);

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnItem(BOMB_START + (BOMB_END - BOMB_START) * (endless ? ramp : Math.min(1, seconds / ROUND_S)));
      this.spawnIn += endless ? along(ENDLESS_SPAWN_S) : Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }

    for (const i of this.items) i.y += this.speed * dt;

    const half = COINS_PLAYER_WIDTH / 2;
    const catchers = [...this.players.values()].filter((p) => p.alive);
    for (const p of catchers) {
      p.x = Math.min(1 - half, Math.max(half, p.x + p.dir * PLAYER_SPEED * dt));
    }
    this.items = this.items.filter((item) => !this.caught(item, catchers) && item.y < GONE_BELOW);
    if (endless) this.countMisses(catchers);
    else if (seconds >= ROUND_S) this.finishRound(catchers);
  }

  /** Hands the item to whoever it reaches (the nearest, if two do at once). True if someone took it. */
  private caught(item: CoinItem, catchers: Catcher[]): boolean {
    if (Math.abs(item.y - COINS_PLAYER_Y) >= CATCH_DEPTH) return false;
    let taker: Catcher | null = null;
    for (const p of catchers) {
      if (Math.abs(item.x - p.x) >= (COINS_PLAYER_WIDTH + COINS_ITEM_SIZE) / 2) continue;
      if (!taker || Math.abs(item.x - p.x) < Math.abs(item.x - taker.x)) taker = p;
    }
    if (!taker) return false;
    if (item.kind === 'coin') taker.score++;
    // A bomb is instant death: out for the run, keeping the coins they had.
    else this.knockOut(taker);
    return true;
  }

  /** A coin that has fallen past the catchers' line untaken costs the catcher nearest it a life (alone, that is you). */
  private countMisses(catchers: Catcher[]): void {
    for (const item of this.items) {
      if (item.kind !== 'coin' || item.y < COINS_PLAYER_Y + CATCH_DEPTH || this.missed.has(item.n)) continue;
      this.missed.add(item.n);
      let nearest: Catcher | null = null;
      for (const p of catchers) if (p.alive && (!nearest || Math.abs(item.x - p.x) < Math.abs(item.x - nearest.x))) nearest = p;
      if (nearest) this.loseLife(nearest);
    }
  }

  /** Time is up: most coins wins. A tie for the most, or a solo round, has no winner. */
  private finishRound(catchers: Catcher[]): void {
    for (const p of catchers) p.outAtMeters = p.score;
    const best = Math.max(0, ...catchers.map((p) => p.score));
    const leaders = catchers.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }

  private spawnItem(bombChance: number): void {
    const bomb = !this.lastWasBomb && this.rng() < bombChance;
    this.lastWasBomb = bomb;
    const at = this.rng();
    let x = EDGE + at * (1 - 2 * EDGE);
    if (this.endless && !bomb) {
      x = Math.min(1 - EDGE, Math.max(EDGE, this.lastCoinX + (at * 2 - 1) * ENDLESS_COIN_STEP));
      this.lastCoinX = x;
    }
    this.items.push({ x, y: -COINS_ITEM_SIZE, kind: bomb ? 'bomb' : 'coin', n: ++this.spawned });
  }
}
