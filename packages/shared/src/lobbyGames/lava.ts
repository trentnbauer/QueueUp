import type { LavaPlank, LavaSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Heights are in screens, measured up from the start of the run; the lava rises through them.
const GRAVITY = 6;
/** A jump's launch speed: the player rises about 0.3 (v squared over twice the gravity) before falling. */
const JUMP_SPEED = 1.9;
const LAVA_START_SPEED = 0.05;
const LAVA_GAIN = 0.005; // per second of the run
const LAVA_MAX_SPEED = 0.8;
/** Planks are this far apart, to start with; the gap grows with the height climbed, up to the most a jump can
 * clear with room to spare. */
const SPACING_MIN = 0.11;
const SPACING_EXTRA = 0.05;
const SPACING_GROW = 0.012; // per screen climbed
const SPACING_MAX = 0.23;
const FIRST_PLANK = 0.2;
const SPAWN_AHEAD = 1.4;
const VISIBLE_BELOW = 0.2;

interface Climber extends RoundPlayer {
  /** Height of their feet, up from the start of the run. */
  z: number;
  vy: number;
  /** Standing on a plank, so a jump can start. */
  grounded: boolean;
}

/** A plank's thickness for landing: a falling player lands when their feet pass through its top. */
const landsOn = (prev: number, next: number, plank: LavaPlank) => prev >= plank.z && next <= plank.z;

/** The lava rises, and the planks you stand on do not: jump up from plank to plank faster than it comes.
 * Everyone climbs the same planks side by side and never touches. Fall into the lava and you are out; last
 * one climbing wins. See RoundGame for how runs start and end. */
export class LavaGame extends RoundGame<Climber> {
  readonly id = 'lava' as const;
  private lava = 0;
  private speed = LAVA_START_SPEED;
  private planks: LavaPlank[] = [];
  private spawned = 0;
  private nextZ = FIRST_PLANK;

  /** Each player's own device works out their jumping (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(c: Climber, f: Record<string, number>): void {
    c.z = Math.max(0, RoundGame.num(f.z, c.z));
    c.vy = RoundGame.num(f.vy, c.vy);
    c.grounded = f.g === 1;
  }

  protected writeReport(c: Climber): Record<string, number> {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { z: r3(c.z), vy: r3(c.vy), g: c.grounded ? 1 : 0 };
  }

  protected createPlayer(id: string, alive: boolean): Climber {
    return { id, z: FIRST_PLANK, vy: 0, grounded: true, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(c: Climber): void {
    c.z = FIRST_PLANK;
    c.vy = 0;
    c.grounded = true;
  }

  protected resetCourse(): void {
    this.lava = 0;
    this.speed = LAVA_START_SPEED;
    this.planks = [];
    this.spawned = 0;
    this.nextZ = FIRST_PLANK;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.spawnPlanks();
  }

  input(): void {
    // Jumping is an action; there is nothing to hold.
  }

  action(userId: string, name: string): void {
    if (name !== 'jump' || this.phase !== 'playing') return;
    const c = this.players.get(userId);
    if (c?.alive && c.grounded) {
      c.vy = JUMP_SPEED;
      c.grounded = false;
    }
  }

  snapshot(): LavaSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'lava',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      lava: r3(this.lava),
      planks: this.planks.filter((p) => p.z > this.lava - VISIBLE_BELOW && p.z < this.lava + SPAWN_AHEAD).map((p) => ({ z: r3(p.z), n: p.n })),
      players: [...this.players.values()].map((c) => ({
        id: c.id,
        z: r3(c.z),
        vy: r3(c.vy),
        grounded: c.grounded,
        alive: c.alive,
        wins: c.wins,
        meters: c.alive && this.phase === 'playing' ? this.meters : c.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.speed = Math.min(LAVA_MAX_SPEED, LAVA_START_SPEED + LAVA_GAIN * seconds);
    this.lava += this.speed * dt;
    this.distance = this.lava;
    this.spawnPlanks();

    for (const c of this.players.values()) {
      if (!c.alive || !this.simulated(c)) continue;
      if (!c.grounded) {
        const before = c.z;
        c.vy -= GRAVITY * dt;
        c.z += c.vy * dt;
        if (c.vy <= 0) {
          // Falling: land on the highest plank whose top the feet just passed through.
          let landed: LavaPlank | null = null;
          for (const p of this.planks) if (landsOn(before, c.z, p) && (!landed || p.z > landed.z)) landed = p;
          if (landed) {
            c.z = landed.z;
            c.vy = 0;
            c.grounded = true;
          }
        }
      }
      if (c.z <= this.lava) this.knockOut(c);
    }
    this.planks = this.planks.filter((p) => p.z > this.lava - VISIBLE_BELOW - 0.3);
  }

  private spawnPlanks(): void {
    while (this.nextZ < this.lava + SPAWN_AHEAD) {
      this.planks.push({ z: this.nextZ, n: ++this.spawned });
      const spacing = Math.min(SPACING_MAX, SPACING_MIN + SPACING_GROW * this.nextZ);
      this.nextZ += spacing + this.rng() * SPACING_EXTRA * Math.max(0, 1 - (spacing - SPACING_MIN) / (SPACING_MAX - SPACING_MIN + 1e-9));
    }
  }
}
