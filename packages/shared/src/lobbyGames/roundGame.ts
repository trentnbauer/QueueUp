import { LOBBY_HISTORY_LENGTH, LOBBY_REPORT_FIELDS_MAX, type LobbyGameId, type LobbyGameSnapshot, type LobbyRoundPhase, type LobbySim, type LobbyRunScore, type RoundSummary, type RunResult } from '../spinLobby.js';
import type { LobbyGame } from './types.js';

const COUNTDOWN_MS = 3000;
const OVER_MS = 4000;
/** Physics runs in steps no longer than this, so a slow tick cannot skip over an obstacle. */
const MAX_STEP_S = 1 / 60;
const METERS_PER_SCREEN = 20;
/** A client-sim player who has sent no report for this long is taken to be gone (a hung or closed tab). */
const REPORT_TIMEOUT_MS = 3000;

/** What a lobby remembers across runs, however many different games it has played: the run number, the
 * last results, each game's best run, and each person's wins. It belongs to the lobby, not to a game,
 * so changing game (a room's lobby picks a new one after every run; a person practising picks one)
 * keeps the scoreboard. */
export class LobbyRecord {
  /** The number of the run that is on (or was last on). */
  run = 0;
  /** The last LOBBY_HISTORY_LENGTH finished runs, oldest first, from every game played. */
  readonly history: RunResult[] = [];
  /** The furthest run so far, per game: metres, coins and swings cannot be compared with each other. */
  readonly best = new Map<LobbyGameId, RunResult>();
  /** Runs won, per person, since they joined the lobby. */
  readonly wins = new Map<string, number>();

  /** Someone left the lobby for good: their wins go with them. */
  forget(userId: string): void {
    this.wins.delete(userId);
  }

  /** Adds a finished run, and makes it the game's best if it went furthest. */
  add(result: RunResult): void {
    this.history.push(result);
    if (this.history.length > LOBBY_HISTORY_LENGTH) this.history.shift();
    const best = this.best.get(result.game);
    if (!best || result.meters > best.meters) this.best.set(result.game, { ...result });
  }
}

/** What every player in a round-based game has. */
export interface RoundPlayer {
  id: string;
  /** Still in the current run. False once knocked out, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Metres at the moment they were knocked out. */
  outAtMeters: number;
}

/** A number in [0, 1) from the cryptographic source. Seeds and anything hidden come from here, never
 * Math.random, whose state can be worked out from a few outputs (see "Randomness and secrets" in docs/minigames.md). */
export function secureRandom(): number {
  // 52 random mantissa bits under a fixed exponent make a double in [1, 2), so every value is equally likely
  // (no division or rounding of the random bits). Little-endian: word 1 is the high half.
  const words = globalThis.crypto.getRandomValues(new Uint32Array(2));
  words[1] = (words[1] >>> 12) | 0x3ff00000;
  return new Float64Array(words.buffer)[0] - 1;
}

/** A small seeded generator, so a course is the same for everyone and tests can replay one. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The run lifecycle that "everyone on one course" games share: wait for a player, count down, run
 * until one player (or none) is left standing, show the result, start again. A game fills in its
 * players, its course and its physics; this takes care of the phases.
 *
 * - With several runners the last one standing wins; alone it is a high-score run (no winner).
 * - Someone who joins mid-run watches it and plays from the next one.
 * - The course comes from a seed, so everyone sees the same thing and tests can replay it. */
export abstract class RoundGame<P extends RoundPlayer> implements LobbyGame {
  abstract readonly id: LobbyGameId;
  protected readonly players = new Map<string, P>();
  protected phase: LobbyRoundPhase = 'lobby';
  protected timerMs = 0;
  /** Milliseconds into the current run. */
  protected roundMs = 0;
  /** How far the course has scrolled, in screens. */
  protected distance = 0;
  protected winnerId: string | null = null;
  protected rng: () => number;
  /** The seed the current run's course comes from. */
  protected seed = 0;
  /** Server side of a client-sim game: the players who report their own state, and the run time (ms) of
   * their last report. The server does not work out these players' movement. */
  private readonly reported = new Map<string, number>();
  /** Client side: this is a one-person copy of the run, driven by the server's seed and clock. It has no
   * result of its own and carries on after the player is out, so they can watch the others. */
  private localRun = false;
  /** How many players started the current run (a solo run has no winner). */
  protected startedWith = 0;
  /** Set by the lobby that owns the game: called when the result screen is over and the next run would
   * start. Return true if the lobby has moved everyone to another game (this one is then finished),
   * false to carry on with another run of this game. */
  onRunOver: (() => boolean) | undefined;
  /** A cap on how long a run can last, in seconds, set by the lobby (null for none beyond the game's own). */
  timeLimitS: number | null = null;
  /** Set by whatever records high scores: called when a run ends, with every real player's score. */
  onRunScores: ((scores: LobbyRunScore[]) => void) | undefined;

  constructor(
    protected readonly seedSource: () => number = secureRandom,
    /** The run number, results and wins, shared with whichever games the lobby plays. */
    protected readonly record: LobbyRecord = new LobbyRecord(),
  ) {
    this.seed = Math.floor(this.seedSource() * 4294967296);
    this.rng = mulberry32(this.seed);
  }

  /** The game's player record for someone arriving. `alive` is false when they arrive mid-run. */
  protected abstract createPlayer(id: string, alive: boolean): P;
  /** Puts a player back at the start for a new run. */
  protected abstract resetPlayer(p: P): void;
  /** Clears the course (called when a countdown starts, after the seed is renewed). */
  protected abstract resetCourse(): void;
  /** Sets up the first obstacles when the countdown ends. */
  protected abstract beginCourse(): void;
  /** Moves the course and the players on by `dt` seconds. Call `knockOut` for anyone who is hit. */
  protected abstract advance(dt: number): void;
  abstract input(userId: string, dx: number, dy: number): void;
  abstract action(userId: string, name: string): void;

  /** Presses that were made at a moment of the run that this game has not reached yet (see `inputAt`), in the order they are due. */
  private due: { at: number; apply: () => void }[] = [];

  inputAt(userId: string, run: number, at: number, dx: number, dy: number): void {
    this.dueAt(run, at, () => this.input(userId, dx, dy));
  }

  actionAt(userId: string, run: number, at: number, name: string): void {
    this.dueAt(run, at, () => this.action(userId, name));
  }

  /** Applies a press now if its moment has come (or it makes no sense to wait), otherwise when the run reaches it. */
  private dueAt(run: number, at: number, apply: () => void): void {
    if (run !== this.record.run) return;
    const waiting = this.phase === 'countdown' || (this.phase === 'playing' && at > this.roundMs);
    // A moment far ahead cannot be real, and a long queue is not worth keeping: treat them as due now.
    if (!waiting || !Number.isFinite(at) || at > (this.phase === 'playing' ? this.roundMs : 0) + 5000 || this.due.length >= 256) {
      apply();
      return;
    }
    const entry = { at, apply };
    const i = this.due.findIndex((d) => d.at > at);
    if (i === -1) this.due.push(entry);
    else this.due.splice(i, 0, entry);
  }
  /** Tap targets are optional: a game that has them overrides this. */
  tap(_userId: string, _target: number): void {}
  abstract snapshot(viewer?: string): LobbyGameSnapshot;

  // ---- Client-sim games: each player's own movement is worked out on their own device ---------------

  /** A game whose players do not affect each other overrides this to true, and supplies `readReport` and
   * `writeReport`, and skips players that are not `simulated` in `advance`. */
  get clientSim(): boolean {
    return false;
  }

  /** Puts a report's fields into the player (the server side). Validate: clients are trusted to be honest,
   * not to send well-formed data. Use `RoundGame.num`. */
  protected readReport(_p: P, _f: Record<string, number>): void {}

  /** The player's own fields as a report (the client side). */
  protected writeReport(_p: P): Record<string, number> {
    return {};
  }

  /** A finite number from untrusted data, or `fallback`. */
  protected static num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e4, Math.min(1e4, v)) : fallback;
  }

  /** Whether the game works out this player's movement here. False for a player whose own device does. */
  protected simulated(p: P): boolean {
    return !this.reported.has(p.id);
  }

  /** The run that is about to start or is on, with the seed its course comes from. */
  simStart(): LobbySim | null {
    if (!this.clientSim) return null;
    if (this.phase === 'countdown') return { run: this.record.run, seed: this.seed, startInMs: Math.round(this.timerMs) };
    if (this.phase === 'playing') return { run: this.record.run, seed: this.seed, startInMs: -Math.round(this.roundMs) };
    return null;
  }

  /** A person's report of their own player. Only the current run counts, only from someone still in,
   * and a report that has no fields in range is ignored. The first report makes the server stop working
   * out that player's movement; reaching `alive: false` knocks them out. */
  report(userId: string, run: number, alive: boolean, f: Record<string, number>): void {
    if (!this.clientSim || run !== this.record.run || (this.phase !== 'playing' && this.phase !== 'countdown')) return;
    if (!f || typeof f !== 'object' || Object.keys(f).length > LOBBY_REPORT_FIELDS_MAX) return;
    const p = this.players.get(userId);
    if (!p || !p.alive) return;
    this.reported.set(userId, this.phase === 'playing' ? this.roundMs : 0);
    this.readReport(p, f);
    if (!alive && this.phase === 'playing') this.knockOut(p);
  }

  /** On the client: starts the run from the server's seed, as it began there. */
  startRunAt(seed: number): void {
    this.localRun = true;
    this.prepareRun(seed);
    this.beginRun();
  }

  /** On the client: one fixed step of the run, for whoever is keeping the time. */
  stepRun(dt: number): void {
    if (this.phase === 'playing') this.step(dt);
  }

  /** On the client: how far into the run it is, in milliseconds. */
  get runMs(): number {
    return this.roundMs;
  }

  /** On the client: one player's own state, to report. */
  localReport(userId: string): { alive: boolean; f: Record<string, number> } | null {
    const p = this.players.get(userId);
    return p ? { alive: p.alive, f: this.writeReport(p) } : null;
  }

  /** How long a run lasts at most by the game's own rules, in seconds, or null if it goes on until it is beaten. */
  protected get ownLimitS(): number | null {
    return null;
  }

  /** The cap on a run right now, in seconds: the game's own or the lobby's, whichever is shorter; null for none. */
  protected get limitS(): number | null {
    const caps = [this.ownLimitS, this.timeLimitS].filter((s): s is number => typeof s === 'number');
    return caps.length > 0 ? Math.min(...caps) : null;
  }

  /** Milliseconds left of the cap while playing; 0 when there is none (or not playing). */
  protected get leftMs(): number {
    const limit = this.limitS;
    return limit === null || this.phase !== 'playing' ? 0 : Math.max(0, Math.round(limit * 1000 - this.roundMs));
  }

  /** The run number, recent results and best run, for the game's snapshot. */
  protected summary(): RoundSummary {
    const best = this.record.best.get(this.id);
    const limit = this.limitS;
    return { run: this.record.run, history: this.record.history.map((r) => ({ ...r })), best: best ? { ...best } : null, limitMs: limit === null ? 0 : Math.round(limit * 1000) };
  }

  /** The run has reached the cap (see `limitS`). A game that scores points ends it by its own count; by
   * default whoever is still in keeps what they have got so far, and nobody wins. */
  protected limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = this.meters;
    this.endRun(null);
  }

  /** Metres run so far. */
  protected get meters(): number {
    return Math.floor(this.distance * METERS_PER_SCREEN);
  }

  protected knockOut(p: P): void {
    if (!p.alive) return;
    p.alive = false;
    p.outAtMeters = this.meters;
  }

  join(userId: string): void {
    if (this.players.has(userId)) return;
    // Someone who arrives mid-run watches it, and runs from the next one.
    const p = this.createPlayer(userId, this.phase !== 'playing' && this.phase !== 'over');
    p.wins = this.record.wins.get(userId) ?? 0;
    this.players.set(userId, p);
    if (this.phase === 'lobby') this.startCountdown();
  }

  leave(userId: string): void {
    this.players.delete(userId);
    if (this.players.size === 0) {
      this.phase = 'lobby';
      return;
    }
    if (this.phase === 'playing') this.checkRunEnd();
  }

  tick(dtMs: number): void {
    let left = Math.min(dtMs, 250) / 1000;
    while (left > 1e-9) {
      const step = Math.min(left, MAX_STEP_S);
      left -= step;
      this.step(step);
    }
  }

  private step(dt: number): void {
    switch (this.phase) {
      case 'lobby':
        break;
      case 'countdown':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) this.beginRun();
        break;
      case 'playing':
        // Presses made at (or before) this moment of the run happen just before it moves on.
        while (this.due.length > 0 && this.due[0].at <= this.roundMs + 1e-6) this.due.shift()!.apply();
        this.roundMs += dt * 1000;
        this.advance(dt);
        if (this.phase === 'playing' && this.timeLimitS !== null && this.roundMs >= this.timeLimitS * 1000) this.limitReached();
        for (const [id, last] of this.reported) {
          const p = this.players.get(id);
          if (p?.alive && this.roundMs - last > REPORT_TIMEOUT_MS) this.knockOut(p);
        }
        this.checkRunEnd();
        break;
      case 'over':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) {
          if (this.players.size === 0) this.phase = 'lobby';
          else if (this.onRunOver?.()) {
            // The lobby has taken everyone to another game; this one is done and does nothing more.
            this.players.clear();
            this.phase = 'lobby';
          } else this.startCountdown();
        }
        break;
    }
  }

  /** A run ends when one runner (or none) is left; alone, when you are out. */
  protected checkRunEnd(): void {
    if (this.phase !== 'playing' || this.localRun) return;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length > (this.startedWith > 1 ? 1 : 0)) return;
    this.endRun(this.startedWith > 1 && alive.length === 1 ? alive[0] : null);
  }

  /** Ends the run now, with `winner` (or nobody) winning. For games that end on something other than
   * running out of players, such as a timer: set each player's `outAtMeters` first if the result should
   * show their own score. */
  protected endRun(winner: P | null): void {
    if (this.phase !== 'playing' || this.localRun) return;
    this.phase = 'over';
    this.timerMs = OVER_MS;
    this.winnerId = winner?.id ?? null;
    if (winner) {
      winner.wins++;
      this.record.wins.set(winner.id, winner.wins);
      winner.outAtMeters = this.meters;
    }
    this.recordResult();
  }

  /** Adds the run that just ended to the history: who got furthest, and how far. */
  private recordResult(): void {
    // A winner's own score is the run's, even if someone who was knocked out earlier had counted more.
    let furthest: P | null = (this.winnerId && this.players.get(this.winnerId)) || null;
    if (!furthest) for (const p of this.players.values()) if (!furthest || p.outAtMeters > furthest.outAtMeters) furthest = p;
    const result: RunResult = { id: furthest?.id ?? '', winnerId: this.winnerId, meters: furthest?.outAtMeters ?? 0, game: this.id };
    if (!furthest) return;
    this.record.add(result);
    this.reportScores();
  }

  /** Hands each real player's score (bot ids start `bot:`, see bots.ts, which this file cannot import) to whatever records high scores. Bots, and people who only watched
   * the run (they arrived mid-run, so they have nothing), are left out. */
  protected runScore(p: P): number {
    return p.outAtMeters;
  }

  private reportScores(): void {
    if (!this.onRunScores) return;
    const scores: LobbyRunScore[] = [];
    for (const p of this.players.values()) {
      const score = this.runScore(p);
      if (p.id.startsWith('bot:') || !Number.isFinite(score) || score <= 0) continue;
      scores.push({ userId: p.id, score: Math.floor(score) });
    }
    if (scores.length > 0) this.onRunScores(scores);
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.record.run++;
    this.timerMs = COUNTDOWN_MS;
    this.prepareRun(Math.floor(this.seedSource() * 4294967296));
  }

  /** Puts the course and everyone back at the start, for the run that the seed makes. */
  private prepareRun(seed: number): void {
    this.winnerId = null;
    this.distance = 0;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.reported.clear();
    this.due = [];
    this.resetCourse();
    for (const p of this.players.values()) {
      p.alive = true;
      p.outAtMeters = 0;
      this.resetPlayer(p);
    }
  }

  private beginRun(): void {
    this.phase = 'playing';
    this.timerMs = 0;
    this.roundMs = 0;
    this.distance = 0;
    this.startedWith = [...this.players.values()].filter((p) => p.alive).length;
    this.beginCourse();
  }
}
