import { BATTLESHIPS_SIZE, SQUARE_HIT, SQUARE_MISS, SQUARE_SUNK, SQUARE_UNKNOWN, type BattleshipsSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
/** A round ends when one fleet is left afloat, or at this time if more are. */
/** After a shot, a person must wait this long before the next, so quick tappers do not take over. */
const SHOT_COOLDOWN_S = 0.8;
/** The shot that sinks a ship scores this much more than an ordinary hit. */
const SINK_BONUS = 1;
/** About this much of the one board is ship, all players' together, however many are playing: the board
 * is shared out between them, so with more players each has fewer ships and there is always free space. */
const SHARE_OF_BOARD = 0.3;
/** Nobody has fewer ship squares than this, however many are playing. */
const LEAST_SQUARES = 2;
/** A ship is 1 to 4 squares long. */
const SHORTEST_SHIP = 1;
const LONGEST_SHIP = 4;
const PLACEMENT_ATTEMPTS = 300;

/** How many squares of ship each player gets, for this many players: the board's share of ship (about 30%)
 * divided between them. One or two players get about 10 to 19 each; twelve get 2 each. Fewer players means
 * more ships each (and bigger ones), and more players means fewer each: the free space stays about the same. */
export function fleetSquares(players: number): number {
  const n = Math.max(1, players);
  return Math.max(LEAST_SQUARES, Math.round((CELLS * SHARE_OF_BOARD) / n));
}

/** One player's ships for this many players, longest first: ships of a random length from 1 to 4, one after
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

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

/** One ship of this length somewhere not in `blocked`, or null after some tries. */
function placeOne(rng: () => number, len: number, blocked: Set<number>): number[] | null {
  for (let i = 0; i < 200; i++) {
    const horizontal = rng() < 0.5;
    const x = Math.floor(rng() * (horizontal ? SIZE - len + 1 : SIZE));
    const y = Math.floor(rng() * (horizontal ? SIZE : SIZE - len + 1));
    const cells = Array.from({ length: len }, (_, k) => (horizontal ? y * SIZE + x + k : (y + k) * SIZE + x));
    if (cells.every((c) => !blocked.has(c))) return cells;
  }
  return null;
}

/** The first place a ship of this length fits that is not in `taken`, scanning the board, or null. */
function firstFit(len: number, taken: Set<number>): number[] | null {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (const horizontal of [true, false]) {
        if (horizontal ? x + len > SIZE : y + len > SIZE) continue;
        const cells = Array.from({ length: len }, (_, k) => (horizontal ? y * SIZE + x + k : (y + k) * SIZE + x));
        if (cells.every((c) => !taken.has(c))) return cells;
      }
    }
  }
  return null;
}

/** Hides everyone's ships on the one board: a list of ships (each a list of squares) for each player's list
 * of lengths. No two ships overlap, whoever's they are, and if it can no two players' ships touch, not even at
 * the corners (one player's own ships may sit side by side, which leaves more room on the board).
 * Straight lines only. From the seed's generator, so it is repeatable. */
export function placeFleets(rng: () => number, fleets: number[][]): number[][][] {
  const order = fleets.flatMap((lengths, owner) => lengths.map((len) => ({ owner, len }))).sort((a, b) => b.len - a.len);
  for (const apart of [true, false]) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const taken = new Set<number>();
      const near: Set<number>[] = fleets.map(() => new Set());
      const placed: number[][][] = fleets.map(() => []);
      let ok = true;
      for (const { owner, len } of order) {
        const blocked = apart ? new Set([...taken, ...near.flatMap((n, o) => (o === owner ? [] : [...n]))]) : taken;
        const cells = placeOne(rng, len, blocked);
        if (!cells) {
          ok = false;
          break;
        }
        placed[owner].push(cells);
        for (const c of cells) {
          taken.add(c);
          const x = c % SIZE;
          const y = Math.floor(c / SIZE);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) near[owner].add((y + dy) * SIZE + x + dx);
        }
      }
      if (ok) return placed;
    }
  }
  // Very crowded and unlucky: put each ship in the first place it fits.
  const taken = new Set<number>();
  const placed: number[][][] = fleets.map(() => []);
  for (const { owner, len } of order) {
    const cells = firstFit(len, taken);
    if (!cells) continue;
    placed[owner].push(cells);
    for (const c of cells) taken.add(c);
  }
  return placed;
}

interface Ship {
  cells: number[];
  hits: number;
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
  /** Their hidden ships on the board. */
  ships: Ship[];
}

const afloat = (p: Gunner) => p.ships.reduce((n, s) => n + s.cells.length - s.hits, 0);

/** One board, shared by everyone. Each player hides their own ships on it (fewer each the more people are
 * playing, so there is room), and everyone fires at the squares: a hit damages whoever's ship it is, a miss is
 * a miss for all to see. You can see your own ships and nobody else's. A hit scores, the shot that sinks a
 * ship scores a bit more, and a player whose whole fleet is sunk is out. Last fleet afloat wins; if more than
 * one is still afloat when the time is up, the one with the most afloat wins. See RoundGame for how rounds
 * start and end. */
export class BattleshipsGame extends RoundGame<Gunner> {
  readonly id = 'battleships' as const;
  /** The fewest people it makes sense for: with fewer, the lobby adds bots (see bots.ts). */
  readonly minPlayers = 2;
  /** Each square of the one board: what has been shot there. */
  private cells: number[] = new Array(CELLS).fill(SQUARE_UNKNOWN);
  /** Who shot each square (a player id), or null. */
  private shooter: (string | null)[] = new Array(CELLS).fill(null);
  /** Whose ship is on each square (a player id), and which of their ships: never sent to anyone else. */
  private shipAt = new Map<number, { owner: string; index: number }>();
  /** Whose sunk ship each square was, for squares of a sunk ship. */
  private sunkOwner: (string | null)[] = new Array(CELLS).fill(null);

  /** The most points anyone has had this round. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRound && p.points > best) best = p.points;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Gunner {
    return { id, points: 0, shots: 0, hits: 0, cooldown: 0, inRound: false, ships: [], alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Gunner): void {
    p.points = 0;
    p.shots = 0;
    p.hits = 0;
    p.cooldown = 0;
    p.inRound = false;
    p.ships = [];
  }

  protected resetCourse(): void {
    this.cells = new Array(CELLS).fill(SQUARE_UNKNOWN);
    this.shooter = new Array(CELLS).fill(null);
    this.sunkOwner = new Array(CELLS).fill(null);
    this.shipAt = new Map();
  }

  /** Everyone in the round gets their own ships, hidden on the one board: how many squares each depends on how
   * many are playing. */
  protected beginCourse(): void {
    this.resetCourse();
    const playing = [...this.players.values()].filter((p) => p.alive);
    const placed = placeFleets(
      this.rng,
      playing.map(() => fleetFor(playing.length, this.rng)),
    );
    playing.forEach((p, owner) => {
      p.inRound = true;
      p.ships = placed[owner].map((cells): Ship => ({ cells, hits: 0 }));
      p.ships.forEach((ship, index) => ship.cells.forEach((c) => this.shipAt.set(c, { owner: p.id, index })));
    });
  }

  input(): void {
    // Tapping squares is all there is to do.
  }

  action(): void {
    // Tapping squares is all there is to do.
  }

  /** A tap on square `target`: a shot, if the round is on, they are in it and ready, nobody has shot that
   * square, and it is not one of their own ships. A tap that is not a shot does nothing and costs nothing. */
  tap(userId: string, target: number): void {
    if (this.phase !== 'playing' || !Number.isInteger(target) || target < 0 || target >= CELLS) return;
    const p = this.players.get(userId);
    if (!p?.alive || !p.inRound || p.cooldown > 0 || this.cells[target] !== SQUARE_UNKNOWN) return;
    const at = this.shipAt.get(target);
    if (at?.owner === userId) return;
    p.cooldown = SHOT_COOLDOWN_S;
    p.shots++;
    this.shooter[target] = userId;
    const owner = at ? this.players.get(at.owner) : undefined;
    if (!at || !owner) {
      this.cells[target] = SQUARE_MISS;
      return;
    }
    const ship = owner.ships[at.index];
    ship.hits++;
    p.hits++;
    p.points++;
    this.cells[target] = SQUARE_HIT;
    if (ship.hits === ship.cells.length) {
      p.points += SINK_BONUS;
      for (const c of ship.cells) {
        this.cells[c] = SQUARE_SUNK;
        this.sunkOwner[c] = owner.id;
      }
      if (afloat(owner) === 0) this.out(owner);
    }
  }

  /** Knocks a player out for a sunk fleet, keeping their own points as how far they got. */
  private out(p: Gunner): void {
    this.knockOut(p);
    p.outAtMeters = p.points;
  }

  /** The game as `viewer` sees it: the one board with every shot on it, how many squares of each fleet are
   * afloat, and (only for themselves) where their own ships are. */
  snapshot(viewer?: string): BattleshipsSnapshot {
    const list = [...this.players.values()];
    const ids = list.map((p) => p.id);
    const me = viewer ? this.players.get(viewer) : undefined;
    const playing = this.phase === 'playing';
    const index = (id: string | null) => (id === null ? -1 : ids.indexOf(id));
    return {
      id: 'battleships',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
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
        afloat: afloat(p),
        fleet: p.ships.map((s) => ({ len: s.cells.length, sunk: s.hits === s.cells.length })),
      })),
      // Only what has been shot: a square that has not is always UNKNOWN, ship or water.
      cells: [...this.cells],
      by: this.shooter.map(index),
      owner: this.sunkOwner.map(index),
      mine: me?.inRound ? me.ships.map((s) => [...s.cells]) : null,
    };
  }

  protected advance(dt: number): void {
    for (const p of this.players.values()) if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
  }

  protected override limitReached(): void {
    this.timeUp();
  }

  /** The time is up with more than one fleet afloat: the one with the most afloat wins. A tie has no winner. */
  private timeUp(): void {
    const left = [...this.players.values()].filter((p) => p.alive && p.inRound);
    const most = Math.max(0, ...left.map(afloat));
    const leaders = left.filter((p) => afloat(p) === most);
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
 * player does). It knows where its own ships are, so it never fires at them. Now and then it ignores a
 * lead and shoots at random, so it can be out-played. */
export function battleshipsBrain(id: string, rng: () => number): BotBrain {
  let wait = 1 + rng() * 1.5;
  return (snap, dtMs) => {
    if (snap.id !== 'battleships' || snap.phase !== 'playing') return {};
    if (!snap.players.find((p) => p.id === id)?.alive) return {};
    wait -= dtMs / 1000;
    if (wait > 0) return {};
    wait = 1.1 + rng() * 1.2;

    const own = new Set(snap.mine?.flat() ?? []);
    const open = (i: number) => snap.cells[i] === SQUARE_UNKNOWN && !own.has(i);
    const neighbours = (i: number) => {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      return [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, y > 0 ? i - SIZE : -1, y < SIZE - 1 ? i + SIZE : -1].filter((j) => j >= 0);
    };
    const leads: number[] = [];
    snap.cells.forEach((c, i) => {
      if (c === SQUARE_HIT && !own.has(i)) for (const j of neighbours(i)) if (open(j) && !leads.includes(j)) leads.push(j);
    });
    if (leads.length > 0 && rng() < 0.85) return { taps: [leads[Math.floor(rng() * leads.length)]] };

    const all = snap.cells.map((_, i) => i).filter(open);
    if (all.length === 0) return {};
    const parity = all.filter((i) => ((i % SIZE) + Math.floor(i / SIZE)) % 2 === 0);
    const from = parity.length > 0 && rng() < 0.8 ? parity : all;
    return { taps: [from[Math.floor(rng() * from.length)]] };
  };
}
