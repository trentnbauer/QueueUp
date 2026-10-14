import {
  BATTLESHIPS_SIZE,
  BATTLESHIPS_TARGET_BASE,
  SQUARE_HIT,
  SQUARE_MISS,
  SQUARE_SUNK,
  SQUARE_UNKNOWN,
  type BattleshipsBoard,
  type BattleshipsSnapshot,
} from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
/** A round ends when one fleet is left afloat, or at this time if more are. */
const ROUND_LIMIT_S = 120;
/** After a shot, a person must wait this long before the next, so quick tappers do not take over. */
const SHOT_COOLDOWN_S = 0.8;
/** The shot that sinks a ship scores this much more than an ordinary hit. */
const SINK_BONUS = 1;
/** The share of each board that is ship: this many players or fewer get the most, and it falls to the
 * least at MAX_PLAYERS. Each board is shot at by every other player, so with more players a smaller fleet
 * keeps the rounds about as long. */
const SHARE_MOST = 0.3;
const SHARE_LEAST = 0.1;
const MAX_PLAYERS = 12;
/** A ship is 1 to 4 squares long. */
const SHORTEST_SHIP = 1;
const LONGEST_SHIP = 4;
const PLACEMENT_ATTEMPTS = 300;

/** How many squares of a board are ship, for this many players: about 30% for one or two, down to about
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

/** Hides the ships on a board, a list of squares for each. Ships never overlap, and (if it can) never
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
  /** Was in the round when it started, so has a fleet and may shoot. */
  inRound: boolean;
  /** Who they are shooting at (a player id). */
  target: string | null;
}

interface Ship {
  cells: number[];
  hits: number;
}

/** One player's board: their hidden ships, and what has been shot at. */
interface Board {
  ships: Ship[];
  /** Which ship each ship square belongs to. */
  shipAt: Map<number, number>;
  cells: number[];
  /** Who shot each square (a player id), or null. */
  shooter: (string | null)[];
}

const afloat = (b: Board) => b.ships.reduce((n, s) => n + s.cells.length - s.hits, 0);

/** Everyone has their own fleet, hidden from the others, on their own board, and everyone fires at the
 * others' boards (one at a time: you pick whose). A hit scores, the shot that sinks a ship scores a bit
 * more, and a player whose whole fleet is sunk is out. Last fleet afloat wins; if more than one is still
 * afloat when the time is up, the one with the most afloat wins. Fleets are sized from how many are
 * playing. See RoundGame for how rounds start and end. */
export class BattleshipsGame extends RoundGame<Gunner> {
  readonly id = 'battleships' as const;
  /** The fewest people it makes sense for: with fewer, the lobby adds bots (see bots.ts). */
  readonly minPlayers = 2;
  private readonly boards = new Map<string, Board>();

  /** The most points anyone has had this round. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRound && p.points > best) best = p.points;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Gunner {
    return { id, points: 0, shots: 0, hits: 0, cooldown: 0, inRound: false, target: null, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Gunner): void {
    p.points = 0;
    p.shots = 0;
    p.hits = 0;
    p.cooldown = 0;
    p.inRound = false;
    p.target = null;
  }

  protected resetCourse(): void {
    this.boards.clear();
  }

  /** Each person who is in the round gets their own fleet, hidden on their own board, sized for how many
   * are playing, and starts by shooting at the next person along. */
  protected beginCourse(): void {
    this.boards.clear();
    const playing = [...this.players.values()].filter((p) => p.alive);
    for (const p of playing) {
      p.inRound = true;
      const ships = placeFleet(this.rng, fleetFor(playing.length, this.rng)).map((cells): Ship => ({ cells, hits: 0 }));
      const shipAt = new Map<number, number>();
      ships.forEach((ship, i) => ship.cells.forEach((c) => shipAt.set(c, i)));
      this.boards.set(p.id, { ships, shipAt, cells: new Array(CELLS).fill(SQUARE_UNKNOWN), shooter: new Array(CELLS).fill(null) });
    }
    for (const p of playing) p.target = this.pickTarget(p);
  }

  input(): void {
    // Tapping is all there is to do.
  }

  action(): void {
    // Tapping is all there is to do.
  }

  /** The other people in the round, in the order they join (the same order the players are listed in). */
  private opponents(id: string): Gunner[] {
    return [...this.players.values()].filter((p) => p.inRound && p.id !== id);
  }

  /** Who `p` shoots at: who they picked if that player is still in, otherwise the next player still in. */
  private pickTarget(p: Gunner): string | null {
    const chosen = p.target ? this.players.get(p.target) : undefined;
    if (chosen?.alive && chosen.inRound && chosen.id !== p.id) return chosen.id;
    const order = [...this.players.values()].filter((q) => q.inRound);
    const from = order.findIndex((q) => q.id === p.id);
    for (let k = 1; k <= order.length; k++) {
      const q = order[(Math.max(0, from) + k) % order.length];
      if (q.alive && q.id !== p.id) return q.id;
    }
    return null;
  }

  /** A tap. A number from BATTLESHIPS_TARGET_BASE picks whose board to shoot at; a lower one is a shot at that
   * square of the board they are shooting at, if the round is on, they are in it and ready, and nobody has
   * shot that square. A tap that is not a shot does nothing and costs nothing. */
  tap(userId: string, target: number): void {
    if (this.phase !== 'playing' || !Number.isInteger(target) || target < 0) return;
    const p = this.players.get(userId);
    if (!p?.alive || !p.inRound) return;
    if (target >= BATTLESHIPS_TARGET_BASE) {
      const chosen = this.opponents(userId)[target - BATTLESHIPS_TARGET_BASE];
      if (chosen?.alive) p.target = chosen.id;
      return;
    }
    if (target >= CELLS || p.cooldown > 0) return;
    const targetId = this.pickTarget(p);
    p.target = targetId;
    const board = targetId ? this.boards.get(targetId) : undefined;
    const owner = targetId ? this.players.get(targetId) : undefined;
    if (!board || !owner || board.cells[target] !== SQUARE_UNKNOWN) return;
    p.cooldown = SHOT_COOLDOWN_S;
    p.shots++;
    board.shooter[target] = userId;
    const index = board.shipAt.get(target);
    if (index === undefined) {
      board.cells[target] = SQUARE_MISS;
      return;
    }
    const ship = board.ships[index];
    ship.hits++;
    p.hits++;
    p.points++;
    board.cells[target] = SQUARE_HIT;
    if (ship.hits === ship.cells.length) {
      p.points += SINK_BONUS;
      for (const c of ship.cells) board.cells[c] = SQUARE_SUNK;
      if (afloat(board) === 0) this.out(owner);
    }
  }

  /** Knocks a player out for a sunk fleet, keeping their own points as how far they got. */
  private out(p: Gunner): void {
    this.knockOut(p);
    p.outAtMeters = p.points;
  }

  /** What `board` shows to anyone: what has been shot at, and the fleet by length. */
  private view(board: Board, ids: string[]): BattleshipsBoard {
    return {
      cells: [...board.cells],
      by: board.shooter.map((id) => (id === null ? -1 : ids.indexOf(id))),
      fleet: board.ships.map((s) => ({ len: s.cells.length, sunk: s.hits === s.cells.length })),
    };
  }

  /** The game as `viewer` sees it: everyone's points and how many of their ships are afloat, the board they
   * are shooting at, and (only for themselves) their own board with their ships on it. */
  snapshot(viewer?: string): BattleshipsSnapshot {
    const list = [...this.players.values()];
    const ids = list.map((p) => p.id);
    const me = viewer ? this.players.get(viewer) : undefined;
    const playing = this.phase === 'playing';
    // Who is shown: who they are shooting at, or for someone watching, the first player still in.
    const targetId = me?.inRound ? this.pickTarget(me) : (list.find((p) => p.inRound && p.alive)?.id ?? null);
    const targetBoard = targetId ? this.boards.get(targetId) : undefined;
    const mine = me?.inRound ? this.boards.get(me.id) : undefined;
    return {
      id: 'battleships',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: playing ? Math.max(0, Math.round(ROUND_LIMIT_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      players: list.map((p) => ({
        id: p.id,
        alive: p.alive && p.inRound,
        inRound: p.inRound,
        wins: p.wins,
        meters: p.points,
        shots: p.shots,
        hits: p.hits,
        cooldownMs: Math.max(0, Math.round(p.cooldown * 1000)),
        afloat: this.boards.has(p.id) ? afloat(this.boards.get(p.id) as Board) : 0,
      })),
      target: targetBoard ? targetId : null,
      targetBoard: targetBoard ? this.view(targetBoard, ids) : null,
      mine: mine ? { ...this.view(mine, ids), ships: mine.ships.map((s) => [...s.cells]) } : null,
    };
  }

  protected advance(dt: number): void {
    for (const p of this.players.values()) if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
    if (this.roundMs / 1000 >= ROUND_LIMIT_S) this.timeUp();
  }

  /** The time is up with more than one fleet afloat: the one with the most afloat wins. A tie has no winner. */
  private timeUp(): void {
    const left = [...this.players.values()].filter((p) => p.alive && p.inRound);
    const most = Math.max(0, ...left.map((p) => afloat(this.boards.get(p.id) as Board)));
    const leaders = left.filter((p) => afloat(this.boards.get(p.id) as Board) === most);
    this.endRun(this.startedWith > 1 && leaders.length === 1 ? leaders[0] : null);
  }

  /** However the round ends, each person's points are how far they got (the most points is "furthest"). */
  protected endRun(winner: Gunner | null): void {
    if (this.phase !== 'playing') return;
    for (const p of this.players.values()) if (p.inRound) p.outAtMeters = p.points;
    super.endRun(winner);
    if (winner) winner.outAtMeters = winner.points;
  }
}

/** How a bot plays: it waits a moment between shots, goes after the squares beside a hit that has not
 * sunk its ship, and otherwise picks a square at random (leaning towards every other square, as a good
 * player does). Now and then it ignores a lead and shoots at random, or turns on someone else, so it can
 * be out-played. */
export function battleshipsBrain(id: string, rng: () => number): BotBrain {
  let wait = 1 + rng() * 1.5;
  return (snap, dtMs) => {
    if (snap.id !== 'battleships' || snap.phase !== 'playing' || !snap.targetBoard) return {};
    if (!snap.players.find((p) => p.id === id)?.alive) return {};
    wait -= dtMs / 1000;
    if (wait > 0) return {};
    wait = 1.1 + rng() * 1.2;

    // Sometimes change who it is shooting at (to another player still in): this shot goes to them.
    const others = snap.players.filter((p) => p.inRound && p.id !== id);
    const live = others.map((p, k) => ({ p, k })).filter(({ p }) => p.alive && p.id !== snap.target);
    if (live.length > 0 && rng() < 0.12) return { taps: [BATTLESHIPS_TARGET_BASE + live[Math.floor(rng() * live.length)].k] };

    const cells = snap.targetBoard.cells;
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
