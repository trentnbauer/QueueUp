import { SIMON_PADS, type SimonSnapshot, type SimonStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Times are seconds.
/** A pause before the pattern starts to show, so there is time to look at the board. */
const SHOW_LEAD_S = 0.6;
/** Each pad of the pattern is lit this long, then dark for the gap before the next: quicker as the pattern grows, down to a floor. */
const LIT_START_S = 0.5;
const LIT_MIN_S = 0.28;
const LIT_GAIN_S = 0.01;
const GAP_S = 0.2;
/** How long a turn has to tap the pattern back and add a pad: a base, plus a little for each pad in it. */
const INPUT_BASE_S = 3;
const INPUT_PER_PAD_S = 0.9;
/** A short pause between one turn and the next. */
const BETWEEN_S = 0.8;

interface Player extends RoundPlayer {
  /** The longest pattern they got through. */
  best: number;
  /** Was in the run when it started (someone who only watched has no score). */
  inRun: boolean;
}

/** How long each pad is lit for a pattern of `length`. */
export function litFor(length: number): number {
  return Math.max(LIT_MIN_S, LIT_START_S - LIT_GAIN_S * length);
}

/** Four coloured pads and one pattern that everyone adds to. The players take turns: on your turn the pattern is shown, then you tap it back and
 * add one more pad on the end. Get it wrong, or run out of time, and you are out; the pattern stays as it was for the next player. Last one in
 * wins, and alone it is a high score (how long a pattern you got through). The pattern is made as it goes, so nobody can read ahead. See
 * RoundGame for how runs start and end. */
export class SimonGame extends RoundGame<Player> {
  readonly id = 'simon' as const;
  private pattern: number[] = [];
  private stage: SimonStage = 'between';
  /** Whose turn it is. */
  private turn: string | null = null;
  /** Seconds into the pattern being shown (`show`), left to finish the turn (`input`), or left in the pause (`between`). */
  private clock = 0;
  private inputTotal = 0;
  /** How many pads of the pattern (and the new one) the player whose turn it is has tapped, right so far. */
  private progress = 0;
  /** The turn was passed on by someone leaving, so it is already the next player's when the pause ends. */
  private passed = false;

  /** The longest pattern anyone got through. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRun) best = Math.max(best, p.best);
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Player {
    return { id, best: 0, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Player): void {
    p.best = 0;
    p.inRun = false;
  }

  protected resetCourse(): void {
    this.pattern = [];
    this.stage = 'between';
    this.turn = null;
    this.clock = 0;
    this.inputTotal = 0;
    this.progress = 0;
    this.passed = false;
  }

  protected beginCourse(): void {
    this.resetCourse();
    for (const p of this.players.values()) p.inRun = p.alive;
    this.turn = this.after(null);
    this.beginTurn();
  }

  /** Who goes after `id` (the first player in the order when `id` is null or no longer in): the next one still in. */
  private after(id: string | null): string | null {
    const ids = [...this.players.values()].filter((p) => p.alive && p.inRun).map((p) => p.id);
    if (ids.length === 0) return null;
    const i = id === null ? -1 : [...this.players.keys()].indexOf(id);
    const order = [...this.players.keys()];
    for (let step = 1; step <= order.length; step++) {
      const next = order[(i + step + order.length) % order.length];
      if (ids.includes(next)) return next;
    }
    return ids[0];
  }

  private beginTurn(): void {
    this.progress = 0;
    this.clock = 0;
    this.stage = this.pattern.length === 0 ? 'input' : 'show';
    if (this.stage === 'input') this.startInput();
  }

  private startInput(): void {
    this.stage = 'input';
    this.inputTotal = INPUT_BASE_S + INPUT_PER_PAD_S * (this.pattern.length + 1);
    this.clock = this.inputTotal;
  }

  input(): void {
    // The pads are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a pad is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || this.stage !== 'input' || userId !== this.turn || !p || !p.alive) return;
    if (!Number.isInteger(target) || target < 0 || target >= SIMON_PADS) return;
    if (this.progress < this.pattern.length) {
      if (target !== this.pattern[this.progress]) {
        this.fail(p);
        return;
      }
      this.progress++;
      return;
    }
    // The pad on the end: any pad, and it joins the pattern for everyone after.
    this.pattern.push(target);
    this.progress++;
    p.best = this.pattern.length;
    this.endTurn();
  }

  /** Out, with the longest pattern they got through as their score. */
  private fail(p: Player): void {
    this.knockOut(p);
    p.outAtMeters = p.best;
    this.endTurn();
    this.checkRunEnd();
  }

  private endTurn(): void {
    this.stage = 'between';
    this.clock = BETWEEN_S;
  }

  /** The pad lit right now while showing, or -1. */
  private get lit(): number {
    if (this.stage !== 'show') return -1;
    const t = this.clock - SHOW_LEAD_S;
    if (t < 0) return -1;
    const on = litFor(this.pattern.length);
    const slot = on + GAP_S;
    const i = Math.floor(t / slot);
    return i < this.pattern.length && t - i * slot < on ? this.pattern[i] : -1;
  }

  snapshot(): SimonSnapshot {
    return {
      id: 'simon',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      length: this.pattern.length,
      lit: this.lit,
      turnId: this.phase === 'playing' ? this.turn : null,
      progress: this.stage === 'input' ? this.progress : 0,
      inputLeftMs: this.stage === 'input' ? Math.max(0, Math.round(this.clock * 1000)) : 0,
      inputTotalMs: this.stage === 'input' ? Math.round(this.inputTotal * 1000) : 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.inRun ? (p.alive ? p.best : p.outAtMeters) : 0 })),
    };
  }

  /** Someone leaving on their own turn passes it on. */
  override leave(userId: string): void {
    const wasTurn = this.turn === userId && this.stage !== 'between';
    // Work out who is next while the leaver is still in the order.
    const next = wasTurn ? this.after(userId) : null;
    super.leave(userId);
    if (wasTurn && this.phase === 'playing' && this.players.size > 0) {
      this.turn = next === userId ? this.after(null) : next;
      this.passed = true;
      this.endTurn();
    }
  }

  protected advance(dt: number): void {
    if (this.stage === 'show') {
      this.clock += dt;
      const on = litFor(this.pattern.length);
      if (this.clock >= SHOW_LEAD_S + this.pattern.length * (on + GAP_S)) this.startInput();
    } else if (this.stage === 'input') {
      this.clock -= dt;
      const p = this.turn ? this.players.get(this.turn) : undefined;
      // Out of time: the turn is over for them.
      if (this.clock <= 0 && p?.alive) this.fail(p);
    } else {
      this.clock -= dt;
      if (this.clock <= 0) {
        // A turn passed on by someone leaving is already the next player's.
        if (!this.passed) this.turn = this.after(this.turn);
        this.passed = false;
        if (this.turn) this.beginTurn();
      }
    }
  }
}
