import {
  BATTLESHIPS_SIZE,
  SQUARE_HIT,
  SQUARE_MISS,
  SQUARE_SUNK,
  SQUARE_UNKNOWN,
  type BattleshipsSnapshot,
} from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
/** A round ends when the fleet is sunk, or at this time if it is not. */
const ROUND_LIMIT_S = 90;
/** After a shot, a person must wait this long before the next, so quick tappers do not take over. */
const SHOT_COOLDOWN_S = 0.8;
/** The shot that sinks a ship scores this much more than an ordinary hit. */
const SINK_BONUS = 1;
/** The share of the board the fleet covers: this many players or fewer get the most, and it falls to
 * the least at MAX_PLAYERS. So a small room gets a fuller board and a big room more open water, and the
 * board is about as crowded for the people on it whatever the size of the room. */
const SHARE_MOST = 0.3;
const SHARE_LEAST = 0.1;
const MAX_PLAYERS = 12;
/** A ship is 1 to 4 squares long. */
const SHORTEST_SHIP = 1;
const LONGEST_SHIP = 4;
const PLACEMENT_ATTEMPTS = 300;

/** How many squares of the board are ship, for this many players: about 30% for one or two, down to about
 * 10% for twelve. */
export function fleetSquares(players: number): number {
  const n = Math.min(MAX_PLAYERS, Math.max(1, players));
  return Math.round(CELLS * (SHARE_MOST - ((n - 1) * (SHARE_MOST - SHARE_LEAST)) / (MAX_PLAYERS - 1)));
}

/** The ships to hide for this many players, longest first: ships of a random length from 1 to 4, one after
 * another, until the squares add up (the last one is cut short to fit exactly). So the same number of
 * squares can be one 4 and a 1, or 2, 2 and 1: a different fleet every round, from the round's seed. */
export function fleetFor(players: number, rng: () => number): number[] {
  let remaining = fleetSquares(players);
  const fleet: number[] = [];
  while (remaining > 0) {
    const len = Math.min(remaining, SHORTEST_SHIP + Math.floor(rng() * (LONGEST_SHIP - SHORTEST_SHIP + 1)));
    fleet.push(len);
    remaining -= len;
  }
  return fleet.sort((a, b) => b - a);
}

/** Hides the ships on the board, a list of squares for each. Ships never overlap, and (if it can) never
 * touch, not even at the corners. Straight lines only. From the seed's generator, so it is repeatable. */
export function placeFleet(rng: () => number, lengths: number[]): number[][] {
  for (const apart of [true, false]) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const taken = new Set<number>();
      const near = new Set<number>();
      const ships: number[][] = [];
      let ok = true;
      for (const len of lengths) {
        const cells = placeOne(rng, len, apart ? near : taken, taken);
        if (!cells) {
          ok = false;
          break;
        }
        ships.push(cells);
        for (const c of cells) {
          taken.add(c);
          const x = c % SIZE;
          const y = Math.floor(c / SIZE);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) near.add((y + dy) * SIZE + x + dx);
        }
      }
      if (ok) return ships;
    }
  }
  return [];
}

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

/** One ship of this length somewhere not in `blocked` (and not in `taken`), or null after some tries. */
function placeOne(rng: () => number, len: number, blocked: Set<number>, taken: Set<number>): number[] | null {
  for (let i = 0; i < 200; i++) {
    const horizontal = rng() < 0.5;
    const x = Math.floor(rng() * (horizontal ? SIZE - len + 1 : SIZE));
    const y = Math.floor(rng() * (horizontal ? SIZE : SIZE - len + 1));
    const cells = Array.from({ length: len }, (_, k) => (horizontal ? y * SIZE + x + k : (y + k) * SIZE + x));
    if (cells.every((c) => !blocked.has(c) && !taken.has(c))) return cells;
  }
  return null;
}

interface Gunner extends RoundPlayer {
  /** Points this round. */
  points: number;
  shots: number;
  hits: number;
  /** Seconds until they can shoot again. */
  cooldown: number;
}

interface Ship {
  cells: number[];
  hits: number;
}

/** One board, shared by everyone: a hidden fleet, and everyone tapping squares to find it. A hit scores,
 * the shot that sinks a ship scores a bit more, and when the fleet is sunk (or the time is up) the most
 * points wins. The fleet is sized from how many are playing, so a small room gets busier water.
 * Nobody is knocked out. See RoundGame for how rounds start and end. */
export class BattleshipsGame extends RoundGame<Gunner> {
  readonly id = 'battleships' as const;
  /** The fewest people it makes sense for: with fewer, the lobby adds bots (see bots.ts). */
  readonly minPlayers = 2;
  private ships: Ship[] = [];
  /** Which ship each ship square belongs to. */
  private shipAt = new Map<number, number>();
  private cells: number[] = new Array(CELLS).fill(SQUARE_UNKNOWN);
  /** Who shot each square (a player id), or null. */
  private shooter: (string | null)[] = new Array(CELLS).fill(null);

  /** The score shown for the round: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.points > best) best = p.points;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Gunner {
    return { id, points: 0, shots: 0, hits: 0, cooldown: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Gunner): void {
    p.points = 0;
    p.shots = 0;
    p.hits = 0;
    p.cooldown = 0;
  }

  protected resetCourse(): void {
    this.ships = [];
    this.shipAt = new Map();
    this.cells = new Array(CELLS).fill(SQUARE_UNKNOWN);
    this.shooter = new Array(CELLS).fill(null);
  }

  /** The fleet is hidden when the round starts, sized for the people in it. */
  protected beginCourse(): void {
    this.resetCourse();
    this.ships = placeFleet(this.rng, fleetFor(this.startedWith, this.rng)).map((cells) => ({ cells, hits: 0 }));
    this.ships.forEach((ship, i) => ship.cells.forEach((c) => this.shipAt.set(c, i)));
  }

  input(): void {
    // Tapping squares is all there is to do.
  }

  action(): void {
    // Tapping squares is all there is to do.
  }

  /** A tap on square `target`: a shot, if the round is on, they are in it, they are ready, and nobody has
   * shot that square. A tap that is not a shot does nothing and costs nothing. */
  tap(userId: string, target: number): void {
    if (this.phase !== 'playing' || !Number.isInteger(target) || target < 0 || target >= CELLS) return;
    const p = this.players.get(userId);
    if (!p?.alive || p.cooldown > 0 || this.cells[target] !== SQUARE_UNKNOWN) return;
    p.cooldown = SHOT_COOLDOWN_S;
    p.shots++;
    this.shooter[target] = userId;
    const index = this.shipAt.get(target);
    if (index === undefined) {
      this.cells[target] = SQUARE_MISS;
      return;
    }
    const ship = this.ships[index];
    ship.hits++;
    p.hits++;
    p.points++;
    this.cells[target] = SQUARE_HIT;
    if (ship.hits === ship.cells.length) {
      p.points += SINK_BONUS;
      for (const c of ship.cells) this.cells[c] = SQUARE_SUNK;
      if (this.ships.every((s) => s.hits === s.cells.length)) this.finishRound();
    }
  }

  snapshot(): BattleshipsSnapshot {
    const list = [...this.players.values()];
    const playing = this.phase === 'playing';
    return {
      id: 'battleships',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: playing ? Math.max(0, Math.round(ROUND_LIMIT_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      // Only what has been shot: a square that has not is always UNKNOWN, ship or water.
      cells: [...this.cells],
      by: this.shooter.map((id) => (id === null ? -1 : list.findIndex((p) => p.id === id))),
      fleet: this.ships.map((s) => ({ len: s.cells.length, sunk: s.hits === s.cells.length })),
      players: list.map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.points : 0,
        shots: p.shots,
        hits: p.hits,
        cooldownMs: Math.max(0, Math.round(p.cooldown * 1000)),
      })),
    };
  }

  protected advance(dt: number): void {
    for (const p of this.players.values()) if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
    if (this.roundMs / 1000 >= ROUND_LIMIT_S) this.finishRound();
  }

  /** The fleet is sunk or the time is up: the most points wins. A tie for the most, or nobody scoring, has
   * no winner. */
  private finishRound(): void {
    const playing = [...this.players.values()].filter((p) => p.alive);
    for (const p of playing) p.outAtMeters = p.points;
    const best = Math.max(0, ...playing.map((p) => p.points));
    const leaders = playing.filter((p) => p.points === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }
}

/** How a bot plays: it waits a moment between shots, goes after the squares beside a hit that has not
 * sunk its ship, and otherwise picks a square at random (leaning towards every other square, as a good
 * player does). Now and then it ignores a lead and shoots at random, so it can be out-played. */
export function battleshipsBrain(id: string, rng: () => number): BotBrain {
  let wait = 1 + rng() * 1.5;
  return (snap, dtMs) => {
    if (snap.id !== 'battleships' || snap.phase !== 'playing') return {};
    if (!snap.players.find((p) => p.id === id)?.alive) return {};
    wait -= dtMs / 1000;
    if (wait > 0) return {};
    wait = 1.1 + rng() * 1.2;

    const cells = snap.cells;
    const neighbours = (i: number) => {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      return [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, y > 0 ? i - SIZE : -1, y < SIZE - 1 ? i + SIZE : -1].filter((j) => j >= 0);
    };
    const leads: number[] = [];
    cells.forEach((c, i) => {
      if (c === SQUARE_HIT) for (const j of neighbours(i)) if (cells[j] === SQUARE_UNKNOWN && !leads.includes(j)) leads.push(j);
    });
    if (leads.length > 0 && rng() < 0.85) return { taps: [leads[Math.floor(rng() * leads.length)]] };

    const open = cells.map((c, i) => (c === SQUARE_UNKNOWN ? i : -1)).filter((i) => i >= 0);
    if (open.length === 0) return {};
    const parity = open.filter((i) => ((i % SIZE) + Math.floor(i / SIZE)) % 2 === 0);
    const from = parity.length > 0 && rng() < 0.8 ? parity : open;
    return { taps: [from[Math.floor(rng() * from.length)]] };
  };
}
