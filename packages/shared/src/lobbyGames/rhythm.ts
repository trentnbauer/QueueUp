import { ENDLESS_LIVES, RHYTHM_LANES, type RhythmJudge, type RhythmNote, type RhythmSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** The beat: slow enough to find at the start and quicker over `RAMP_S`, then no quicker. Beats per minute; a note falls on each beat. */
const BPM = [100, 190] as const;
/** How long a note takes to fall to the line (a warning), shorter as it speeds up. */
const FALL_S = [1.4, 0.8] as const;
const RAMP_S = 40;
/** From this many seconds in, some beats have two notes at once (two lanes), more and more often, up to this share. */
const CHORDS_FROM_S = 10;
const CHORDS_OVER_S = 20;
const CHORD_SHARE = 0.4;
/** A tap within this of a note's time hits it: closer than GREAT is great (two points), the rest is good (one). */
const GREAT_S = 0.06;
const GOOD_S = 0.12;
/** The first note comes after this long, so there is a moment to get going. */
const FIRST_S = 2;
/** What a tap or a miss said, and for how long it stays on screen (the view reads `agoMs`). */
const LASTING_MS = 600;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;
const along = (seconds: number) => Math.min(1, Math.max(0, seconds / RAMP_S));

interface Note {
  n: number;
  lane: number;
  /** Seconds into the run when it reaches the line, and how long it took to fall. */
  at: number;
  fallS: number;
}

interface Dancer extends RoundPlayer {
  score: number;
  lives: number;
  /** The notes (by number) they have hit or missed already. */
  done: Set<number>;
  /** What their last tap or miss was, and when (seconds into the run). */
  last: { kind: RhythmJudge; lane: number; at: number } | null;
}

/** Notes fall down four lanes to a line, one on each beat of a beat that gets quicker (and from ten seconds in, some beats have two); tap the lane
 * as a note reaches the line. A tap within a fifth of a second either side hits it (closer is worth more), a note that gets past, or a tap
 * where there is no note, costs a life, and three lives is the end of your run. Everyone plays the same notes, and players never touch,
 * so each device works out its own hits (see RoundGame.clientSim). Last one in wins; alone it is a high score (points). See
 * RoundGame for how runs start and end. */
export class RhythmGame extends RoundGame<Dancer> {
  readonly id = 'rhythm' as const;
  private notes: Note[] = [];
  private spawned = 0;
  /** When (seconds into the run) the next beat is. */
  private nextAt = FIRST_S;

  get clientSim(): boolean {
    return true;
  }

  /** The most points anyone has, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected readReport(p: Dancer, f: Record<string, number>): void {
    // Points and lives only move the way they can: up by a hit's worth, down by one at a time.
    p.score = Math.max(p.score, Math.min(Math.floor(RoundGame.num(f.s, p.score)), p.score + 4));
    p.lives = Math.max(0, Math.min(p.lives, Math.floor(RoundGame.num(f.l, p.lives))));
  }

  protected writeReport(p: Dancer): Record<string, number> {
    return { s: p.score, l: p.lives };
  }

  protected createPlayer(id: string, alive: boolean): Dancer {
    return { id, score: 0, lives: ENDLESS_LIVES, done: new Set(), last: null, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Dancer): void {
    p.score = 0;
    p.lives = ENDLESS_LIVES;
    p.done = new Set();
    p.last = null;
  }

  protected resetCourse(): void {
    this.notes = [];
    this.spawned = 0;
    this.nextAt = FIRST_S;
    this.lay(0);
  }

  protected beginCourse(): void {
    // The first notes were laid when the countdown began.
  }

  input(): void {
    // The four lanes are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a lane is all there is to do.
  }

  protected override knockOut(p: Dancer): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  /** At the time cap whoever is still in keeps their points, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = p.score;
    this.endRun(null);
  }

  /** Lays every beat up to a little after `seconds` plus the longest a note takes to fall, so it is on screen in good time. */
  private lay(seconds: number): void {
    while (this.nextAt <= seconds + FALL_S[0] + 0.2) {
      const d = along(this.nextAt);
      // Always the same three random numbers for each beat, so one beat does not change the ones after it.
      const [first, chord, second] = [this.rng(), this.rng(), this.rng()];
      const share = CHORD_SHARE * Math.min(1, Math.max(0, (this.nextAt - CHORDS_FROM_S) / CHORDS_OVER_S));
      const lane = Math.floor(first * RHYTHM_LANES);
      const fallS = lerp(FALL_S, d);
      this.notes.push({ n: ++this.spawned, lane, at: this.nextAt, fallS });
      if (chord < share) {
        // Another lane, never the same one.
        const other = (lane + 1 + Math.floor(second * (RHYTHM_LANES - 1))) % RHYTHM_LANES;
        this.notes.push({ n: ++this.spawned, lane: other, at: this.nextAt, fallS });
      }
      this.nextAt += 60 / lerp(BPM, d);
    }
  }

  tap(userId: string, lane: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || !this.simulated(p)) return;
    if (!Number.isInteger(lane) || lane < 0 || lane >= RHYTHM_LANES) return;
    const t = this.roundMs / 1000;
    // The nearest note in this lane that is within reach and not done.
    let best: Note | null = null;
    for (const note of this.notes) {
      if (note.lane !== lane || p.done.has(note.n) || Math.abs(note.at - t) > GOOD_S) continue;
      if (!best || Math.abs(note.at - t) < Math.abs(best.at - t)) best = note;
    }
    if (!best) {
      // Nothing to hit: a wasted tap costs a life, so mashing every lane does not work.
      p.last = { kind: 'wrong', lane, at: t };
      this.loseLife(p);
      return;
    }
    p.done.add(best.n);
    const great = Math.abs(best.at - t) <= GREAT_S;
    p.score += great ? 2 : 1;
    p.last = { kind: great ? 'great' : 'good', lane, at: t };
  }

  private loseLife(p: Dancer): void {
    if (--p.lives <= 0) this.knockOut(p);
  }

  snapshot(): RhythmSnapshot {
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    return {
      id: 'rhythm',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      bpm: Math.round(lerp(BPM, along(t))),
      notes: this.notes
        .filter((x) => x.at - x.fallS <= t + 0.001 && x.at + GOOD_S + 0.4 >= t)
        .map((x): RhythmNote => ({ n: x.n, lane: x.lane, inMs: Math.round((x.at - t) * 1000), fallMs: Math.round(x.fallS * 1000) })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.outAtMeters,
        lives: p.lives,
        // The notes in view that this player has already hit or let go by, so their own screen can clear them.
        done: [...p.done].filter((n) => this.notes.some((x) => x.n === n)),
        last: p.last && t - p.last.at <= LASTING_MS / 1000 ? { kind: p.last.kind, lane: p.last.lane, agoMs: Math.round((t - p.last.at) * 1000) } : null,
      })),
    };
  }

  protected advance(): void {
    const t = this.roundMs / 1000;
    this.lay(t);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      // A note that got past the line without a tap costs a life.
      for (const note of this.notes) {
        if (note.at + GOOD_S >= t || p.done.has(note.n)) continue;
        p.done.add(note.n);
        p.last = { kind: 'miss', lane: note.lane, at: t };
        this.loseLife(p);
        if (!p.alive) break;
      }
    }
    // Forget notes everyone is well past, and what the players did with them.
    const gone = this.notes.filter((x) => x.at + GOOD_S + 1 < t).map((x) => x.n);
    if (gone.length > 0) {
      this.notes = this.notes.filter((x) => !gone.includes(x.n));
      for (const p of this.players.values()) for (const n of gone) p.done.delete(n);
    }
  }
}
