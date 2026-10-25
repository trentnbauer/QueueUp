import type { CountingItem, CountingSnapshot } from '../spinLobby.js';
import { QuizGame, nearNumbers, shuffleChoices, type QuizQuestion } from './quiz.js';

/** The shapes are scattered over a grid of cells this big (one shape to a cell, a little off centre), so none sit on top of another. */
const COLS = 6;
const ROWS = 5;
/** How many of the counted kind, and of the other kind, for question number `asked`: both grow, to a cap. */
const COUNTED_START = 3;
const COUNTED_MAX = 14;
const OTHER_MAX = 8;
/** How long the shapes are on show: a base plus a little for each shape, within limits. */
const SHOW_BASE_S = 0.8;
const SHOW_PER_ITEM_S = 0.1;
const SHOW_MIN_S = 1.2;
const SHOW_MAX_S = 2.8;
/** How long the four answers wait: roomy at first, then less, down to a floor. */
const ALLOWED_START_S = 3.4;
const ALLOWED_GAIN_S = 0.06;
const ALLOWED_MIN_S = 2.2;

/** How many shapes of the counted kind, and of the other kind, question number `asked` has. */
export function countsFor(asked: number): { counted: number; other: number } {
  return { counted: Math.min(COUNTED_MAX, COUNTED_START + Math.floor(asked / 2)), other: Math.min(OTHER_MAX, 2 + Math.floor(asked / 3)) };
}

/** Shapes flash up for a moment, and everyone says how many there were of one kind: four numbers to tap, one right. The shapes are only sent
 * while they are on show, and the choices only once they are gone. Quick right answers score two, the rest one; see QuizGame for the rules around
 * it and RoundGame for how rounds start and end. */
export class CountingGame extends QuizGame {
  readonly id = 'counting' as const;
  private items: CountingItem[] = [];
  private kind: 0 | 1 = 0;

  protected resetQuestions(): void {
    this.items = [];
    this.kind = 0;
  }

  protected makeQuestion(asked: number): QuizQuestion {
    const { counted, other } = countsFor(asked);
    const total = counted + other;
    this.kind = this.rng() < 0.5 ? 0 : 1;
    // Which cells get a shape: the cells sorted by a random key each, and the first `total` taken.
    const keys = Array.from({ length: COLS * ROWS }, () => this.rng());
    const cells = keys.map((key, cell) => ({ cell, key })).sort((a, b) => a.key - b.key).map((c) => c.cell);
    this.items = cells.slice(0, total).map((cell, i) => {
      const x = (cell % COLS + 0.2 + 0.6 * this.rng()) / COLS;
      const y = (Math.floor(cell / COLS) + 0.2 + 0.6 * this.rng()) / ROWS;
      return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, kind: (i < counted ? this.kind : 1 - this.kind) as 0 | 1 };
    });
    const wrong = nearNumbers(counted, 3, 1, this.rng);
    const mixed = shuffleChoices([counted, ...wrong], 0, this.rng);
    return {
      showS: Math.min(SHOW_MAX_S, Math.max(SHOW_MIN_S, SHOW_BASE_S + SHOW_PER_ITEM_S * total)),
      allowedS: Math.max(ALLOWED_MIN_S, ALLOWED_START_S - ALLOWED_GAIN_S * asked),
      text: '',
      choices: mixed.items.map(String),
      answer: mixed.answer,
    };
  }

  snapshot(): CountingSnapshot {
    return { id: 'counting', ...this.quizFields(), items: this.stage === 'show' ? this.items.map((i) => ({ ...i })) : [], kind: this.kind };
  }
}
