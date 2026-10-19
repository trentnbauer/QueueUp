import { WORDS_BACKSPACE, WORDS_ENTER, WORDS_GUESSES, WORDS_LENGTH, WORDS_TARGETS, WORD_ABSENT, WORD_CORRECT, WORD_PRESENT, type WordsMine, type WordsSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import { WORD_DICTIONARY } from './wordDictionary.js';
import { WORD_ANSWERS } from './wordList.js';

/** The run ends at this time for anyone still guessing. */
const ROUND_S = 90;
/** Points for a solve: this much for each guess left unused (so a first-guess solve is the most)... */
const POINTS_PER_SPARE_GUESS = 10;
/** ...plus up to this much more for solving early (the share of the time left). */
const SPEED_BONUS = 9;

interface Guesser extends RoundPlayer {
  guesses: string[];
  rows: number[][];
  /** The letters typed for the next guess so far: only for the squares that are not already known (see `known`). */
  draft: string;
  /** For each square, the letter once a guess has had it in the right place ('' until then). The next guess fills
   * these in by itself, so only the other squares are typed. */
  known: string[];
  /** The last guess they sent was not a word, so it was turned back (the draft is kept): cleared by their next key. */
  rejected: boolean;
  solved: boolean;
  done: boolean;
  /** Milliseconds into the run when they solved it. */
  solvedAt: number;
  points: number;
  inRun: boolean;
}

/** How each letter of `guess` scores against `answer`, as in Wordle: right place, else somewhere else in the word
 * (counting each letter of the answer only once), else not in it. */
export function scoreGuess(guess: string, answer: string): number[] {
  const out: number[] = Array(guess.length).fill(WORD_ABSENT);
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) out[i] = WORD_CORRECT;
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === WORD_CORRECT) continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) {
      out[i] = WORD_PRESENT;
      left.set(guess[i], n - 1);
    }
  }
  return out;
}

/** Everyone guesses the same four-letter word, in five guesses, as in Wordle, each on their own board: each guess
 * says, letter by letter, which are in the right place, in the word elsewhere, or not in it. Letters are tapped
 * on an on-screen keyboard (or typed). Everyone who finds the word wins; the best is the one who needed the fewest
 * guesses, then was quickest. The word stays on the server until the run is over, and what other people guessed
 * is never sent, only how each guess scored. See RoundGame for how runs start and end. */
export class WordsGame extends RoundGame<Guesser> {
  readonly id = 'words' as const;
  private answer = '';

  /** The score shown for the run: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRun && p.points > best) best = p.points;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Guesser {
    return { id, guesses: [], rows: [], draft: '', known: Array(WORDS_LENGTH).fill(''), rejected: false, solved: false, done: false, solvedAt: 0, points: 0, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Guesser): void {
    p.guesses = [];
    p.rows = [];
    p.draft = '';
    p.known = Array(WORDS_LENGTH).fill('');
    p.rejected = false;
    p.solved = false;
    p.done = false;
    p.solvedAt = 0;
    p.points = 0;
    p.inRun = false;
  }

  protected resetCourse(): void {
    this.answer = '';
  }

  protected beginCourse(): void {
    this.answer = WORD_ANSWERS[Math.floor(this.rng() * WORD_ANSWERS.length)];
    for (const p of this.players.values()) p.inRun = p.alive;
  }

  input(): void {
    // The keyboard is the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping keys is all there is to do.
  }

  /** Targets 0 to 25 type a letter (a to z), `WORDS_ENTER` sends the guess and `WORDS_BACKSPACE` takes a letter back. */
  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || !p.inRun || p.done) return;
    if (!Number.isInteger(target) || target < 0 || target >= WORDS_TARGETS) return;
    p.rejected = false;
    if (target === WORDS_BACKSPACE) p.draft = p.draft.slice(0, -1);
    else if (target === WORDS_ENTER) this.submit(p);
    else if (p.draft.length < this.openSquares(p)) p.draft += String.fromCharCode(97 + target);
  }

  /** How many squares of the next guess still have to be typed: the ones whose letter is not known yet. */
  private openSquares(p: Guesser): number {
    return p.known.filter((letter) => letter === '').length;
  }

  /** The whole word for the next guess: the known letters where they belong, and the typed ones in the other squares. */
  private compose(p: Guesser): string {
    let typed = 0;
    return p.known.map((letter) => letter || p.draft[typed++]).join('');
  }

  private submit(p: Guesser): void {
    // Only a guess with every open square typed is sent.
    if (p.draft.length !== this.openSquares(p)) return;
    const guess = this.compose(p);
    // A guess has to be a word: a run of letters like AEIO is turned back, and costs nothing (the draft stays, to change).
    if (!WORD_DICTIONARY.has(guess)) {
      p.rejected = true;
      return;
    }
    p.draft = '';
    p.guesses.push(guess);
    const row = scoreGuess(guess, this.answer);
    p.rows.push(row);
    // A letter in the right place is kept for the next guess, which fills it in so it need not be typed again.
    row.forEach((state, i) => {
      if (state === WORD_CORRECT) p.known[i] = guess[i];
    });
    if (guess === this.answer) {
      p.solved = true;
      p.done = true;
      p.solvedAt = this.roundMs;
      const spare = WORDS_GUESSES - p.guesses.length + 1;
      p.points = spare * POINTS_PER_SPARE_GUESS + Math.floor(Math.max(0, 1 - this.roundMs / (ROUND_S * 1000)) * SPEED_BONUS);
    } else if (p.guesses.length >= WORDS_GUESSES) p.done = true;
    if (p.done && [...this.players.values()].filter((q) => q.inRun).every((q) => q.done)) this.finishRun();
  }

  snapshot(viewer?: string): WordsSnapshot {
    const me = viewer ? this.players.get(viewer) : undefined;
    let mine: WordsMine | null = null;
    if (me?.inRun) {
      const keys: number[] = Array(26).fill(-1);
      me.guesses.forEach((g, i) => {
        for (let k = 0; k < g.length; k++) {
          const letter = g.charCodeAt(k) - 97;
          keys[letter] = Math.max(keys[letter], me.rows[i][k]);
        }
      });
      mine = { guesses: [...me.guesses], draft: me.draft, known: [...me.known], keys, rejected: me.rejected };
    }
    return {
      id: 'words',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.inRun || (this.phase !== 'playing' && p.alive),
        wins: p.wins,
        meters: p.inRun ? p.points : 0,
        guesses: p.guesses.length,
        solved: p.solved,
        done: p.done,
        rows: p.rows.map((r) => [...r]),
      })),
      mine,
      answer: this.phase === 'over' ? this.answer : null,
    };
  }

  /** The 90 seconds are part of the game, whatever the lobby's time limit says (a shorter cap still ends it sooner). */
  protected override get ownLimitS(): number {
    return ROUND_S;
  }

  protected override limitReached(): void {
    this.finishRun();
  }

  protected advance(): void {
    if (this.roundMs >= ROUND_S * 1000) this.finishRun();
  }

  /** People leaving does not end a run while someone who started it is still guessing. */
  protected override checkRunEnd(): void {
    if (this.phase === 'playing' && ![...this.players.values()].some((p) => p.inRun)) this.endRun(null);
  }

  /** Everyone is done or time is up. Everyone who found the word has won, and the one who needed the fewest guesses,
   * then was soonest, is the run's winner; a dead heat for that, or a solo run, has no single winner. */
  private finishRun(): void {
    if (this.phase !== 'playing') return;
    const racers = [...this.players.values()].filter((p) => p.inRun);
    for (const p of racers) p.outAtMeters = p.points;
    const solvers = racers.filter((p) => p.solved).sort((a, b) => a.guesses.length - b.guesses.length || a.solvedAt - b.solvedAt);
    const best = solvers[0];
    const clear = best && (solvers.length === 1 || solvers[1].guesses.length !== best.guesses.length || solvers[1].solvedAt !== best.solvedAt);
    const winner = this.startedWith > 1 && clear ? best : null;
    // Everyone else who found the word is a winner too, in a run with others in it.
    if (this.startedWith > 1) {
      for (const p of solvers) {
        if (p === winner) continue;
        p.wins++;
        this.record.wins.set(p.id, p.wins);
      }
    }
    this.endRun(winner);
  }
}
