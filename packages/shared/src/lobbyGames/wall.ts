import { WALL_PLAYER_SPEED, WALL_REACH, WALL_ROW_Y, WALL_Y, clampDirection, type WallSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** How long the ball takes to come down from the wall to the row of players: roomy at first, quicker with every hit, down to a floor. */
const DOWN_START_S = 1.6;
const DOWN_SHRINK_S = 0.05; // per hit
const DOWN_MIN_S = 0.8;
/** How long the ball takes to go from a hit up to the wall (it then turns round and comes down for the next player). */
const UP_S = 0.35;
/** A hit counts if it comes within this long of the moment the ball lands (before or after). */
const HIT_WINDOW_S = 0.22;
/** Where the ball lands is the next player's own spot, moved by up to this much: it starts small and grows, so they have to move. */
const OFFSET_START = 0.05;
const OFFSET_GAIN = 0.01; // per hit
const OFFSET_MAX = 0.28;
const WALL_MARGIN = 0.15;

interface Leg {
  kind: 'up' | 'down';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** When it began (ms into the run) and how long it takes (ms). */
  t0: number;
  durMs: number;
}

interface Hitter extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
  hits: number;
}

/** A ball is hit against a wall across the top of the court and comes back down, and each time it comes back it is one player's
 * turn, round the players still in. Be where it lands and press Hit as it does; miss your turn and you are out. The ball lands
 * near the next player's spot, so everyone has to keep moving. Last player in wins. Needs 2 players, so on your own a bot plays
 * you. See RoundGame for how runs start and end. */
export class WallGame extends RoundGame<Hitter> {
  readonly id = 'wall' as const;
  readonly minPlayers = 2;
  private leg: Leg | null = null;
  /** Whose turn it is: the one the ball is coming down for (or, on the way up, the one it will come down for next). */
  private targetId: string | null = null;
  private hits = 0;

  /** The score shown for the run: the hits so far, by everyone. */
  protected get meters(): number {
    return this.hits;
  }

  protected createPlayer(id: string, alive: boolean): Hitter {
    return { id, x: 0.5, dir: 0, hits: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Hitter): void {
    p.x = 0.5;
    p.dir = 0;
    p.hits = 0;
  }

  protected resetCourse(): void {
    this.leg = null;
    this.targetId = null;
    this.hits = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // Players start spread along the row, in the order they joined.
    const ring = this.ring();
    ring.forEach((p, i) => {
      p.x = (i + 1) / (ring.length + 1);
    });
    if (ring.length > 0) this.serve(ring[0]);
  }

  /** The players still in, in the order they joined. */
  private ring(): Hitter[] {
    return [...this.players.values()].filter((p) => p.alive);
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  /** Hits the ball back at the wall, if it is this player's turn and it is landing now and within reach. */
  action(userId: string, name: string): void {
    const p = this.players.get(userId);
    if (name !== 'hit' || this.phase !== 'playing' || !p?.alive || this.targetId !== userId || this.leg?.kind !== 'down') return;
    const lands = this.leg.t0 + this.leg.durMs;
    if (Math.abs(this.roundMs - lands) > HIT_WINDOW_S * 1000 || Math.abs(p.x - this.leg.x1) > WALL_REACH) return;
    p.hits++;
    this.hits++;
    // Straight back up at the wall, from where it was hit; the next player's turn is set up as it comes back.
    const wallX = WALL_MARGIN + this.rng() * (1 - 2 * WALL_MARGIN);
    this.leg = { kind: 'up', x0: this.leg.x1, y0: WALL_ROW_Y, x1: wallX, y1: WALL_Y, t0: this.roundMs, durMs: UP_S * 1000 };
    const ring = this.ring();
    const at = ring.findIndex((q) => q.id === userId);
    this.targetId = ring[(at + 1) % ring.length].id;
  }

  /** Sends the ball down from the wall for `target`, landing near where they stand. */
  private serve(target: Hitter, from = 0.5): void {
    const offset = Math.min(OFFSET_MAX, OFFSET_START + OFFSET_GAIN * this.hits);
    const land = Math.min(1 - WALL_REACH, Math.max(WALL_REACH, target.x + (this.rng() * 2 - 1) * offset));
    const seconds = Math.max(DOWN_MIN_S, DOWN_START_S - DOWN_SHRINK_S * this.hits);
    this.targetId = target.id;
    this.leg = { kind: 'down', x0: from, y0: WALL_Y, x1: land, y1: WALL_ROW_Y, t0: this.roundMs, durMs: seconds * 1000 };
  }

  snapshot(): WallSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const leg = this.leg;
    const k = leg ? Math.min(1, Math.max(0, (this.roundMs - leg.t0) / leg.durMs)) : 0;
    const sec = leg ? leg.durMs / 1000 : 1;
    return {
      id: 'wall',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      ball: leg ? { x: r3(leg.x0 + (leg.x1 - leg.x0) * k), y: r3(leg.y0 + (leg.y1 - leg.y0) * k), vx: r3((leg.x1 - leg.x0) / sec), vy: r3((leg.y1 - leg.y0) / sec) } : { x: 0.5, y: WALL_Y, vx: 0, vy: 0 },
      leg: leg?.kind ?? 'down',
      targetId: this.targetId,
      landX: leg?.kind === 'down' ? r3(leg.x1) : -1,
      landInMs: leg?.kind === 'down' ? Math.max(0, Math.round(leg.t0 + leg.durMs - this.roundMs)) : 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.hits : p.outAtMeters, x: r3(p.x), dir: p.alive ? p.dir : 0 })),
    };
  }

  protected advance(dt: number): void {
    for (const p of this.players.values()) {
      if (p.alive) p.x = Math.min(1, Math.max(0, p.x + p.dir * WALL_PLAYER_SPEED * dt));
    }
    const leg = this.leg;
    if (!leg) return;
    const target = this.targetId ? this.players.get(this.targetId) : undefined;
    if (leg.kind === 'up') {
      // Reached the wall: it turns round and comes down for the next player.
      if (this.roundMs >= leg.t0 + leg.durMs) {
        const next = target?.alive ? target : this.ring()[0];
        if (next) this.serve(next, leg.x1);
      }
      return;
    }
    // On its way down: whoever's turn it is has until the end of the window to hit it, or they are out.
    if (!target?.alive) {
      const next = this.ring()[0];
      if (next) this.serve(next, leg.x0);
      return;
    }
    if (this.roundMs > leg.t0 + leg.durMs + HIT_WINDOW_S * 1000) {
      this.knockOut(target);
      target.outAtMeters = target.hits;
      const next = this.ring().find((p) => p.id !== target.id) ?? this.ring()[0];
      if (next && this.phase === 'playing') this.serve(next, leg.x1);
    }
  }

  protected override runScore(p: Hitter): number {
    return p.alive ? p.hits : p.outAtMeters;
  }
}

/** A bot that moves to where the ball will land when it is its turn and hits it as it arrives, a little early or late. */
export function wallBrain(id: string, rng: () => number): BotBrain {
  let jitter = (rng() - 0.5) * 0.3;
  let lastHits = -1;
  return (snap) => {
    if (snap.id !== 'wall' || snap.phase !== 'playing') return { dx: 0 };
    const me = snap.players.find((p) => p.id === id);
    if (!me?.alive) return { dx: 0 };
    if (snap.meters !== lastHits) {
      lastHits = snap.meters;
      jitter = (rng() - 0.5) * 0.3;
    }
    if (snap.targetId !== id || snap.leg !== 'down') return { dx: 0 };
    const gap = snap.landX - me.x;
    const move = Math.abs(gap) < 0.02 ? 0 : gap > 0 ? 1 : -1;
    // Hit when it is about to land (inside the window, a little early or late, so it can miss on a hard enough ball).
    const ready = Math.abs(gap) <= WALL_REACH * 0.8 && snap.landInMs <= 120 + jitter * 1000;
    return ready ? { dx: move, actions: ['hit'] } : { dx: move };
  };
}
