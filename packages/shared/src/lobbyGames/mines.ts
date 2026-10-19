import { MINES_COLS, MINES_COUNT, MINES_ROWS, MINES_TARGETS, type MinesSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** What a cell shows: hidden, or the number of mines next to it (0 to 8), or a mine that someone hit. */
const HIDDEN = -1;
const EXPLODED = 9;

interface Sweeper extends RoundPlayer {
  score: number;
  /** They hit a mine (so they are out), as opposed to never having been in the run. */
  fell: boolean;
}

/** One shared minefield. Everyone taps squares on it: a safe square scores a point for whoever opened it (and an empty
 * one opens its neighbours too, all for that person); a mine knocks you out. The first square opened is always safe. The
 * run ends when every safe square is open or everyone is out; most points wins. See RoundGame for how runs start and end. */
export class MinesGame extends RoundGame<Sweeper> {
  readonly id = 'mines' as const;
  /** Where the mines are (hidden from clients), once the first square has been opened. */
  private mines = new Set<number>();
  private cells: number[] = Array(MINES_TARGETS).fill(HIDDEN);
  /** Who opened each square, as an id (null while hidden). */
  private openedBy: (string | null)[] = Array(MINES_TARGETS).fill(null);
  private laid = false;
  private safeOpen = 0;

  /** The score shown for the run: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if ((p.alive || p.fell) && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Sweeper {
    return { id, score: 0, fell: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Sweeper): void {
    p.score = 0;
    p.fell = false;
  }

  protected resetCourse(): void {
    this.mines = new Set();
    this.cells = Array(MINES_TARGETS).fill(HIDDEN);
    this.openedBy = Array(MINES_TARGETS).fill(null);
    this.laid = false;
    this.safeOpen = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  input(): void {
    // The board is the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping squares is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive) return;
    if (!Number.isInteger(target) || target < 0 || target >= MINES_TARGETS) return;
    if (this.cells[target] !== HIDDEN) return;
    if (!this.laid) this.layMines(target);
    if (this.mines.has(target)) {
      this.cells[target] = EXPLODED;
      this.openedBy[target] = p.id;
      p.fell = true;
      this.knockOut(p);
      p.outAtMeters = p.score;
      return;
    }
    p.score += this.open(target, p.id);
    if (this.safeOpen >= MINES_TARGETS - MINES_COUNT) this.finishRun();
  }

  /** Puts the mines down, none on the first square or next to it, so the first tap opens up some space. */
  private layMines(first: number): void {
    const safe = new Set([first, ...this.neighbours(first)]);
    const free = Array.from({ length: MINES_TARGETS }, (_, i) => i).filter((i) => !safe.has(i));
    for (let k = 0; k < MINES_COUNT; k++) {
      const pick = Math.floor(this.rng() * free.length);
      this.mines.add(free[pick]);
      free.splice(pick, 1);
    }
    this.laid = true;
  }

  private neighbours(i: number): number[] {
    const x = i % MINES_COLS;
    const y = Math.floor(i / MINES_COLS);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MINES_COLS && ny < MINES_ROWS) out.push(ny * MINES_COLS + nx);
      }
    }
    return out;
  }

  /** Opens a safe square and, if no mine is next to it, everything joined to it. Returns how many squares were opened. */
  private open(start: number, by: string): number {
    let opened = 0;
    const queue = [start];
    while (queue.length > 0) {
      const i = queue.pop()!;
      if (this.cells[i] !== HIDDEN || this.mines.has(i)) continue;
      const near = this.neighbours(i).filter((n) => this.mines.has(n)).length;
      this.cells[i] = near;
      this.openedBy[i] = by;
      this.safeOpen++;
      opened++;
      if (near === 0) queue.push(...this.neighbours(i));
    }
    return opened;
  }

  snapshot(): MinesSnapshot {
    const ids = [...this.players.keys()];
    return {
      id: 'mines',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      cells: [...this.cells],
      by: this.openedBy.map((id) => (id ? ids.indexOf(id) : -1)),
      safeLeft: MINES_TARGETS - MINES_COUNT - this.safeOpen,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive || p.fell ? p.score : 0, fell: p.fell })),
    };
  }

  protected advance(): void {
    // Nothing moves by itself: the board only changes when someone taps.
  }

  /** The run ends when every safe square is open, or nobody is left in. */
  protected override checkRunEnd(): void {
    if (this.phase !== 'playing') return;
    if (![...this.players.values()].some((p) => p.alive)) this.finishRun();
  }

  /** Most points wins; a tie goes to the one still in, else it is a draw. A solo run has no winner. */
  private finishRun(): void {
    if (this.phase !== 'playing') return;
    const racers = [...this.players.values()].filter((p) => p.alive || p.fell);
    for (const p of racers) p.outAtMeters = p.score;
    const best = Math.max(0, ...racers.map((p) => p.score));
    const leaders = racers.filter((p) => p.score === best);
    const standing = leaders.filter((p) => p.alive);
    const winner = best > 0 && this.startedWith > 1 ? (leaders.length === 1 ? leaders[0] : standing.length === 1 ? standing[0] : null) : null;
    this.endRun(winner);
  }
}
