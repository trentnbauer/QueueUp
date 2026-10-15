import { DRAW_POINTS_TO_WIN, type DrawPlayerState, type DrawSnapshot, type DrawStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** A run ends at this time if nobody has reached the points to win: most points wins. */
const RUN_LIMIT_S = 60;
/** The wait before GO is random between these. It is never sent to players, so it cannot be learned early. */
const WAIT_MIN_S = 1.5;
const WAIT_MAX_S = 4;
/** How long the result of a duel round shows before the next one begins. */
const RESULT_S = 1.5;
/** A round where everyone false-started is shown for this long, then run again. */
const REDO_S = 1.2;

interface Duelist extends RoundPlayer {
  score: number;
  state: DrawPlayerState;
}

/** Everyone waits with a finger on the button. After a random pause GO flashes; the first tap wins the
 * point. Tapping before GO is a false start and out of that round. First to 3 points wins the run, or
 * most points at 60 seconds. Because of network lag the order is decided by when taps reach the server,
 * so it is for fun, not fairness. Needs 2 players, so on your own a bot duels you (see bots.ts). */
export class DrawGame extends RoundGame<Duelist> {
  readonly id = 'draw' as const;
  readonly minPlayers = 2;
  private stage: DrawStage = 'wait';
  private duel = 1;
  /** Seconds left in the wait (`wait`), or in the result being shown (`result`). */
  private left = 0;
  /** Seconds since GO. */
  private sinceGo = 0;
  private duelWinner: string | null = null;
  private reactMs = 0;

  /** The score shown for the run: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Duelist {
    return { id, score: 0, state: 'ready', alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Duelist): void {
    p.score = 0;
    p.state = 'ready';
  }

  protected resetCourse(): void {
    this.duel = 1;
    this.stage = 'wait';
    this.left = 0;
    this.sinceGo = 0;
    this.duelWinner = null;
    this.reactMs = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.startWait();
  }

  private startWait(): void {
    this.stage = 'wait';
    this.left = WAIT_MIN_S + this.rng() * (WAIT_MAX_S - WAIT_MIN_S);
    this.sinceGo = 0;
    this.duelWinner = null;
    this.reactMs = 0;
    for (const p of this.players.values()) p.state = 'ready';
  }

  input(): void {
    // The button is the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || target !== 0 || p.state !== 'ready') return;
    if (this.stage === 'wait') {
      p.state = 'false';
      return;
    }
    if (this.stage !== 'go') return;
    p.state = 'won';
    p.score++;
    this.duelWinner = p.id;
    this.reactMs = Math.round(this.sinceGo * 1000);
    for (const q of this.players.values()) if (q.alive && q.state === 'ready') q.state = 'late';
    this.stage = 'result';
    this.left = RESULT_S;
    if (p.score >= DRAW_POINTS_TO_WIN) this.finishRun(p);
  }

  snapshot(): DrawSnapshot {
    return {
      id: 'draw',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.phase === 'playing' ? Math.max(0, Math.round(RUN_LIMIT_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      duel: this.duel,
      stage: this.stage,
      sinceGoMs: this.stage === 'wait' ? 0 : Math.round(this.sinceGo * 1000),
      duelWinnerId: this.stage === 'result' ? this.duelWinner : null,
      reactMs: this.stage === 'result' && this.duelWinner ? this.reactMs : 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0, state: p.state })),
    };
  }

  protected advance(dt: number): void {
    const duelists = [...this.players.values()].filter((p) => p.alive);
    if (this.stage === 'wait') {
      this.left -= dt;
      // If everyone false-started there is nobody left to tap: show it, then run the round again.
      if (duelists.length > 0 && duelists.every((p) => p.state === 'false')) {
        this.stage = 'result';
        this.left = REDO_S;
        this.duelWinner = null;
      } else if (this.left <= 0) {
        this.stage = 'go';
        this.sinceGo = 0;
      }
    } else if (this.stage === 'go') {
      this.sinceGo += dt;
      // Nobody tapped for a long time (they are all away): move on rather than wait forever.
      if (this.sinceGo > 10) {
        this.stage = 'result';
        this.left = REDO_S;
        this.duelWinner = null;
      }
    } else {
      this.sinceGo += dt;
      this.left -= dt;
      if (this.left <= 0) {
        this.duel++;
        this.startWait();
      }
    }
    if (this.roundMs / 1000 >= RUN_LIMIT_S && this.phase === 'playing') this.finishRun(null);
  }

  /** Ends the run: `winner` reached the points, or (null) time is up and most points wins; a tie has no winner. */
  private finishRun(winner: Duelist | null): void {
    const duelists = [...this.players.values()].filter((p) => p.alive);
    for (const p of duelists) p.outAtMeters = p.score;
    if (winner) return this.endRun(winner);
    const best = Math.max(0, ...duelists.map((p) => p.score));
    const leaders = duelists.filter((p) => p.score === best);
    this.endRun(best > 0 && leaders.length === 1 ? leaders[0] : null);
  }
}

/** A bot that waits for GO and taps a human-ish moment later (a third to three quarters of a second). It
 * never false-starts, so it is beatable by being quick. */
export function drawBrain(id: string, rng: () => number): BotBrain {
  let reactIn = -1;
  let duel = 0;
  return (snap, dtMs) => {
    if (snap.id !== 'draw' || snap.phase !== 'playing') return {};
    if (snap.duel !== duel) {
      duel = snap.duel;
      reactIn = -1;
    }
    if (snap.stage !== 'go' || snap.players.find((p) => p.id === id)?.state !== 'ready') return {};
    if (reactIn < 0) reactIn = 0.33 + rng() * 0.42;
    reactIn -= dtMs / 1000;
    return reactIn <= 0 ? { taps: [0] } : {};
  };
}
