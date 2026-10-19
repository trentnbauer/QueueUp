import { ENDLESS_LIVES, type TempoBeat, type TempoJudge, type TempoSnapshot, type TempoStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** A round is a few guide beats at its tempo (ticks everyone can see), then a stretch with no ticks in which to keep tapping the same tempo. */
const GUIDE_BEATS = 4;
/** The silent stretch is this many beats in the first round and one more each round, up to this many. */
const SILENT_FIRST = 4;
const SILENT_MAX = 14;
/** A round's tempo (beats a minute): it picks up each round, never the same twice running, within these limits. */
const BPM_START = 84;
const BPM_PER_ROUND = 7;
const BPM_MIN = 80;
const BPM_MAX = 150;
const BPM_WOBBLE = 18;
/** How near a tap has to be to the beat (seconds): a tap within TOL is on it, within half of TOL is right on it. It narrows each round, over this many, to its floor. */
const TOL = [0.15, 0.05] as const;
const TOL_ROUNDS = 6;
/** A pause between rounds. */
const REST_S = 1.2;
/** The first round starts after this long, so there is a moment to get ready. */
const FIRST_S = 1.2;
/** What a tap or a miss said stays up this long (the view reads `agoMs`). */
const LASTING_MS = 700;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;

interface Beat {
  n: number;
  round: number;
  /** Which silent beat of its round this is (0 first), or -1 for a guide beat. */
  k: number;
  /** Seconds into the run when it falls. */
  at: number;
}

interface Round {
  round: number;
  bpm: number;
  period: number;
  tol: number;
  start: number;
  silent: number;
  /** When the silent stretch begins, and when the round is over (half a beat after the last silent beat). */
  silentAt: number;
  end: number;
}

interface Drummer extends RoundPlayer {
  score: number;
  lives: number;
  /** The silent beats (by number) they have tapped or let by. */
  done: Set<number>;
  /** How each silent beat of the round on show went for them (null before it is judged). */
  marks: (TempoJudge | null)[];
  markRound: number;
  last: { kind: TempoJudge; errMs: number; at: number } | null;
}

/** Keep the beat going when it falls silent. A round plays a few ticks at its tempo, then stops, and you carry on tapping at the same tempo for a
 * number of beats that grows every round, the tempo changing each round and the margin for error narrowing. A tap on a beat is a point (two if it is
 * right on it); a tap that is too far out, or a beat with no tap, costs a life. Three lives is the end of your run. Everyone has the same
 * rounds, and players never touch, so each device judges its own taps (see RoundGame.clientSim). Last one in wins; alone it is a high
 * score (points). See RoundGame for how runs start and end. */
export class TempoGame extends RoundGame<Drummer> {
  readonly id = 'tempo' as const;
  private rounds: Round[] = [];
  private beats: Beat[] = [];
  private spawned = 0;
  private nextStart = FIRST_S;
  private lastBpm = 0;

  get clientSim(): boolean {
    return true;
  }

  /** The most points anyone has, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected readReport(p: Drummer, f: Record<string, number>): void {
    p.score = Math.max(p.score, Math.min(Math.floor(RoundGame.num(f.s, p.score)), p.score + 4));
    p.lives = Math.max(0, Math.min(p.lives, Math.floor(RoundGame.num(f.l, p.lives))));
  }

  protected writeReport(p: Drummer): Record<string, number> {
    return { s: p.score, l: p.lives };
  }

  protected createPlayer(id: string, alive: boolean): Drummer {
    return { id, score: 0, lives: ENDLESS_LIVES, done: new Set(), marks: [], markRound: 0, last: null, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Drummer): void {
    p.score = 0;
    p.lives = ENDLESS_LIVES;
    p.done = new Set();
    p.marks = [];
    p.markRound = 0;
    p.last = null;
  }

  protected resetCourse(): void {
    this.rounds = [];
    this.beats = [];
    this.spawned = 0;
    this.nextStart = FIRST_S;
    this.lastBpm = 0;
    this.lay(0);
  }

  protected beginCourse(): void {
    // The first round was laid when the countdown began.
  }

  input(): void {
    // The arena is the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping is all there is to do.
  }

  protected override knockOut(p: Drummer): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  /** At the time cap whoever is still in keeps their points, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = p.score;
    this.endRun(null);
  }

  /** Lays the rounds (and their beats) that start before a little after `seconds`. */
  private lay(seconds: number): void {
    while (this.nextStart <= seconds + 4) {
      const round = this.rounds.length + 1;
      // Always the same random number for each round.
      const wobble = (this.rng() - 0.5) * 2 * BPM_WOBBLE;
      let bpm = Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, BPM_START + BPM_PER_ROUND * (round - 1) + wobble)));
      // Never the same tempo as the round before.
      if (bpm === this.lastBpm) bpm += bpm >= BPM_MAX ? -3 : 3;
      this.lastBpm = bpm;
      const period = 60 / bpm;
      const silent = Math.min(SILENT_MAX, SILENT_FIRST + round - 1);
      const start = this.nextStart;
      const silentAt = start + GUIDE_BEATS * period;
      const end = silentAt + (silent - 1) * period + period / 2;
      const tol = lerp(TOL, Math.min(1, (round - 1) / TOL_ROUNDS));
      this.rounds.push({ round, bpm, period, tol, start, silent, silentAt, end });
      for (let i = 0; i < GUIDE_BEATS; i++) this.beats.push({ n: ++this.spawned, round, k: -1, at: start + i * period });
      for (let k = 0; k < silent; k++) this.beats.push({ n: ++this.spawned, round, k, at: silentAt + k * period });
      this.nextStart = end + REST_S;
    }
  }

  private roundAt(t: number): Round | undefined {
    return this.rounds.find((r) => t >= r.start - 0.5 && t <= r.end + REST_S) ?? this.rounds[0];
  }

  tap(userId: string): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || !this.simulated(p)) return;
    const t = this.roundMs / 1000;
    // The silent beat this tap is nearest to, if it is within half a beat of one that has not been dealt with.
    let best: Beat | null = null;
    let bestRound: Round | undefined;
    for (const beat of this.beats) {
      if (beat.k < 0 || p.done.has(beat.n)) continue;
      const round = this.rounds[beat.round - 1];
      if (Math.abs(beat.at - t) > round.period / 2) continue;
      if (!best || Math.abs(beat.at - t) < Math.abs(best.at - t)) {
        best = beat;
        bestRound = round;
      }
    }
    // A guide tick, or a tap between rounds: nothing to judge.
    if (!best || !bestRound) return;
    const err = t - best.at;
    p.done.add(best.n);
    const kind: TempoJudge = Math.abs(err) <= bestRound.tol / 2 ? 'great' : Math.abs(err) <= bestRound.tol ? 'good' : err < 0 ? 'early' : 'late';
    this.mark(p, bestRound, best.k, kind);
    p.last = { kind, errMs: Math.round(err * 1000), at: t };
    if (kind === 'great') p.score += 2;
    else if (kind === 'good') p.score += 1;
    else this.loseLife(p);
  }

  private mark(p: Drummer, round: Round, k: number, kind: TempoJudge): void {
    if (p.markRound !== round.round) {
      p.markRound = round.round;
      p.marks = Array(round.silent).fill(null);
    }
    p.marks[k] = kind;
  }

  private loseLife(p: Drummer): void {
    if (--p.lives <= 0) this.knockOut(p);
  }

  private stageAt(t: number, round: Round | undefined): TempoStage {
    if (!round || t < round.start) return 'rest';
    if (t < round.silentAt - round.period / 2) return 'guide';
    return t <= round.end ? 'play' : 'rest';
  }

  snapshot(): TempoSnapshot {
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    const round = this.roundAt(t);
    const stage = this.phase === 'playing' ? this.stageAt(t, round) : 'rest';
    return {
      id: 'tempo',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage,
      round: round && stage !== 'rest' ? round.round : (round?.round ?? 1),
      bpm: round?.bpm ?? BPM_START,
      tolMs: Math.round((round?.tol ?? TOL[0]) * 1000),
      silent: round?.silent ?? SILENT_FIRST,
      // The guide ticks only: the silent beats are never sent, so nothing says when to tap once the ticks stop.
      ticks: this.beats
        .filter((b) => b.k < 0 && b.round === round?.round && Math.abs(b.at - t) <= 0.6)
        .map((b): TempoBeat => ({ n: b.n, inMs: Math.round((b.at - t) * 1000) })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.outAtMeters,
        lives: p.lives,
        marks: p.markRound === round?.round ? [...p.marks] : [],
        last: p.last && t - p.last.at <= LASTING_MS / 1000 ? { kind: p.last.kind, errMs: p.last.errMs, agoMs: Math.round((t - p.last.at) * 1000) } : null,
      })),
    };
  }

  protected advance(): void {
    const t = this.roundMs / 1000;
    this.lay(t);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      // A silent beat that went by with no tap near it costs a life.
      for (const beat of this.beats) {
        if (beat.k < 0 || p.done.has(beat.n)) continue;
        const round = this.rounds[beat.round - 1];
        if (beat.at + round.period / 2 >= t) continue;
        p.done.add(beat.n);
        this.mark(p, round, beat.k, 'miss');
        p.last = { kind: 'miss', errMs: 0, at: t };
        this.loseLife(p);
        if (!p.alive) break;
      }
    }
    // Forget beats everyone is well past, and what the players did with them.
    const gone = this.beats.filter((b) => b.at + 2 < t).map((b) => b.n);
    if (gone.length > 0) {
      this.beats = this.beats.filter((b) => !gone.includes(b.n));
      for (const p of this.players.values()) for (const n of gone) p.done.delete(n);
    }
  }
}
