import { clampDirection, type TiltSnapshot, type TiltTarget } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** A run ends at this time if a ball is still on the beam. */
const RUN_LIMIT_S = 120;
/** How hard a player's own push moves their own ball, in beams a second squared. */
const PUSH = 0.55;
/** How hard a fully tilted beam pulls every ball downhill, in beams a second squared. */
const SLOPE = 0.55;
/** The beam leans by this much for each beam-length the balls' average sits off the middle, so balls bunched on
 * one side tip it that way, which pulls every ball (theirs and everyone else's) further down. */
const LEAN_GAIN = 2.5;
/** A ball slows down by this much a second, so it settles instead of speeding up for ever. */
const DRAG = 1.2;
const MAX_SPEED = 1.2;
/** The beam also wobbles by itself (two slow waves from the run's seed), more and more as the run goes on,
 * so a run always ends. In beams a second squared. */
const WOBBLE_START = 0.12;
const WOBBLE_GAIN = 0.008;
const WOBBLE_MAX = 0.9;
/** A target scores when a ball is this close to its middle (in beams). */
const HIT = 0.05;
const TARGET_EDGE = 0.12;
const TARGET_LIFE_S = 7;
const TARGET_FIRST_S = 1.2;
const TARGET_EVERY_S = 2.5;
const MAX_TARGETS = 2;

interface Ball extends RoundPlayer {
  dir: number;
  /** Where their ball is along the beam (0..1) and how fast it is going. */
  x: number;
  v: number;
  /** Targets scored this run. */
  score: number;
  /** Their ball rolled off (as opposed to arriving mid-run, which also leaves them not alive). */
  fell: boolean;
}

interface Target {
  x: number;
  n: number;
  left: number;
}

/** One beam, and everyone has their own ball on it. Hold left or right to push your own ball. The beam leans
 * toward where the balls are on average (and wobbles by itself), and a leaning beam pulls every ball downhill,
 * so the group tips it around together while each person fights to stay on. A ball that rolls off the end is
 * out. Targets appear on the beam: the first ball to reach one scores it. The run ends when the last ball
 * is off (or only one is left in a run with others); most targets scored wins, with a tie going to the ball
 * still standing, and alone it is a high score. See RoundGame for how runs start and end. */
export class TiltGame extends RoundGame<Ball> {
  readonly id = 'tilt' as const;
  private tilt = 0;
  private targets: Target[] = [];
  private spawned = 0;
  private spawnIn = 0;
  /** The two wobble waves: how fast each goes and where each starts, from the seed. */
  private waves: { w: number; p: number }[] = [];

  /** The score shown for the run: the most targets anyone has scored. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if ((p.alive || p.fell) && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Ball {
    return { id, dir: 0, x: 0.5, v: 0, score: 0, fell: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Ball): void {
    p.dir = 0;
    p.x = 0.5;
    p.v = 0;
    p.score = 0;
    p.fell = false;
  }

  protected resetCourse(): void {
    this.tilt = 0;
    this.targets = [];
    this.spawned = 0;
    this.waves = [];
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.waves = [
      { w: 0.6 + this.rng() * 0.4, p: this.rng() * Math.PI * 2 },
      { w: 1.3 + this.rng() * 0.6, p: this.rng() * Math.PI * 2 },
    ];
    this.spawnIn = TARGET_FIRST_S;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Left and right is all there is to do.
  }

  snapshot(): TiltSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'tilt',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.phase === 'playing' ? Math.max(0, Math.round(RUN_LIMIT_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      tilt: r3(this.tilt),
      targets: this.targets.map((t): TiltTarget => ({ x: r3(t.x), n: t.n, leftMs: Math.max(0, Math.round(t.left * 1000)) })),
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive || p.fell ? p.score : 0, dir: p.alive ? p.dir : 0, x: r3(p.x), v: r3(p.v), fell: p.fell })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    const balls = [...this.players.values()].filter((p) => p.alive);
    const amp = Math.min(WOBBLE_MAX, WOBBLE_START + WOBBLE_GAIN * seconds);
    const [a, b] = this.waves;
    const wobble = a && b ? amp * (0.6 * Math.sin(a.w * seconds + a.p) + 0.4 * Math.sin(b.w * seconds + b.p)) : 0;
    // The beam leans toward the balls' average, plus the wobble.
    const mean = balls.length > 0 ? balls.reduce((s, p) => s + p.x, 0) / balls.length : 0.5;
    this.tilt = Math.max(-1, Math.min(1, (mean - 0.5) * LEAN_GAIN + wobble / SLOPE));

    for (const p of balls) {
      p.v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (p.v + (p.dir * PUSH + this.tilt * SLOPE) * dt) * Math.exp(-DRAG * dt)));
      p.x += p.v * dt;
    }

    for (const t of this.targets) t.left -= dt;
    this.targets = this.targets.filter((t) => t.left > 0);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.targets.length < MAX_TARGETS) {
      this.targets.push({ x: TARGET_EDGE + this.rng() * (1 - 2 * TARGET_EDGE), n: ++this.spawned, left: TARGET_LIFE_S });
      this.spawnIn = TARGET_EVERY_S;
    } else if (this.spawnIn <= 0) this.spawnIn = 0.5;

    // The first ball to reach a target (the nearest, if two arrive together) scores it.
    this.targets = this.targets.filter((t) => {
      let taker: Ball | undefined;
      for (const p of balls) if (Math.abs(t.x - p.x) <= HIT && (!taker || Math.abs(t.x - p.x) < Math.abs(t.x - taker.x))) taker = p;
      if (taker) taker.score++;
      return !taker;
    });

    // A ball that rolls off either end is out (the score it had stays).
    for (const p of balls) {
      if (p.x >= 0 && p.x <= 1) continue;
      p.fell = true;
      this.knockOut(p);
      p.outAtMeters = p.score;
    }

    if (seconds >= RUN_LIMIT_S) this.finishRun();
  }

  /** The run ends when the last ball is off (or, with others, when one is left), never because a player leaves
   * one by one. */
  protected override checkRunEnd(): void {
    if (this.phase !== 'playing') return;
    const alive = [...this.players.values()].filter((p) => p.alive).length;
    if (alive <= (this.startedWith > 1 ? 1 : 0)) this.finishRun();
  }

  /** Most targets scored wins; a tie goes to the ball still on the beam, else it has no winner. A run where
   * nothing was scored and a solo run have no winner. */
  private finishRun(): void {
    if (this.phase !== 'playing') return;
    const racers = [...this.players.values()].filter((p) => p.alive || p.fell);
    for (const p of racers) p.outAtMeters = p.score;
    const best = Math.max(0, ...racers.map((p) => p.score));
    const leaders = racers.filter((p) => p.score === best);
    const standing = leaders.filter((p) => p.alive);
    const winner = best > 0 && this.startedWith > 1 ? (leaders.length === 1 ? leaders[0] : standing.length === 1 ? standing[0] : null) : null;
    this.endRun(winner);
  }
}
