import { STACKER_COLS, STACKER_KEEP_ROWS, type StackerLocked, type StackerSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** A run ends at this time if someone is still in, so one that never ends cannot hold a lobby for ever. */
/** How wide the target is on the lowest rows, in squares, and how the rows narrow going up: one square
 * narrower every `ROWS_PER_NARROWING` rows, down to `MIN_WIDTH`, and then, far up, a single square. */
const START_WIDTH = 5;
const ROWS_PER_NARROWING = 2;
const MIN_WIDTH = 2;
const SINGLE_FROM_ROW = 18;
/** The light's speed in squares a second on the first row, and how much faster it is each row up. It gains quickly
 * to `SPEED_FAST` (about row 8: 6.5 + 0.7 a row), then keeps gaining, more slowly, with no top speed, so the
 * tower never stops getting faster. */
const SPEED_START = 6.5;
const SPEED_GAIN = 0.7;
const SPEED_FAST = 12;
const SPEED_LATE_GAIN = 0.4;
/** How loose a press may be is capped where it was when the light was at its old top speed (22 squares a second), so a light that keeps getting faster does not get easier to hit. */
const TOLERANCE_MAX = 0.66;
/** A press counts if the light is within this many squares of the target's edges: a tick or two of slack for a slow
 * connection, and never less than the light moves in a little under half a server tick (which is how often its place
 * is worked out), so a fast light is not judged unfairly. */
const TOLERANCE = 0.3;
const TOLERANCE_PER_SPEED = 0.03;
/** After a row is locked, presses are ignored for this long. Two people who press together both meant the
 * row that was just won; the second must not be judged against the new, narrower one and knocked out. */
const GRACE_S = 0.35;
/** A run ends if nobody presses the button for this long (everyone is away), so an idle lobby moves on. */
const IDLE_LIMIT_S = 20;

interface Stacker extends RoundPlayer {
  /** Rows locked in this run. */
  score: number;
  /** Was in the run when it started (someone who arrived part way through only watches). */
  inRun: boolean;
}

/** The target's width on row `row` (0 is the bottom). */
export function targetWidth(row: number): number {
  if (row >= SINGLE_FROM_ROW) return 1;
  return Math.max(MIN_WIDTH, START_WIDTH - Math.floor(row / ROWS_PER_NARROWING));
}

/** The light's speed on row `row`, in squares a second. */
export function lightSpeed(row: number): number {
  const early = SPEED_START + SPEED_GAIN * row;
  if (early <= SPEED_FAST) return early;
  const rowsToFast = (SPEED_FAST - SPEED_START) / SPEED_GAIN;
  return SPEED_FAST + SPEED_LATE_GAIN * (row - rowsToFast);
}

/** How far outside the target's edges a press still counts, in squares, on row `row`. */
export function pressTolerance(row: number): number {
  return Math.min(TOLERANCE_MAX, Math.max(TOLERANCE, TOLERANCE_PER_SPEED * lightSpeed(row)));
}

/** One tower and one light for everyone. A light bounces along the current row; press as it passes over the
 * target squares. The first press that lands locks the row for the whole room: that player scores it and
 * everyone moves up to a narrower row with a faster light. A press that misses knocks that player out.
 * The tower has no top, so it goes on for as long as someone can keep climbing; the run ends when everyone is
 * out or time is up, and most rows locked wins. See
 * RoundGame for how runs start and end. */
export class StackerGame extends RoundGame<Stacker> {
  readonly id = 'stacker' as const;
  private locked: StackerLocked[] = [];
  private target: { start: number; w: number } | null = null;
  /** How far the light has travelled in all; its place along the row bounces between 0 and the width. */
  private travelled = 0;
  private grace = 0;
  /** Seconds since anyone last pressed the button. */
  private quiet = 0;

  /** The score shown for the run: the most rows anyone has locked. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.inRun && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Stacker {
    return { id, score: 0, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Stacker): void {
    p.score = 0;
    p.inRun = false;
  }

  protected resetCourse(): void {
    this.locked = [];
    this.target = null;
    this.travelled = 0;
    this.grace = 0;
    this.quiet = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    for (const p of this.players.values()) p.inRun = p.alive;
    this.target = this.makeTarget(0);
  }

  /** The target for row `row`. The first row can be anywhere; every row after it stands on the one below, as in
   * Stacker: a narrower row sits somewhere within the squares of the row under it, and a row as wide as the one
   * below can shift by a single square (still resting on it). So the tower grows straight up from where it
   * began, not to wherever the field has room. */
  private makeTarget(row: number): { start: number; w: number } {
    const w = targetWidth(row);
    const below = this.locked[row - 1];
    if (!below) return { start: Math.floor(this.rng() * (STACKER_COLS - w + 1)), w };
    // How far the new row may stick out past either end of the one below: none if it is narrower, else one
    // square (and never so far that it would not touch the row below at all).
    const slack = w < below.w ? 0 : w >= 2 ? 1 : 0;
    const lo = Math.max(0, below.start - slack);
    const hi = Math.min(STACKER_COLS - w, below.start + below.w - w + slack);
    return { start: lo + Math.floor(this.rng() * (hi - lo + 1)), w };
  }

  /** Where the light is along the row, 0 to STACKER_COLS. */
  private get light(): number {
    const period = STACKER_COLS * 2;
    const t = this.travelled % period;
    return t <= STACKER_COLS ? t : period - t;
  }

  input(): void {
    // One button: there is no direction to hold.
  }

  action(userId: string, name: string): void {
    if (name !== 'stop') return;
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || !p.inRun || !this.target) return;
    this.quiet = 0;
    if (this.grace > 0) return;
    const light = this.light;
    const { start, w } = this.target;
    const tolerance = pressTolerance(this.locked.length);
    if (light >= start - tolerance && light <= start + w + tolerance) {
      p.score++;
      this.locked.push({ start, w, by: [...this.players.keys()].indexOf(userId) });
      this.grace = GRACE_S;
      this.target = this.makeTarget(this.locked.length);
      return;
    }
    p.outAtMeters = p.score;
    this.knockOut(p);
    p.outAtMeters = p.score;
    this.checkRunEnd();
  }

  snapshot(): StackerSnapshot {
    // Only the rows in view are sent: the tower can be as tall as people can climb.
    const first = Math.max(0, this.locked.length - STACKER_KEEP_ROWS);
    return {
      id: 'stacker',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      locked: this.locked.slice(first).map((l) => ({ ...l })),
      first,
      target: this.target && this.phase === 'playing' ? { ...this.target } : null,
      light: Math.round(this.light * 100) / 100,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.inRun ? p.score : 0 })),
    };
  }

  protected advance(dt: number): void {
    this.quiet += dt;
    if (this.quiet >= IDLE_LIMIT_S) return this.finishRun();
    this.grace = Math.max(0, this.grace - dt);
    this.travelled += lightSpeed(this.locked.length) * dt;
  }

  protected override limitReached(): void {
    this.finishRun();
  }

  /** Ends the run when nobody who started it is still in. */
  protected override checkRunEnd(): void {
    if (this.phase !== 'playing') return;
    if (![...this.players.values()].some((p) => p.inRun && p.alive)) this.finishRun();
  }

  /** The run is over (everyone out, or time up): most rows locked wins; a tie, a run with
   * no rows and a solo run have no winner. */
  private finishRun(): void {
    const racers = [...this.players.values()].filter((p) => p.inRun);
    for (const p of racers) p.outAtMeters = p.score;
    const best = Math.max(0, ...racers.map((p) => p.score));
    const leaders = racers.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }
}
