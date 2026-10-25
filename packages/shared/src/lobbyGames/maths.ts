import type { MathsSnapshot } from '../spinLobby.js';
import { QuizGame, nearNumbers, shuffleChoices, type QuizQuestion } from './quiz.js';

/** How long the four answers wait: roomy for the first sum, then a little less for every sum, down to a floor. */
const ALLOWED_START_S = 5;
const ALLOWED_GAIN_S = 0.1;
const ALLOWED_MIN_S = 2.8;

/** A sum for question number `asked` (0 is the first): sums get bigger every few questions, from adding small numbers to times tables.
 * Takes the same four random numbers however it turns out. */
export function mathsSum(asked: number, rng: () => number): { text: string; answer: number } {
  const [r1, r2, r3, r4] = [rng(), rng(), rng(), rng()];
  const between = (r: number, lo: number, hi: number) => lo + Math.floor(r * (hi - lo + 1));
  // A take-away always takes the smaller from the larger, so an answer is never below zero.
  const minus = (a: number, b: number) => ({ text: `${Math.max(a, b)} − ${Math.min(a, b)}`, answer: Math.abs(a - b) });
  if (asked < 4) {
    const a = between(r1, 2, 12);
    const b = between(r2, 2, 12);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (asked < 10) {
    const a = between(r1, 12, 50);
    const b = between(r2, 3, 30);
    return r3 < 0.5 ? { text: `${a} + ${b}`, answer: a + b } : minus(a, b);
  }
  if (asked < 18) {
    if (r3 < 0.5) {
      const a = between(r1, 2, 9);
      const b = between(r2, 2, 9);
      return { text: `${a} × ${b}`, answer: a * b };
    }
    const a = between(r1, 30, 99);
    const b = between(r2, 11, 60);
    return r4 < 0.5 ? { text: `${a} + ${b}`, answer: a + b } : minus(a, b);
  }
  if (r3 < 0.6) {
    const a = between(r1, 4, 12);
    const b = between(r2, 6, 15);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  const a = between(r1, 60, 199);
  const b = between(r2, 25, 120);
  return r4 < 0.5 ? { text: `${a} + ${b}`, answer: a + b } : minus(a, b);
}

/** A sum, four answers, and the first to tap the right one scores most: the quick score two points, the rest one. Sums start easy and get
 * bigger and quicker. See QuizGame for the rules around it, and RoundGame for how rounds start and end. */
export class MathsGame extends QuizGame {
  readonly id = 'maths' as const;

  protected resetQuestions(): void {
    // Nothing is carried from one sum to the next.
  }

  protected makeQuestion(asked: number): QuizQuestion {
    const { text, answer } = mathsSum(asked, this.rng);
    // Wrong answers are near the right one, so working it out is the only way (the spread widens with the size of the sum).
    const wrong = nearNumbers(answer, Math.max(3, Math.round(Math.abs(answer) * 0.15)), 0, this.rng);
    const mixed = shuffleChoices([answer, ...wrong], 0, this.rng);
    return { showS: 0, allowedS: Math.max(ALLOWED_MIN_S, ALLOWED_START_S - ALLOWED_GAIN_S * asked), text, choices: mixed.items.map(String), answer: mixed.answer };
  }

  snapshot(): MathsSnapshot {
    return { id: 'maths', ...this.quizFields() };
  }
}
