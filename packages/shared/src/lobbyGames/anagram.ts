import { ANAGRAM_BACKSPACE, type AnagramMine, type AnagramSnapshot, type AnagramStage } from '../spinLobby.js';
import { ANAGRAM_WORDS, sortedLetters } from './anagramList.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const ROUND_S = 60;
/** A moment before the first word, so there is time to get ready. */
const FIRST_WORD_S = 1;
/** How long a word waits to be solved, before the answer is shown and the next one starts. */
const WORD_S = 14;
/** The answer shows for this long before the next word. */
const BETWEEN_S = 1.6;
/** Points for being first to solve a word: this many, plus up to as many again for how much of the time was left. */
const SOLVE_POINTS = 5;
const SPEED_BONUS = 5;
/** The words start short and grow: this many words of 3 letters, then this many of 4, then of 5, and from then on 6 (the most tiles there are). */
const WORDS_PER_LENGTH = 3;
const FIRST_LENGTH = 3;
const LAST_LENGTH = 6;

interface Solver extends RoundPlayer {
  score: number;
  /** Which of the scrambled tiles they have picked, in the order they picked them (their own, never shown to others). */
  picked: number[];
}

/** Shows a scrambled word to everyone; tap the tiles to spell it. The first player to spell a word the scramble can
 * make scores for it, and then a new word comes, a letter longer every few words. When the 60 seconds are up, most points wins. See RoundGame for
 * how rounds start and end. */
export class AnagramGame extends RoundGame<Solver> {
  readonly id = 'anagram' as const;
  private stage: AnagramStage = 'between';
  private word = '';
  private letters = '';
  private elapsed = 0;
  private wait = 0;
  private wordNo = 0;
  private solvedBy: string | null = null;
  private used = new Set<string>();

  /** The score shown for the round: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected override get ownLimitS(): number {
    return ROUND_S;
  }

  protected createPlayer(id: string, alive: boolean): Solver {
    return { id, score: 0, picked: [], alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Solver): void {
    p.score = 0;
    p.picked = [];
  }

  protected resetCourse(): void {
    this.stage = 'between';
    this.word = '';
    this.letters = '';
    this.elapsed = 0;
    this.wait = 0;
    this.wordNo = 0;
    this.solvedBy = null;
    this.used = new Set();
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.wait = FIRST_WORD_S;
  }

  input(): void {
    // The tiles are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping tiles is all there is to do.
  }

  /** Targets 0 to `ANAGRAM_MAX_LETTERS - 1` pick a tile; `ANAGRAM_BACKSPACE` takes the last pick back. */
  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || this.stage !== 'play' || !p || !p.alive) return;
    if (!Number.isInteger(target) || target < 0) return;
    if (target === ANAGRAM_BACKSPACE) {
      p.picked.pop();
      return;
    }
    if (target >= this.letters.length || p.picked.includes(target)) return;
    p.picked.push(target);
    if (p.picked.length < this.letters.length) return;
    const guess = p.picked.map((i) => this.letters[i]).join('');
    if (this.accepts(guess)) this.solve(p);
    else p.picked = [];
  }

  /** The answer, or any other word in the list made of the same letters (heart and earth). */
  private accepts(guess: string): boolean {
    return guess === this.word || (ANAGRAM_WORDS.includes(guess) && sortedLetters(guess) === sortedLetters(this.word));
  }

  private solve(p: Solver): void {
    const left = Math.max(0, 1 - this.elapsed / WORD_S);
    p.score += SOLVE_POINTS + Math.round(SPEED_BONUS * left);
    this.solvedBy = p.id;
    this.stage = 'between';
    this.wait = BETWEEN_S;
  }

  snapshot(viewer?: string): AnagramSnapshot {
    const me = viewer ? this.players.get(viewer) : undefined;
    const mine: AnagramMine | null = me?.alive ? { picked: [...me.picked] } : null;
    return {
      id: 'anagram',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      wordNo: this.wordNo,
      letters: this.stage === 'play' || this.stage === 'between' ? this.letters : '',
      wordLeftMs: this.stage === 'play' ? Math.max(0, Math.round((WORD_S - this.elapsed) * 1000)) : 0,
      wordTotalMs: WORD_S * 1000,
      // The answer is only told once the word is over.
      answer: this.stage === 'between' && this.wordNo > 0 ? this.word : null,
      solvedBy: this.stage === 'between' ? this.solvedBy : null,
      mine,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0, filled: p.picked.length })),
    };
  }

  protected advance(dt: number): void {
    if (this.stage === 'between') {
      this.wait -= dt;
      if (this.wait <= 0 && this.roundMs / 1000 < ROUND_S) this.nextWord();
    } else {
      this.elapsed += dt;
      if (this.elapsed >= WORD_S) {
        this.solvedBy = null;
        this.stage = 'between';
        this.wait = BETWEEN_S;
      }
    }
    if (this.roundMs / 1000 >= ROUND_S) this.finishRound();
  }

  protected override limitReached(): void {
    this.finishRound();
  }

  /** How many letters the next word has: 3 for the first few words, then 4, then 5, then 6. */
  private get nextLength(): number {
    return Math.min(LAST_LENGTH, FIRST_LENGTH + Math.floor(this.wordNo / WORDS_PER_LENGTH));
  }

  private nextWord(): void {
    const pool = ANAGRAM_WORDS.filter((w) => w.length === this.nextLength);
    if (pool.every((w) => this.used.has(w))) for (const w of pool) this.used.delete(w);
    let word = '';
    for (let tries = 0; tries < 50; tries++) {
      word = pool[Math.floor(this.rng() * pool.length)];
      if (!this.used.has(word)) break;
    }
    this.used.add(word);
    this.word = word;
    this.letters = this.scramble(word);
    this.wordNo++;
    this.elapsed = 0;
    this.solvedBy = null;
    this.stage = 'play';
    for (const p of this.players.values()) p.picked = [];
  }

  /** The word's letters in a new order that does not spell it (or any word of the same letters in the list that came first). */
  private scramble(word: string): string {
    const letters = [...word];
    let out = word;
    for (let tries = 0; tries < 20 && out === word; tries++) {
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      out = letters.join('');
    }
    return out;
  }

  /** Time is up: most points wins. A tie for the most, or a solo round, has no winner. */
  private finishRound(): void {
    if (this.phase !== 'playing') return;
    const players = [...this.players.values()].filter((p) => p.alive);
    for (const p of players) p.outAtMeters = p.score;
    const best = Math.max(0, ...players.map((p) => p.score));
    const leaders = players.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }
}
