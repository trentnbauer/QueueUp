import { SNAKE_GRID, type SnakePickup, type SnakeSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** How many cells a snake starts with. */
const START_LENGTH = 3;
/** Seconds between steps: starts leisurely and speeds up as the snakes grow, down to a floor. */
const STEP_START_S = 0.17;
const STEP_GAIN_S = 0.004; // per cell of the longest snake beyond its start
const STEP_MIN_S = 0.075;
/** Where snakes start: a ring this far (in cells) from the middle, so they are spread out and face inward. */
const SPAWN_RING = 8;
const FIRST_STEP_S = 0.4;

/** Headings, clockwise from up. */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

interface Snake extends RoundPlayer {
  /** Cells as [x, y] pairs, head first. */
  cells: [number, number][];
  /** 0 up, 1 right, 2 down, 3 left. */
  heading: number;
  /** A turn asked for since the last step: -1 left, 1 right, 0 none. */
  turn: number;
  /** Cells still to grow by (after eating). */
  grow: number;
}

const cellKey = (x: number, y: number) => y * SNAKE_GRID + x;

/** One shared grid with a snake for each player. Turn left or right; the snake always moves on, grows when
 * it eats the pickups and leaves a trail. Hit a wall or any snake and you are out. Last snake alive wins. Needs
 * 2 players, so on your own a bot plays you. See RoundGame for how runs start and end. */
export class SnakeGame extends RoundGame<Snake> {
  readonly id = 'snake' as const;
  readonly minPlayers = 2;
  private pickups: SnakePickup[] = [];
  private spawned = 0;
  private clock = 0;
  private steps = 0;

  /** The score shown for the run: the longest snake still alive. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.cells.length > best) best = p.cells.length;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Snake {
    return { id, cells: [], heading: 0, turn: 0, grow: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Snake): void {
    p.cells = [];
    p.heading = 0;
    p.turn = 0;
    p.grow = 0;
  }

  protected resetCourse(): void {
    this.pickups = [];
    this.spawned = 0;
    this.clock = 0;
    this.steps = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    const racers = [...this.players.values()].filter((p) => p.alive);
    const c = (SNAKE_GRID - 1) / 2;
    racers.forEach((p, i) => {
      const angle = (i / racers.length) * Math.PI * 2 - Math.PI / 2;
      const hx = Math.round(c + Math.cos(angle) * SPAWN_RING);
      const hy = Math.round(c + Math.sin(angle) * SPAWN_RING);
      // Face the middle along the longer axis.
      const ax = c - hx;
      const ay = c - hy;
      p.heading = Math.abs(ax) >= Math.abs(ay) ? (ax >= 0 ? 1 : 3) : ay >= 0 ? 2 : 0;
      p.cells = Array.from({ length: START_LENGTH }, (_, k): [number, number] => [hx - DX[p.heading] * k, hy - DY[p.heading] * k]);
      p.turn = 0;
      p.grow = 0;
    });
    this.topUpPickups();
    this.clock = FIRST_STEP_S;
  }

  /** Each press of left or right is one turn at the next step. */
  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p?.alive && (dx === 1 || dx === -1)) p.turn = dx;
  }

  action(): void {
    // Turning is all there is to do.
  }

  snapshot(): SnakeSnapshot {
    return {
      id: 'snake',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      grid: SNAKE_GRID,
      step: this.steps,
      pickups: this.pickups.map((q) => ({ ...q })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.cells.length : p.outAtMeters,
        heading: p.heading,
        cells: p.alive ? p.cells.map(([x, y]) => cellKey(x, y)) : [],
      })),
    };
  }

  protected advance(dt: number): void {
    this.clock -= dt;
    while (this.clock <= 0 && this.phase === 'playing') {
      this.moveAll();
      this.clock += this.stepSeconds();
    }
  }

  private stepSeconds(): number {
    return Math.max(STEP_MIN_S, STEP_START_S - STEP_GAIN_S * Math.max(0, this.meters - START_LENGTH));
  }

  /** Moves every snake one cell. Snakes that run into a wall or any snake are out; two heads in one cell are both out. */
  private moveAll(): void {
    this.steps++;
    const racers = [...this.players.values()].filter((p) => p.alive);
    const next = new Map<string, [number, number]>();
    for (const p of racers) {
      if (p.turn !== 0) p.heading = (p.heading + (p.turn === 1 ? 1 : 3)) % 4;
      p.turn = 0;
      const [hx, hy] = p.cells[0];
      next.set(p.id, [hx + DX[p.heading], hy + DY[p.heading]]);
    }
    // Cells that stay blocked this step: every body cell, except tails that move off (a snake that is not growing).
    const blocked = new Set<number>();
    for (const p of racers) {
      const keep = p.grow > 0 ? p.cells.length : p.cells.length - 1;
      for (let i = 0; i < keep; i++) blocked.add(cellKey(p.cells[i][0], p.cells[i][1]));
    }
    const heads = new Map<number, number>();
    for (const [x, y] of next.values()) heads.set(cellKey(x, y), (heads.get(cellKey(x, y)) ?? 0) + 1);
    const dead: Snake[] = [];
    for (const p of racers) {
      const [x, y] = next.get(p.id)!;
      const out = x < 0 || y < 0 || x >= SNAKE_GRID || y >= SNAKE_GRID || blocked.has(cellKey(x, y)) || (heads.get(cellKey(x, y)) ?? 0) > 1;
      if (out) dead.push(p);
    }
    for (const p of racers) {
      if (dead.includes(p)) continue;
      const [x, y] = next.get(p.id)!;
      p.cells.unshift([x, y]);
      if (p.grow > 0) p.grow--;
      else p.cells.pop();
      const eaten = this.pickups.findIndex((q) => q.x === x && q.y === y);
      if (eaten >= 0) {
        this.pickups.splice(eaten, 1);
        p.grow++;
      }
    }
    for (const p of dead) {
      this.knockOut(p);
      p.outAtMeters = p.cells.length;
    }
    this.topUpPickups();
  }

  /** One pickup for each snake still going, in a cell nothing is on. */
  private topUpPickups(): void {
    const alive = [...this.players.values()].filter((p) => p.alive).length;
    const taken = new Set<number>();
    for (const p of this.players.values()) if (p.alive) for (const [x, y] of p.cells) taken.add(cellKey(x, y));
    for (const q of this.pickups) taken.add(cellKey(q.x, q.y));
    while (this.pickups.length < Math.max(1, alive) && taken.size < SNAKE_GRID * SNAKE_GRID) {
      // Always take the random numbers, so a crowded board does not change what comes next.
      const x = Math.floor(this.rng() * SNAKE_GRID);
      const y = Math.floor(this.rng() * SNAKE_GRID);
      if (taken.has(cellKey(x, y))) continue;
      taken.add(cellKey(x, y));
      this.pickups.push({ x, y, n: ++this.spawned });
    }
  }

  /** The score for the high score list is how long the snake got. */
  protected override runScore(p: Snake): number {
    return p.alive ? p.cells.length : p.outAtMeters;
  }
}

/** A bot that steers away from walls and bodies and toward the nearest pickup. It only looks one cell ahead
 * and now and then turns the wrong way, so it is beatable. */
export function snakeBrain(id: string, rng: () => number): BotBrain {
  let lastStep = -1;
  return (snap) => {
    if (snap.id !== 'snake' || snap.phase !== 'playing') return { dx: 0 };
    // Decide once per step; between steps release the key, so the next turn is a fresh press.
    if (snap.step === lastStep) return { dx: 0 };
    const me = snap.players.find((p) => p.id === id);
    if (!me?.alive || me.cells.length === 0) return { dx: 0 };
    lastStep = snap.step;
    const G = snap.grid;
    const occupied = new Set<number>();
    for (const p of snap.players) for (const c of p.cells) occupied.add(c);
    const head = me.cells[0];
    const hx = head % G;
    const hy = Math.floor(head / G);
    const target = snap.pickups.reduce<{ x: number; y: number } | null>((best, q) => (!best || Math.abs(q.x - hx) + Math.abs(q.y - hy) < Math.abs(best.x - hx) + Math.abs(best.y - hy) ? q : best), null);
    const options = [0, -1, 1].map((turn) => {
      const heading = (me.heading + (turn === 1 ? 1 : turn === -1 ? 3 : 0)) % 4;
      const x = hx + DX[heading];
      const y = hy + DY[heading];
      const safe = x >= 0 && y >= 0 && x < G && y < G && !occupied.has(y * G + x);
      const close = target ? Math.abs(target.x - x) + Math.abs(target.y - y) : 0;
      return { turn, safe, close };
    });
    const safe = options.filter((o) => o.safe);
    if (safe.length === 0) return { dx: 0 };
    const choice = rng() < 0.04 ? safe[Math.floor(rng() * safe.length)] : safe.reduce((a, b) => (b.close < a.close ? b : a));
    return { dx: choice.turn };
  };
}
