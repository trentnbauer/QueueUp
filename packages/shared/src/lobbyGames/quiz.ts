import { ENDLESS_LIVES, QUIZ_CHOICES, type QuizPlayer, type QuizSnapshotBase, type QuizStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const ROUND_S = 30;
/** A moment before the first question, so there is time to get ready. */
const FIRST_QUESTION_S = 1.2;
/** After a question is done, the result shows for this long before the next one. */
const BETWEEN_S = 0.8;
/** Answering within this share of the time allowed scores a bonus point. */
const QUICK_SHARE = 0.4;
/** A wrong tap costs this many points in a timed round (never below zero); in an endless run it costs a life. */
const WRONG_COST = 1;

/** One question: what to look at first (for `showS` seconds, 0 for nothing), how long the four answers wait, and which of them is right. */
export interface QuizQuestion {
  /** Seconds to look before the choices come up (0 for none). */
  showS: number;
  /** Seconds the choices wait for answers. */
  allowedS: number;
  /** The question as text, or '' if the game draws it from its own fields. */
  text: string;
  choices: string[];
  answer: number;
}

interface Quizzer extends RoundPlayer {
  score: number;
  /** Answered the current question (their first tap counts). */
  answered: boolean;
  /** Whether that answer was right (null before they answer). */
  right: boolean | null;
  /** Lives left (endless runs only): a wrong answer, or none before the question runs out, costs one. */
  lives: number;
}

/** Shuffles `items` with `rng` (Fisher-Yates) and returns where `answerAt` ended up. */
export function shuffleChoices<T>(items: T[], answerAt: number, rng: () => number): { items: T[]; answer: number } {
  const out = [...items];
  let answer = answerAt;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
    if (answer === i) answer = j;
    else if (answer === j) answer = i;
  }
  return { items: out, answer };
}

/** Three wrong numbers near `answer`, all different from it and from each other, none below `floor`. They are within `spread` of it where there is room. */
export function nearNumbers(answer: number, spread: number, floor: number, rng: () => number): number[] {
  const taken = new Set<number>([answer]);
  const out: number[] = [];
  for (let tries = 0; out.length < 3 && tries < 60; tries++) {
    const offset = (1 + Math.floor(rng() * spread)) * (rng() < 0.5 ? -1 : 1);
    const n = answer + offset;
    if (n < floor || taken.has(n)) continue;
    taken.add(n);
    out.push(n);
  }
  // No room (a small answer next to the floor): fill from just above.
  for (let n = answer + 1; out.length < 3; n++) {
    if (n >= floor && !taken.has(n)) {
      taken.add(n);
      out.push(n);
    }
  }
  return out;
}

/** A question, four answers, tap the right one: the shared rules of Maths rush, Counting and Word chain. Everyone is asked the same question at
 * the same time. A right answer scores a point (two if it is quick), and only your first tap on a question counts. With a time limit it is a 30
 * second round, a wrong answer costs a point and most points wins. With none it is endless: three lives each, a wrong answer or none in time
 * costs one, the questions keep getting quicker, and the last one standing wins. A game supplies the questions (`makeQuestion`). See RoundGame
 * for how rounds start and end. */
export abstract class QuizGame extends RoundGame<Quizzer> {
  protected stage: QuizStage = 'between';
  protected question: QuizQuestion | null = null;
  /** Questions asked so far this run. */
  protected asked = 0;
  /** Seconds into the current stage, and how long it lasts in all. */
  private elapsed = 0;
  private total = 0;
  /** Seconds before the first question, or between questions. */
  private wait = 0;

  /** The next question. Always take the same number of random numbers however the question turns out, so one question does not change the ones after it. */
  protected abstract makeQuestion(asked: number): QuizQuestion;
  /** Clears the game's own state for a new run. */
  protected abstract resetQuestions(): void;

  /** The score shown for the round: the most points anyone has, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected override get ownLimitS(): number | null {
    return this.endless ? null : ROUND_S;
  }

  protected createPlayer(id: string, alive: boolean): Quizzer {
    return { id, score: 0, answered: false, right: null, lives: ENDLESS_LIVES, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Quizzer): void {
    p.score = 0;
    p.answered = false;
    p.right = null;
    p.lives = ENDLESS_LIVES;
  }

  protected override knockOut(p: Quizzer): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  private loseLife(p: Quizzer): void {
    if (--p.lives <= 0) this.knockOut(p);
  }

  protected resetCourse(): void {
    this.stage = 'between';
    this.question = null;
    this.asked = 0;
    this.elapsed = 0;
    this.total = 0;
    this.wait = 0;
    this.resetQuestions();
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.wait = FIRST_QUESTION_S;
  }

  input(): void {
    // The panels are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a panel is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    const q = this.question;
    if (this.phase !== 'playing' || this.stage !== 'ask' || !q || !p || !p.alive || p.answered) return;
    if (!Number.isInteger(target) || target < 0 || target >= QUIZ_CHOICES) return;
    p.answered = true;
    p.right = target === q.answer;
    // Quick is judged on how long they had the question in front of them: the time it took to reach them (see `pressBehindMs`) does not count against them.
    if (p.right) p.score += Math.max(0, this.elapsed - this.pressBehindMs / 1000) <= q.allowedS * QUICK_SHARE ? 2 : 1;
    else if (this.endless) this.loseLife(p);
    else p.score = Math.max(0, p.score - WRONG_COST);
  }

  /** What every quiz snapshot carries; a game adds its `id` and whatever it draws its question from. */
  protected quizFields(): QuizSnapshotBase {
    const q = this.question;
    const asking = this.stage === 'ask' || this.stage === 'between';
    const players: QuizPlayer[] = [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : p.outAtMeters, answered: p.answered, right: p.right, lives: this.endless ? p.lives : null }));
    return {
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      asked: this.asked,
      question: q ? q.text : '',
      choices: q && asking ? [...q.choices] : [],
      answer: q && this.stage === 'between' ? q.answer : -1,
      stageLeftMs: this.stage === 'between' ? 0 : Math.max(0, Math.round((this.total - this.elapsed) * 1000)),
      stageTotalMs: this.stage === 'between' ? 0 : Math.round(this.total * 1000),
      players,
    };
  }

  protected advance(dt: number): void {
    if (this.stage === 'between') {
      this.wait -= dt;
      if (this.wait <= 0) this.nextQuestion();
    } else {
      this.elapsed += dt;
      if (this.stage === 'show') {
        if (this.elapsed >= this.total) this.startAsk();
      } else {
        const everyone = [...this.players.values()].filter((p) => p.alive);
        if (this.elapsed >= this.total || (everyone.length > 0 && everyone.every((p) => p.answered))) {
          // No answer by the time the question ran out costs a life.
          if (this.endless && this.elapsed >= this.total) for (const p of everyone) if (!p.answered) this.loseLife(p);
          this.stage = 'between';
          this.wait = BETWEEN_S;
        }
      }
    }
    if (!this.endless && this.roundMs / 1000 >= ROUND_S) this.finishRound();
  }

  protected override limitReached(): void {
    this.finishRound();
  }

  private nextQuestion(): void {
    this.question = this.makeQuestion(this.asked++);
    for (const p of this.players.values()) {
      p.answered = false;
      p.right = null;
    }
    if (this.question.showS > 0) {
      this.stage = 'show';
      this.elapsed = 0;
      this.total = this.question.showS;
    } else this.startAsk();
  }

  private startAsk(): void {
    this.stage = 'ask';
    this.elapsed = 0;
    this.total = this.question?.allowedS ?? 0;
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
