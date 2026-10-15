import { clampDirection, type TiltSnapshot, type TiltTarget } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** A run ends at this time if the ball is still on the beam. */
const RUN_LIMIT_S = 120;
/** How hard everyone's push is together: the sum of directions divided by the square root of how many are
 * playing, times this. So more players can push harder, but never in proportion, and two pushing opposite
 * ways cancel out. In beams a second squared. */
const PUSH = 0.55;
/** The ball slows down by this much a second, so it settles instead of speeding up for ever. */
const DRAG = 1.2;
const MAX_SPEED = 1.2;
/** The beam also wobbles by itself (two slow waves from the run's seed), more and more as the run goes on,
 * so a run always ends. In beams a second squared. */
const WOBBLE_START = 0.12;
const WOBBLE_GAIN = 0.008;
const WOBBLE_MAX = 0.9;
/** The most a combined push and wobble is taken to be, for the beam's lean. */
const TILT_FULL = 1;
/** A target scores when the ball is this close to its middle (in beams). */
const HIT = 0.05;
const TARGET_EDGE = 0.12;
const TARGET_LIFE_S = 7;
const TARGET_FIRST_S = 1.2;
const TARGET_EVERY_S = 2.5;
const MAX_TARGETS = 2;

interface Pusher extends RoundPlayer {
  dir: number;
  /** Targets scored this run. */
  score: number;
}

interface Target {
  x: number;
  n: number;
  left: number;
}

/** A ball rolls on a beam. Everyone pushes it left or right while they hold their button, and it goes
 * where the group pushes (and where the beam wobbles). Keep it on. Targets appear on the beam: tipping
 * the ball into one scores a point for whoever pushed last. The run ends when the ball falls off; most
 * targets scored wins, a tie has no winner, and alone it is a high score. See RoundGame for how runs
 * start and end. */
export class TiltGame extends RoundGame<Pusher> {
  readonly id = 'tilt' as const;
  private x = 0.5;
  private v = 0;
  private tilt = 0;
  private targets: Target[] = [];
  private spawned = 0;
  private spawnIn = 0;
  private lastPusher: string | null = null;
  private team = 0;
  /** The two wobble waves: how fast each goes and where each starts, from the seed. */
  private waves: { w: number; p: number }[] = [];

  /** The score shown for the run: the most targets anyone has scored. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Pusher {
    return { id, dir: 0, score: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Pusher): void {
    p.dir = 0;
    p.score = 0;
  }

  protected resetCourse(): void {
    this.x = 0.5;
    this.v = 0;
    this.tilt = 0;
    this.targets = [];
    this.spawned = 0;
    this.lastPusher = null;
    this.team = 0;
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
    if (!p) return;
    p.dir = clampDirection(dx);
    if (p.dir !== 0 && p.alive) this.lastPusher = userId;
  }

  action(): void {
    // Left and right is all there is to do.
  }

  snapshot(): TiltSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const ids = [...this.players.keys()];
    return {
      id: 'tilt',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.phase === 'playing' ? Math.max(0, Math.round(RUN_LIMIT_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      ball: { x: r3(this.x), v: r3(this.v) },
      tilt: r3(this.tilt),
      targets: this.targets.map((t): TiltTarget => ({ x: r3(t.x), n: t.n, leftMs: Math.max(0, Math.round(t.left * 1000)) })),
      last: this.lastPusher ? ids.indexOf(this.lastPusher) : -1,
      team: this.team,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0, dir: p.alive ? p.dir : 0 })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    const pushers = [...this.players.values()].filter((p) => p.alive);
    const sum = pushers.reduce((s, p) => s + p.dir, 0);
    const push = pushers.length > 0 ? (sum / Math.sqrt(pushers.length)) * PUSH : 0;
    const amp = Math.min(WOBBLE_MAX, WOBBLE_START + WOBBLE_GAIN * seconds);
    const [a, b] = this.waves;
    const wobble = a && b ? amp * (0.6 * Math.sin(a.w * seconds + a.p) + 0.4 * Math.sin(b.w * seconds + b.p)) : 0;
    const accel = push + wobble;
    this.tilt = Math.max(-1, Math.min(1, accel / (PUSH * TILT_FULL)));

    this.v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (this.v + accel * dt) * Math.exp(-DRAG * dt)));
    this.x += this.v * dt;

    for (const t of this.targets) t.left -= dt;
    this.targets = this.targets.filter((t) => t.left > 0);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.targets.length < MAX_TARGETS) {
      this.targets.push({ x: TARGET_EDGE + this.rng() * (1 - 2 * TARGET_EDGE), n: ++this.spawned, left: TARGET_LIFE_S });
      this.spawnIn = TARGET_EVERY_S;
    } else if (this.spawnIn <= 0) this.spawnIn = 0.5;

    // Tipping the ball into a target scores it for whoever pushed last.
    const scorer = this.lastPusher ? this.players.get(this.lastPusher) : undefined;
    this.targets = this.targets.filter((t) => {
      if (Math.abs(t.x - this.x) > HIT) return true;
      if (scorer?.alive) {
        scorer.score++;
        this.team++;
      }
      return !scorer?.alive;
    });

    if (this.x < 0 || this.x > 1 || seconds >= RUN_LIMIT_S) this.finishRun();
  }

  /** The run only ends when the ball falls (or time runs out), never because a player leaves one by one. */
  protected override checkRunEnd(): void {
    if (this.phase === 'playing' && ![...this.players.values()].some((p) => p.alive)) this.finishRun();
  }

  /** Most targets scored wins; a tie, a run where nothing was scored and a solo run have no winner. */
  private finishRun(): void {
    const racers = [...this.players.values()].filter((p) => p.alive);
    for (const p of racers) p.outAtMeters = p.score;
    const best = Math.max(0, ...racers.map((p) => p.score));
    const leaders = racers.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }
}
