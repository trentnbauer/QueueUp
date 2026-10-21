import { ODDONEOUT_HIT, ODDONEOUT_TARGETS, type OddOneOutBoard, type OddOneOutSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** The board is 2 by 2 for the first boards, then 3 by 3, then 6 by 6 (each divides the 6 by 6 grid of tap targets exactly, so a tap always lands on the tile it was aimed at). */
const SIZE_AT = [
  { from: 8, n: 6 },
  { from: 3, n: 3 },
  { from: 0, n: 2 },
] as const;
/** How different the odd tile is (a difference in lightness, signed): this at the first board, shrinking as boards go by without ever reaching nothing
 * (`DELTA_START / (1 + DELTA_RATE * board)`), so in the end nobody can tell. */
const DELTA_START = 0.22;
const DELTA_RATE = 0.09;
/** The health bar: start here, at most this much. It drains all the time (faster as the run goes on, so a run always ends), a right tap refills
 * HP_GAIN and a wrong one costs HP_WRONG and locks that player out for LOCK_S. Out at 0. */
const HP_START = 10;
const HP_MAX = 20;
const HP_DRAIN = 0.5;
const HP_DRAIN_GAIN = 0.03;
const HP_GAIN = 3;
const HP_WRONG = 3;
const LOCK_S = 0.6;

interface Spotter extends RoundPlayer {
  /** Right taps this run: the score. */
  score: number;
  hp: number;
  /** Seconds left of being locked out after a wrong tap. */
  lock: number;
  /** Was in the run when it started, so is counted whether or not still in (someone who only watched has no score). */
  inRun: boolean;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How many tiles across the board is on board number `round` (0 is the first). */
export function boardSize(round: number): number {
  return SIZE_AT.find((s) => round >= s.from)!.n;
}

/** How different the odd tile is on board number `round`, in lightness. */
export function oddDelta(round: number): number {
  return DELTA_START / (1 + DELTA_RATE * round);
}

/** One shared board of near-identical tiles, one a little different: the first to tap it scores and the board changes for everyone. Each person has
 * a health bar that drains all the time and is refilled by a right tap and dented by a wrong one; out at 0. The tile is harder to see on every
 * board, so a run always ends. Last one in wins; most right taps is the score. See RoundGame for how runs start and end. */
export class OddOneOutGame extends RoundGame<Spotter> {
  readonly id = 'oddoneout' as const;
  private round = 0;
  private board: OddOneOutBoard = { n: 2, hue: 0, delta: 0.22, odd: 0 };
  /** Scales how fast the health bar drains (1 in play): a test about something else sets it to 0. */
  hpDrainScale = 1;

  /** The score shown for the run: the most right taps anyone has had. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRun) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Spotter {
    return { id, score: 0, hp: HP_START, lock: 0, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Spotter): void {
    p.score = 0;
    p.hp = HP_START;
    p.lock = 0;
    p.inRun = true;
  }

  protected resetCourse(): void {
    this.round = 0;
    this.board = this.makeBoard(0);
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  /** The tiles for board number `round`. Always takes the same three random numbers, so one board does not change the ones after it. */
  private makeBoard(round: number): OddOneOutBoard {
    const [hue, where, sign] = [this.rng(), this.rng(), this.rng()];
    const n = boardSize(round);
    const delta = oddDelta(round) * (sign < 0.5 ? -1 : 1);
    return { n, hue: Math.floor(hue * 360), delta: r3(delta), odd: Math.min(n * n - 1, Math.floor(where * n * n)) };
  }

  input(): void {
    // The board is the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping tiles is all there is to do.
  }

  /** A tap on the board's 6 by 6 grid of targets, which says which tile (of the n by n the board has now) was meant. */
  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || p.lock > 0) return;
    if (!Number.isInteger(target) || target < 0 || target >= ODDONEOUT_TARGETS) return;
    const n = this.board.n;
    const per = ODDONEOUT_HIT / n;
    const tile = Math.floor(Math.floor(target / ODDONEOUT_HIT) / per) * n + Math.floor((target % ODDONEOUT_HIT) / per);
    if (tile === this.board.odd) {
      p.score++;
      p.hp = Math.min(HP_MAX, p.hp + HP_GAIN);
      this.board = this.makeBoard(++this.round);
      // A new board: nobody is locked out of it for what they did on the last one.
      for (const q of this.players.values()) q.lock = 0;
      return;
    }
    p.hp -= HP_WRONG;
    p.lock = LOCK_S;
    if (p.hp <= 0) this.out(p);
  }

  protected override knockOut(p: Spotter): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  private out(p: Spotter): void {
    p.hp = 0;
    this.knockOut(p);
  }

  snapshot(): OddOneOutSnapshot {
    return {
      id: 'oddoneout',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      board: { ...this.board },
      round: this.round,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.inRun ? p.outAtMeters : 0,
        hp: r3(p.hp),
        lockMs: Math.round(p.lock * 1000),
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    const drain = (HP_DRAIN + HP_DRAIN_GAIN * seconds) * dt * this.hpDrainScale;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.lock = Math.max(0, p.lock - dt);
      p.hp -= drain;
      if (p.hp <= 0) this.out(p);
    }
  }

  /** However the run ends, everyone still in keeps the right taps they have, and the winner's score is their own. */
  protected override endRun(winner: Spotter | null): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = p.score;
    super.endRun(winner);
    if (winner) winner.outAtMeters = winner.score;
  }
}
