import { clampDirection, type FishingSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is along one line from the surface (0) to the bottom (1). Times are in seconds.
/** How hard holding the button pulls a net up, and how fast it sinks when let go (ponds a second, each second). */
const REEL_ACCEL = 2.4;
const SINK_ACCEL = 1.6;
const MAX_SPEED = 1.4;
/** A net that hits the top or bottom bounces back a little. */
const BOUNCE = 0.25;
const NET_MIN = 0.04;
const NET_MAX = 0.96;
/** Everything gets harder over this long, then stays as hard: the fish is quicker and changes its mind sooner, the net is shorter, and
 * the line gains less and loses more. Each pair is the value at the start of the run and at the end of the ramp. */
const RAMP_S = 30;
const NET_HALF = [0.13, 0.065] as const;
const FISH_SPEED = [0.35, 0.95] as const;
const DWELL_S = [1.2, 0.45] as const;
const FISH_JUMP = [0.35, 0.8] as const;
/** Catching: the catch fills this fast (a second) while the fish is in the net and drains this fast while it is not. */
const CATCH_GAIN = [0.3, 0.2] as const;
const CATCH_DRAIN = 0.15;
/** The line's health starts full, wears down this fast while the fish is outside the net, and mends this fast while it is inside. */
const HEALTH_LOSS = [0.4, 0.75] as const;
const HEALTH_MEND = 0.2;
/** Landing a fish mends the line this much, so there is a moment to breathe. */
const LANDED_MEND = 0.35;
const FISH_MIN = 0.08;
const FISH_MAX = 0.92;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;

interface Angler extends RoundPlayer {
  y: number;
  vy: number;
  reeling: boolean;
  health: number;
  catch: number;
  landed: number;
}

/** One fish thrashes up and down the pond for everyone. Hold the button to pull your net up and let go to let it sink, and keep the
 * fish inside your net: while it is, your catch fills and your line mends; while it is not, the line wears down. Fill the catch and you
 * land the fish (a point) and the line is mended a little; wear the line out and it snaps and you are out. Last one fishing wins. Players never touch each other, so each
 * device works out its own net against the same fish (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class FishingGame extends RoundGame<Angler> {
  readonly id = 'fishing' as const;
  private fishY = 0.5;
  private fishVy = 0;
  private target = 0.5;
  private dwell = 0;
  /** What the run reports as its score, set when it ends (the winner's own count rather than the best of anyone). */
  private finalScore: number | null = null;

  /** The score shown for the run: the most fish anyone has landed. */
  protected get meters(): number {
    if (this.finalScore !== null) return this.finalScore;
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.landed);
    return best;
  }

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Angler, f: Record<string, number>): void {
    p.y = Math.min(NET_MAX, Math.max(NET_MIN, RoundGame.num(f.y, p.y)));
    p.vy = Math.min(MAX_SPEED, Math.max(-MAX_SPEED, RoundGame.num(f.vy, p.vy)));
    p.health = Math.min(1, Math.max(0, RoundGame.num(f.h, p.health)));
    p.catch = Math.min(1, Math.max(0, RoundGame.num(f.c, p.catch)));
    p.reeling = f.r === 1;
    // Never fewer, and no more than one more than the server has heard of: a device cannot land a pile of fish in one report.
    p.landed = Math.max(p.landed, Math.min(Math.floor(RoundGame.num(f.n, p.landed)), p.landed + 1));
  }

  protected writeReport(p: Angler): Record<string, number> {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { y: r3(p.y), vy: r3(p.vy), h: r3(p.health), c: r3(p.catch), n: p.landed, r: p.reeling ? 1 : 0 };
  }

  protected createPlayer(id: string, alive: boolean): Angler {
    return { id, y: 0.5, vy: 0, reeling: false, health: 1, catch: 0, landed: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Angler): void {
    p.y = 0.5;
    p.vy = 0;
    p.reeling = false;
    p.health = 1;
    p.catch = 0;
    p.landed = 0;
  }

  protected resetCourse(): void {
    this.fishY = 0.5;
    this.fishVy = 0;
    this.target = 0.5;
    this.dwell = 0.8; // a moment before the fish first moves
    this.finalScore = null;
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  input(userId: string, _dx: number, dy: number): void {
    const p = this.players.get(userId);
    if (p) p.reeling = clampDirection(dy) === -1;
  }

  action(): void {
    // Holding the button is all there is to do.
  }

  protected override knockOut(p: Angler): void {
    super.knockOut(p);
    p.outAtMeters = p.landed;
  }

  /** At the time cap whoever is still fishing keeps the fish they have landed, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = p.landed;
    this.endRun(null);
  }

  protected override endRun(winner: Angler | null): void {
    if (winner) this.finalScore = winner.landed;
    super.endRun(winner);
  }

  /** 0 at the start of the run, 1 once it has got as hard as it gets. */
  private get difficulty(): number {
    return this.phase === 'playing' ? Math.min(1, this.roundMs / 1000 / RAMP_S) : 0;
  }

  snapshot(): FishingSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'fishing',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      fish: { y: r3(this.fishY), vy: r3(this.fishVy) },
      half: r3(lerp(NET_HALF, this.difficulty)),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        y: r3(p.y),
        vy: r3(p.vy),
        reeling: p.alive && p.reeling,
        health: r3(p.health),
        catch: r3(p.catch),
        landed: p.landed,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? p.landed : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const d = this.difficulty;
    this.moveFish(dt, d);
    const half = lerp(NET_HALF, d);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.vy = Math.min(MAX_SPEED, Math.max(-MAX_SPEED, p.vy + (p.reeling ? -REEL_ACCEL : SINK_ACCEL) * dt));
      p.y += p.vy * dt;
      if (p.y < NET_MIN || p.y > NET_MAX) {
        p.y = Math.min(NET_MAX, Math.max(NET_MIN, p.y));
        p.vy = -p.vy * BOUNCE;
      }
      if (Math.abs(this.fishY - p.y) <= half) {
        p.catch += lerp(CATCH_GAIN, d) * dt;
        p.health = Math.min(1, p.health + HEALTH_MEND * dt);
      } else {
        p.catch = Math.max(0, p.catch - CATCH_DRAIN * dt);
        p.health -= lerp(HEALTH_LOSS, d) * dt;
      }
      if (p.catch >= 1) {
        p.landed++;
        p.catch = 0;
        p.health = Math.min(1, p.health + LANDED_MEND);
      }
      if (p.health <= 0) {
        p.health = 0;
        this.knockOut(p);
      }
    }
  }

  /** The fish swims to a spot, stays a while, and swims to another, quicker and further as the run goes on. */
  private moveFish(dt: number, d: number): void {
    this.dwell -= dt;
    if (this.dwell <= 0) {
      // Always take the same two random numbers, so one choice does not change the ones after it.
      const jump = (this.rng() * 2 - 1) * lerp(FISH_JUMP, d);
      const wait = 0.7 + 0.6 * this.rng();
      this.target = Math.min(FISH_MAX, Math.max(FISH_MIN, this.fishY + jump));
      this.dwell = lerp(DWELL_S, d) * wait;
    }
    const speed = lerp(FISH_SPEED, d);
    const to = this.target - this.fishY;
    if (Math.abs(to) <= speed * dt) {
      this.fishY = this.target;
      this.fishVy = 0;
    } else {
      this.fishVy = Math.sign(to) * speed;
      this.fishY += this.fishVy * dt;
    }
  }
}
