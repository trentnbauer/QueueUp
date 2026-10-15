import { MEMORY_PANELS, type MemorySnapshot, type MemoryStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Times are seconds.
/** A pause before the pattern starts to show, so there is time to look at the board. */
const SHOW_LEAD_S = 0.8;
/** Each panel of the pattern is lit this long, then dark for the gap before the next. */
const LIT_S = 0.55;
const GAP_S = 0.25;
/** How long to tap the pattern back: a base, plus a little for each panel in it. */
const INPUT_BASE_S = 3;
const INPUT_PER_PANEL_S = 1.2;
/** A short pause between a round everyone finished and the next pattern. */
const BETWEEN_S = 1;
/** A run that is still going at this many rounds ends with no winner (nobody could be expected to get further). */
const MAX_ROUNDS = 40;

interface Memorizer extends RoundPlayer {
  /** How many panels of this round's pattern they have tapped, right so far. */
  progress: number;
  done: boolean;
  inRun: boolean;
}

/** A board of four coloured panels. The pattern lights up one panel at a time; then everyone taps it back, in
 * order. A wrong panel, or running out of time, knocks you out. Each round the pattern is one panel longer;
 * last one in wins, and alone it is a high score (how many rounds you got through). The pattern is made on
 * the server and only the panel being lit right now is ever sent, so nobody can read ahead, and what other
 * people have tapped is never shown, only how many they have got right. See RoundGame for how runs start and
 * end. */
export class MemoryGame extends RoundGame<Memorizer> {
  readonly id = 'memory' as const;
  private pattern: number[] = [];
  private stage: MemoryStage = 'show';
  /** Seconds into the pattern being shown (`show`), left to tap it back (`input`), or left in the pause (`between`). */
  private clock = 0;
  private inputTotal = 0;

  /** Rounds fully played: the one that is on is not counted until everyone left in has got through it. */
  protected get meters(): number {
    return Math.max(0, this.pattern.length - 1);
  }

  protected createPlayer(id: string, alive: boolean): Memorizer {
    return { id, progress: 0, done: false, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Memorizer): void {
    p.progress = 0;
    p.done = false;
    p.inRun = false;
  }

  protected resetCourse(): void {
    this.pattern = [];
    this.stage = 'show';
    this.clock = 0;
    this.inputTotal = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    for (const p of this.players.values()) p.inRun = p.alive;
    this.nextRound();
  }

  /** Adds a panel to the pattern and starts showing it. */
  private nextRound(): void {
    this.pattern.push(Math.floor(this.rng() * MEMORY_PANELS));
    this.stage = 'show';
    this.clock = 0;
    for (const p of this.players.values()) {
      p.progress = 0;
      p.done = false;
    }
  }

  input(): void {
    // The panels are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a panel is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || this.stage !== 'input' || !p || !p.alive || !p.inRun || p.done) return;
    if (!Number.isInteger(target) || target < 0 || target >= MEMORY_PANELS) return;
    if (target !== this.pattern[p.progress]) {
      this.fail(p);
      this.checkRunEnd();
      return;
    }
    p.progress++;
    if (p.progress >= this.pattern.length) p.done = true;
  }

  /** Out, with the rounds they got through as their score. */
  private fail(p: Memorizer): void {
    this.knockOut(p);
    p.outAtMeters = this.meters;
  }

  /** The panel lit right now while showing, or -1. */
  private get lit(): number {
    if (this.stage !== 'show') return -1;
    const t = this.clock - SHOW_LEAD_S;
    if (t < 0) return -1;
    const slot = LIT_S + GAP_S;
    const i = Math.floor(t / slot);
    return i < this.pattern.length && t - i * slot < LIT_S ? this.pattern[i] : -1;
  }

  snapshot(): MemorySnapshot {
    return {
      id: 'memory',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      length: this.pattern.length,
      lit: this.lit,
      inputLeftMs: this.stage === 'input' ? Math.max(0, Math.round(this.clock * 1000)) : 0,
      inputTotalMs: this.stage === 'input' ? Math.round(this.inputTotal * 1000) : 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.inRun ? (p.alive ? this.meters : p.outAtMeters) : 0,
        progress: p.alive && this.stage !== 'show' ? p.progress : 0,
        done: p.alive && p.done,
      })),
    };
  }

  protected advance(dt: number): void {
    if (this.stage === 'show') {
      this.clock += dt;
      const total = SHOW_LEAD_S + this.pattern.length * (LIT_S + GAP_S);
      if (this.clock >= total) {
        this.stage = 'input';
        this.inputTotal = INPUT_BASE_S + INPUT_PER_PANEL_S * this.pattern.length;
        this.clock = this.inputTotal;
      }
    } else if (this.stage === 'input') {
      this.clock -= dt;
      const left = [...this.players.values()].filter((p) => p.alive && p.inRun);
      if (this.clock <= 0) {
        // Out of time: anyone who has not tapped the whole pattern is out.
        for (const p of left) if (!p.done) this.fail(p);
      }
      if (this.phase !== 'playing') return;
      const still = [...this.players.values()].filter((p) => p.alive && p.inRun);
      if (still.length > 0 && still.every((p) => p.done)) {
        this.stage = 'between';
        this.clock = BETWEEN_S;
      } else if (this.clock <= 0) {
        this.stage = 'between';
        this.clock = BETWEEN_S;
      }
    } else {
      this.clock -= dt;
      if (this.clock <= 0) {
        if (this.pattern.length >= MAX_ROUNDS) this.endRun(null);
        else this.nextRound();
      }
    }
  }
}
