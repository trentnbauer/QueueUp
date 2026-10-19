import { FROGGER_CAR_MARGIN, FROGGER_FROG_W, FROGGER_ROWS_VISIBLE, FROGGER_ROW_H, clampDirection, type FroggerRow, type FroggerSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** How fast a hopper slides left and right, in arenas a second. */
const MOVE_SPEED = 0.5;
/** The wait between hops, so mashing the button cannot cross the whole road before a car arrives. */
const HOP_COOLDOWN_S = 0.12;
/** Everyone starts on this row; it and the rows under it are grass, and the bottom edge starts below them, so there is a moment to get going. */
const START_ROW = 2;
const GRASS_ROWS_AT_START = START_ROW + 1;
/** The bottom edge of the screen rises (arenas a second) and sweeps away anyone it passes. It starts slow and is quick by about 25 seconds. */
const EDGE_START_SPEED = 0.08;
const EDGE_GAIN = 0.009; // per second of the run
const EDGE_MAX_SPEED = 0.26;
/** How far up the road the rows get harder: traffic is quicker and thicker the higher the row, up to this row. */
const HARD_AT_ROW = 40;
const LOOP = 1 + 2 * FROGGER_CAR_MARGIN;
/** Car speed (arenas a second): a base for the row plus up to a spread, each from the easy value to the hard one. */
const SPEED_BASE = [0.16, 0.34] as const;
const SPEED_SPREAD = [0.14, 0.34] as const;
/** The clear space between cars on a row (edge to edge) is at least this much more than a hopper, and the loop holds as many cars as fit. */
const GAP_BASE = [0.5, 0.2] as const;
const GAP_SPREAD = 0.16;
const CAR_MIN_W = 0.08;
const CAR_EXTRA_W = 0.1;
/** A road is a band of this many rows (2 to 2 + this), longer higher up. Between bands is a grass row to rest on, more and more often left out. */
const BAND_EXTRA = [2, 3] as const;
const REST_SKIP_MAX = 0.6;
const SPAWN_AHEAD_ROWS = 3;
/** Rows this far below the bottom edge are dropped. */
const KEEP_BELOW = 0.3;
/** The metres a row is worth. */
const ROW_METERS = 2;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;

export interface Lane {
  r: number;
  road: boolean;
  /** -1 or 1, and the speed in arenas a second. */
  dir: number;
  speed: number;
  w: number;
  cars: number;
  spacing: number;
  /** Where the first car is on the loop at time zero. */
  off: number;
}

interface Hopper extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
  row: number;
  /** Seconds until they may hop again. */
  cool: number;
  /** Their place in the starting line, so a run starts from the same spot every time. */
  slot: number;
}

/** Where the middle of car `i` on a lane is at `t` seconds into the run, across the arena (-margin..1+margin). */
export function carX(lane: Lane, i: number, t: number): number {
  const at = (lane.off + i * lane.spacing + lane.dir * lane.speed * t) % LOOP;
  return -FROGGER_CAR_MARGIN + (at < 0 ? at + LOOP : at);
}

/** Cross lane after lane of traffic: slide left and right, and press hop to go up a row. Cars drive across the rows (the same traffic
 * for everyone) and a car that touches you knocks you out, and so does the bottom edge of the screen, which keeps rising and
 * sweeps away anyone it passes. Last one hopping wins; alone it is a high score (rows crossed). Players never touch each other,
 * so each device works out its own hopper (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class FroggerGame extends RoundGame<Hopper> {
  readonly id = 'frogger' as const;
  private speed = EDGE_START_SPEED;
  private edge = 0;
  private lanes: Lane[] = [];
  /** Road rows still to come in the band that is on. */
  private bandLeft = 0;
  private lastRoad = false;
  /** What the run reports as its score, set when it ends (the winner's own rows rather than the furthest anyone got). */
  private finalScore: number | null = null;

  /** The score shown for the run: the furthest anyone has got, in metres. */
  protected get meters(): number {
    if (this.finalScore !== null) return this.finalScore;
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.row - START_ROW);
    return best * ROW_METERS;
  }

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Hopper, f: Record<string, number>): void {
    p.x = Math.min(1, Math.max(0, RoundGame.num(f.x, p.x)));
    // Never backwards, and never more than a few rows past what the server has: a hopper cannot skip the road.
    p.row = Math.max(p.row, Math.min(Math.floor(RoundGame.num(f.row, p.row)), p.row + 3));
  }

  protected writeReport(p: Hopper): Record<string, number> {
    return { x: Math.round(p.x * 1000) / 1000, row: p.row };
  }

  protected createPlayer(id: string, alive: boolean): Hopper {
    const slot = this.players.size;
    return { id, x: this.slotX(slot), dir: 0, row: START_ROW, cool: 0, slot, alive, wins: 0, outAtMeters: 0 };
  }

  /** The starting line: the middle first, then out to each side, up to five across. */
  private slotX(slot: number): number {
    return [0.5, 0.3, 0.7, 0.15, 0.85][slot % 5];
  }

  protected resetPlayer(p: Hopper): void {
    p.x = this.slotX(p.slot);
    p.dir = 0;
    p.row = START_ROW;
    p.cool = 0;
  }

  protected resetCourse(): void {
    this.speed = EDGE_START_SPEED;
    this.edge = 0;
    this.lanes = [];
    this.bandLeft = 0;
    this.lastRoad = false;
    this.finalScore = null;
    this.spawnLanes();
  }

  protected beginCourse(): void {
    // The road was laid when the countdown began.
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(userId: string, name: string): void {
    if (name !== 'hop' || this.phase !== 'playing') return;
    const p = this.players.get(userId);
    // A device that reports its own hopper does the hopping there.
    if (!p?.alive || !this.simulated(p) || p.cool > 0) return;
    // The top row on the screen is as far as anyone can see, so as far as anyone can go until the screen has moved up.
    if (p.row + 1 > this.topRow()) return;
    p.row++;
    p.cool = HOP_COOLDOWN_S;
  }

  /** The highest row that is wholly on the screen. */
  private topRow(): number {
    return Math.floor(this.edge / FROGGER_ROW_H + 1e-9) + FROGGER_ROWS_VISIBLE - 1;
  }

  protected override knockOut(p: Hopper): void {
    super.knockOut(p);
    p.outAtMeters = (p.row - START_ROW) * ROW_METERS;
  }

  /** At the time cap whoever is still hopping keeps the rows they have crossed, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = (p.row - START_ROW) * ROW_METERS;
    this.endRun(null);
  }

  protected override endRun(winner: Hopper | null): void {
    if (winner) this.finalScore = (winner.row - START_ROW) * ROW_METERS;
    super.endRun(winner);
  }

  snapshot(): FroggerSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    return {
      id: 'frogger',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      edge: r3(this.edge),
      rows: this.lanes.map((l): FroggerRow => ({ r: l.r, kind: l.road ? 'road' : 'grass', v: r3(l.dir * l.speed), w: r3(l.w), cars: l.road ? Array.from({ length: l.cars }, (_, i) => r3(carX(l, i, t))) : [] })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        dir: p.alive ? p.dir : 0,
        row: p.row,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? Math.max(0, p.row - START_ROW) * ROW_METERS : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.speed = Math.min(EDGE_MAX_SPEED, EDGE_START_SPEED + EDGE_GAIN * seconds);
    this.edge += this.speed * dt;
    this.spawnLanes();

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      // The edge sweeps up anyone wholly below it, wherever their own device says they are.
      if ((p.row + 1) * FROGGER_ROW_H <= this.edge) {
        this.knockOut(p);
        continue;
      }
      if (!this.simulated(p)) continue;
      p.cool = Math.max(0, p.cool - dt);
      p.x = Math.min(1, Math.max(0, p.x + p.dir * MOVE_SPEED * dt));
      if (this.hit(p, seconds)) this.knockOut(p);
    }
    this.lanes = this.lanes.filter((l) => (l.r + 1) * FROGGER_ROW_H > this.edge - KEEP_BELOW);
  }

  private hit(p: Hopper, t: number): boolean {
    const lane = this.lanes.find((l) => l.r === p.row);
    if (!lane?.road) return false;
    for (let i = 0; i < lane.cars; i++) {
      if (Math.abs(carX(lane, i, t) - p.x) < (lane.w + FROGGER_FROG_W) / 2) return true;
    }
    return false;
  }

  /** Lays rows until there are a few above the top of the screen. */
  private spawnLanes(): void {
    const want = this.topRow() + SPAWN_AHEAD_ROWS;
    let r = this.lanes.length > 0 ? this.lanes[this.lanes.length - 1].r + 1 : 0;
    for (; r <= want; r++) this.lanes.push(this.makeLane(r));
  }

  private makeLane(r: number): Lane {
    const d = Math.min(1, r / HARD_AT_ROW);
    // Always the same seven random numbers, so what a row is does not change what comes after it.
    const [kind, dir, speed, width, gap, off, band] = [this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng()];
    let road: boolean;
    if (r < GRASS_ROWS_AT_START) road = false;
    else if (this.bandLeft > 0) {
      road = true;
      this.bandLeft--;
    } else if (this.lastRoad && kind >= REST_SKIP_MAX * d) road = false;
    else {
      road = true;
      this.bandLeft = 1 + Math.floor(band * (BAND_EXTRA[0] + (BAND_EXTRA[1] - BAND_EXTRA[0]) * d + 1));
    }
    this.lastRoad = road;
    const w = CAR_MIN_W + width * CAR_EXTRA_W;
    const cars = Math.max(1, Math.floor(LOOP / (w + lerp(GAP_BASE, d) + gap * GAP_SPREAD)));
    return { r, road, dir: dir < 0.5 ? -1 : 1, speed: lerp(SPEED_BASE, d) + speed * lerp(SPEED_SPREAD, d), w, cars, spacing: LOOP / cars, off: off * LOOP };
  }
}
