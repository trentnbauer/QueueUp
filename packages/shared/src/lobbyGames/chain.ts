import type { ChainSnapshot } from '../spinLobby.js';
import { ANAGRAM_WORDS } from './anagramList.js';
import { QuizGame, shuffleChoices, type QuizQuestion } from './quiz.js';

/** How long the four words wait: roomy at first, then less, down to a floor. */
const ALLOWED_START_S = 4.5;
const ALLOWED_GAIN_S = 0.08;
const ALLOWED_MIN_S = 2.6;

const startsWith = (letter: string, used: ReadonlySet<string>) => ANAGRAM_WORDS.filter((w) => w[0] === letter && !used.has(w));

/** A word is shown, and four more: one starts with the last letter of the word on show, the other three do not. Tap it, and it becomes the
 * next word, so the answers make a chain. Words are not repeated until the list has run out. Quick right answers score two, the rest one; see
 * QuizGame for the rules around it and RoundGame for how rounds start and end. */
export class ChainGame extends QuizGame {
  readonly id = 'chain' as const;
  private current = '';
  private readonly used = new Set<string>();

  protected resetQuestions(): void {
    this.current = '';
    this.used.clear();
  }

  /** A word nobody has had yet (or any word once all have been had), picked at random. */
  private fresh(roll: number): string {
    let pool = ANAGRAM_WORDS.filter((w) => !this.used.has(w));
    if (pool.length === 0) {
      this.used.clear();
      pool = [...ANAGRAM_WORDS];
    }
    return pool[Math.floor(roll * pool.length)];
  }

  protected makeQuestion(asked: number): QuizQuestion {
    // Always the same random numbers, so one question does not change the ones after it.
    const [startRoll, nextRoll, ...wrongRolls] = Array.from({ length: 5 }, () => this.rng());
    if (this.current === '') {
      this.current = this.fresh(startRoll);
      this.used.add(this.current);
    }
    let letter = this.current[this.current.length - 1];
    let candidates = startsWith(letter, this.used);
    if (candidates.length === 0) {
      // A dead end: no word is left for this letter, so the chain starts again from a fresh word.
      this.current = this.fresh(startRoll);
      this.used.add(this.current);
      letter = this.current[this.current.length - 1];
      candidates = startsWith(letter, this.used);
    }
    // Prefer an answer that can be followed (some unused word starts with its last letter), so the chain keeps going.
    const onward = candidates.filter((w) => startsWith(w[w.length - 1], new Set([...this.used, w])).length > 0);
    const pool = onward.length > 0 ? onward : candidates;
    // A word whose last letter has no word at all (and so no candidates) cannot happen after the fresh start above, unless the list were tiny.
    const next = pool[Math.floor(nextRoll * pool.length)] ?? this.fresh(nextRoll);
    // Three wrong words, none starting with the letter, no two starting with the same letter where there is a choice.
    const others = ANAGRAM_WORDS.filter((w) => w[0] !== letter && w !== next);
    const wrong: string[] = [];
    const letters = new Set<string>();
    for (const roll of wrongRolls) {
      const left = others.filter((w) => !wrong.includes(w) && !letters.has(w[0]));
      const from = left.length > 0 ? left : others.filter((w) => !wrong.includes(w));
      const w = from[Math.floor(roll * from.length)];
      wrong.push(w);
      letters.add(w[0]);
    }
    const mixed = shuffleChoices([next, ...wrong], 0, this.rng);
    const question: QuizQuestion = { showS: 0, allowedS: Math.max(ALLOWED_MIN_S, ALLOWED_START_S - ALLOWED_GAIN_S * asked), text: this.current, choices: mixed.items, answer: mixed.answer };
    // The answer becomes the word on show for the next question.
    this.used.add(next);
    this.current = next;
    return question;
  }

  snapshot(): ChainSnapshot {
    const word = this.question?.text ?? '';
    return { id: 'chain', ...this.quizFields(), letter: word.slice(-1) };
  }
}
