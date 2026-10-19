import { COLOR_MATCH_PANELS, type ColorMatchPrompt, type ColorMatchSnapshot, type ColorMatchStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const ROUND_S = 30;
/** A moment before the first prompt, so there is time to get ready. */
const FIRST_PROMPT_S = 0.8;
/** How long each prompt waits for answers: starts roomy and gets shorter, down to a floor. */
const PROMPT_START_S = 3;
const PROMPT_GAIN_S = 0.055; // per second of the round
const PROMPT_MIN_S = 1.4;
/** After a prompt is done, the result shows for this long before the next one. */
const BETWEEN_S = 0.45;
/** Answering within this share of the time allowed scores a bonus point. */
const QUICK_SHARE = 0.4;
/** A wrong tap costs this many points (never below zero). */
const WRONG_COST = 1;

interface Matcher extends RoundPlayer {
  score: number;
  /** Answered the current prompt (their first tap counts). */
  answered: boolean;
  /** Whether that answer was right (null before they answer). */
  right: boolean | null;
}

/** A colour name is shown in a different ink colour; tap the panel that matches the ink, not the word. Everyone is
 * shown the same prompts at the same time. A right answer scores a point (two if it is quick), a wrong one costs a point, and
 * only your first tap on a prompt counts. When the 30 seconds are up, most points wins. See RoundGame for how rounds
 * start and end. */
export class ColorMatchGame extends RoundGame<Matcher> {
  readonly id = 'colormatch' as const;
  private stage: ColorMatchStage = 'prompt';
  private prompt: ColorMatchPrompt = { word: 0, ink: 1, n: 0 };
  /** Seconds the current prompt has been up, and how long it waits in all. */
  private elapsed = 0;
  private allowed = PROMPT_START_S;
  /** Seconds before the first prompt, or between prompts. */
  private wait = 0;
  private asked = 0;

  /** The score shown for the round: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected override get ownLimitS(): number {
    return ROUND_S;
  }

  protected createPlayer(id: string, alive: boolean): Matcher {
    return { id, score: 0, answered: false, right: null, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Matcher): void {
    p.score = 0;
    p.answered = false;
    p.right = null;
  }

  protected resetCourse(): void {
    this.stage = 'between';
    this.prompt = { word: 0, ink: 1, n: 0 };
    this.elapsed = 0;
    this.allowed = PROMPT_START_S;
    this.wait = 0;
    this.asked = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.wait = FIRST_PROMPT_S;
  }

  input(): void {
    // The panels are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a panel is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || this.stage !== 'prompt' || !p || !p.alive || p.answered) return;
    if (!Number.isInteger(target) || target < 0 || target >= COLOR_MATCH_PANELS) return;
    p.answered = true;
    p.right = target === this.prompt.ink;
    if (p.right) p.score += this.elapsed <= this.allowed * QUICK_SHARE ? 2 : 1;
    else p.score = Math.max(0, p.score - WRONG_COST);
  }

  snapshot(): ColorMatchSnapshot {
    return {
      id: 'colormatch',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      prompt: { ...this.prompt },
      promptLeftMs: this.stage === 'prompt' ? Math.max(0, Math.round((this.allowed - this.elapsed) * 1000)) : 0,
      promptTotalMs: Math.round(this.allowed * 1000),
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0, answered: p.answered, right: p.right })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    if (this.stage === 'between') {
      this.wait -= dt;
      if (this.wait <= 0) this.nextPrompt(seconds);
    } else {
      this.elapsed += dt;
      const everyone = [...this.players.values()].filter((p) => p.alive);
      if (this.elapsed >= this.allowed || (everyone.length > 0 && everyone.every((p) => p.answered))) {
        this.stage = 'between';
        this.wait = BETWEEN_S;
      }
    }
    if (seconds >= ROUND_S) this.finishRound();
  }

  protected override limitReached(): void {
    this.finishRound();
  }

  private nextPrompt(seconds: number): void {
    const ink = Math.floor(this.rng() * COLOR_MATCH_PANELS);
    // The word names a different colour, so reading it is a trap.
    const word = (ink + 1 + Math.floor(this.rng() * (COLOR_MATCH_PANELS - 1))) % COLOR_MATCH_PANELS;
    this.prompt = { word, ink, n: ++this.asked };
    this.allowed = Math.max(PROMPT_MIN_S, PROMPT_START_S - PROMPT_GAIN_S * seconds);
    this.elapsed = 0;
    this.stage = 'prompt';
    for (const p of this.players.values()) {
      p.answered = false;
      p.right = null;
    }
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
