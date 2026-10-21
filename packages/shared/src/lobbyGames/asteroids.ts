import { ASTEROIDS_MAX_ANGLE, ASTEROIDS_TURRET_R, ASTEROIDS_TURRET_Y, clampDirection, type Asteroid, type AsteroidShot, type AsteroidsSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Positions are fractions of the screen (x across, y down from the top); speeds are screens a second.
/** A run that is still going at this time ends: most asteroids destroyed wins. */
const TURN_SPEED = 1.6; // radians a second
const FIRE_EVERY_S = 0.5;
const SHOT_SPEED = 1.2;
const SHOT_RADIUS = 0.01;
/** Asteroids fall faster, appear more often and are bigger more often as the run goes on, so it always ends. */
const FALL_START = 0.2;
const FALL_GAIN = 0.012;
const SPAWN_START_S = 0.9;
const SPAWN_GAIN_S = 0.025;
const SPAWN_MIN_S = 0.35;
const BIG_START = 0.15;
const BIG_GAIN = 0.01;
const BIG_MAX = 0.5;
const SMALL = { r: 0.035, hp: 1 };
const BIG = { r: 0.06, hp: 2 };
const DRIFT = 0.1;
const EDGE = 0.05;
/** First asteroid comes this long into the run, so there is time to get ready. */
const FIRST_SPAWN_S = 1;

interface Gunner extends RoundPlayer {
  /** Where their turret is along the bottom. */
  x: number;
  angle: number;
  dir: number;
  fireIn: number;
  score: number;
  /** Was in the run when it started (someone who arrived part way through only watches, and has no turret). */
  inRun: boolean;
}

interface Shot extends AsteroidShot {
  /** Player id of the shooter, to credit a kill (the snapshot's `by` is an index). */
  owner: string;
}

/** Every player has a turret at a random spot along the bottom (the same for everyone in a run) and swings its
 * gun left and right; the gun fires by itself, steadily. Asteroids fall, faster, bigger and more often as the
 * run goes on; destroying one scores for whoever's shot broke it. An asteroid that hits your turret knocks you
 * out; last turret standing wins, and if everyone is hit at the same moment nobody wins. Shots go through
 * turrets, so the game stays friendly. See RoundGame for how runs start and end. */
export class AsteroidsGame extends RoundGame<Gunner> {
  readonly id = 'asteroids' as const;
  private asteroids: Asteroid[] = [];
  private shots: Shot[] = [];
  private spawned = 0;
  private spawnIn = 0;
  /** What the run reports as its score, set when it ends (the winner's own count rather than the best). */
  private finalScore: number | null = null;

  /** The score shown for the run: the most asteroids anyone has destroyed. */
  protected get meters(): number {
    if (this.finalScore !== null) return this.finalScore;
    let best = 0;
    for (const p of this.players.values()) if (p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Gunner {
    return { id, x: 0.5, angle: 0, dir: 0, fireIn: 0, score: 0, inRun: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Gunner): void {
    p.angle = 0;
    p.dir = 0;
    p.score = 0;
    p.inRun = false;
  }

  protected resetCourse(): void {
    this.asteroids = [];
    this.shots = [];
    this.spawned = 0;
    this.finalScore = null;
    // Turrets at random spots: shuffle evenly spaced slots (so they never pile on top of each other), then
    // nudge each a little within its slot. Everyone sees the same spots, which come from the run's seed.
    const players = [...this.players.values()];
    const slots = players.map((_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const slot = 0.9 / Math.max(1, players.length);
    players.forEach((p, i) => {
      p.x = 0.05 + (slots[i] + 0.5 + (this.rng() - 0.5) * 0.5) * slot;
      p.fireIn = (FIRE_EVERY_S * i) / players.length;
    });
  }

  protected beginCourse(): void {
    this.resetCourse();
    for (const p of this.players.values()) p.inRun = p.alive;
    this.spawnIn = FIRST_SPAWN_S;
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // The gun fires by itself: swinging it left and right is all there is to do.
  }

  snapshot(): AsteroidsSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const ids = [...this.players.keys()];
    return {
      id: 'asteroids',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      asteroids: this.asteroids.map((a) => ({ x: r3(a.x), y: r3(a.y), vx: r3(a.vx), vy: r3(a.vy), r: a.r, hp: a.hp, n: a.n })),
      shots: this.shots.map((s) => ({ x: r3(s.x), y: r3(s.y), vx: r3(s.vx), vy: r3(s.vy), by: ids.indexOf(s.owner) })),
      players: [...this.players.values()].map((p) => ({ id: p.id, x: r3(p.x), angle: r3(p.angle), alive: p.alive, inRun: p.inRun, wins: p.wins, meters: p.inRun ? p.score : 0 })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;

    for (const [index, p] of [...this.players.values()].entries()) {
      if (!p.alive) continue;
      p.angle = Math.max(-ASTEROIDS_MAX_ANGLE, Math.min(ASTEROIDS_MAX_ANGLE, p.angle + p.dir * TURN_SPEED * dt));
      p.fireIn -= dt;
      while (p.fireIn <= 0) {
        p.fireIn += FIRE_EVERY_S;
        this.shots.push({ x: p.x, y: ASTEROIDS_TURRET_Y - ASTEROIDS_TURRET_R, vx: Math.sin(p.angle) * SHOT_SPEED, vy: -Math.cos(p.angle) * SHOT_SPEED, by: index, owner: p.id });
      }
    }
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.shots = this.shots.filter((s) => s.y > -0.05 && s.x > -0.05 && s.x < 1.05);

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawn(seconds);
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }
    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      // They bounce off the sides, so none drifts out of the sky.
      if (a.x < a.r || a.x > 1 - a.r) {
        a.vx = -a.vx;
        a.x = Math.max(a.r, Math.min(1 - a.r, a.x));
      }
    }

    // A shot that reaches an asteroid is used up on it; the one that breaks it scores.
    this.shots = this.shots.filter((s) => {
      const hit = this.asteroids.find((a) => a.hp > 0 && Math.hypot(a.x - s.x, a.y - s.y) < a.r + SHOT_RADIUS);
      if (!hit) return true;
      hit.hp--;
      if (hit.hp <= 0) {
        const shooter = this.players.get(s.owner);
        if (shooter) shooter.score++;
      }
      return false;
    });
    this.asteroids = this.asteroids.filter((a) => a.hp > 0);

    // An asteroid that reaches a turret breaks on it; if the turret was still in, its owner is out.
    this.asteroids = this.asteroids.filter((a) => {
      for (const p of this.players.values()) {
        if (!p.inRun || Math.hypot(a.x - p.x, a.y - ASTEROIDS_TURRET_Y) >= a.r + ASTEROIDS_TURRET_R) continue;
        if (p.alive && this.phase === 'playing') this.knockGunner(p);
        return false;
      }
      return a.y < 1.1;
    });

  }

  /** A turret was hit: its owner is out, with the asteroids they destroyed as their score. */
  private knockGunner(p: Gunner): void {
    this.knockOut(p);
    p.outAtMeters = p.score;
  }

  protected override limitReached(): void {
    this.finishRun();
  }

  /** Time is up with turrets still standing: most asteroids destroyed wins; a tie, or a solo run, has no winner. */
  private finishRun(): void {
    const racers = [...this.players.values()].filter((p) => p.alive);
    for (const p of racers) p.outAtMeters = p.score;
    const best = Math.max(0, ...racers.map((p) => p.score));
    const leaders = racers.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }

  /** Reports the winner's own count as the run's score, not the best of anyone. */
  protected override endRun(winner: Gunner | null): void {
    if (winner) {
      winner.outAtMeters = winner.score;
      this.finalScore = winner.score;
    }
    super.endRun(winner);
  }

  private spawn(seconds: number): void {
    const big = this.rng() < Math.min(BIG_MAX, BIG_START + BIG_GAIN * seconds);
    const kind = big ? BIG : SMALL;
    const fall = FALL_START + FALL_GAIN * seconds;
    this.asteroids.push({
      n: ++this.spawned,
      x: EDGE + this.rng() * (1 - 2 * EDGE),
      y: -kind.r,
      vx: (this.rng() - 0.5) * 2 * DRIFT,
      vy: fall * (0.85 + this.rng() * 0.3),
      r: kind.r,
      hp: kind.hp,
    });
  }
}
