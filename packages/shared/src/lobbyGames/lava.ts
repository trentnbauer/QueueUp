import { LAVA_CEILING, LAVA_PLAYER_R, clampDirection, type LavaPlank, type LavaSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Heights are in screens, measured up from the start of the run; the lava rises through them. x runs 0..1 across.
const GRAVITY = 6;
/** A jump's launch speed: the player rises about 0.3 (v squared over twice the gravity) before falling. */
const JUMP_SPEED = 1.9;
/** How fast a player slides left and right, on a plank or in the air. */
const MOVE_SPEED = 0.5;
const LAVA_START_SPEED = 0.1;
const LAVA_GAIN = 0.01; // per second of the run
const LAVA_MAX_SPEED = 0.8;
/** Planks are this far apart in height to start with; the gap grows with the height climbed, up to the most a jump can
 * clear with room to spare. */
const SPACING_MIN = 0.11;
const SPACING_EXTRA = 0.05;
const SPACING_GROW = 0.012; // per screen climbed
const SPACING_MAX = 0.23;
/** A plank is this wide to start with, and narrower the higher the climb, down to a floor. */
const WIDTH_START = 0.4;
const WIDTH_SHRINK = 0.01; // per screen climbed
const WIDTH_MIN = 0.2;
/** Each plank's middle is within this of the one below it, so the next one is always within a jump's reach sideways. */
const SHIFT_MAX = 0.28;
const FIRST_PLANK = 0.2;
const FIRST_WIDTH = 0.9;
const SPAWN_AHEAD = 1.4;
const VISIBLE_BELOW = 0.2;

interface Climber extends RoundPlayer {
  x: number;
  /** -1, 0 or 1: the direction they are holding. */
  dir: number;
  /** Height of their feet, up from the start of the run. */
  z: number;
  vy: number;
  /** Standing on a plank, so a jump can start. */
  grounded: boolean;
}

/** Whether a player is over a plank sideways (a little of their body past the edge still stands on it). */
const over = (x: number, plank: LavaPlank) => Math.abs(x - plank.x) <= plank.w / 2 + LAVA_PLAYER_R * 0.5;

/** The lava rises, and the planks you stand on do not: climb from plank to plank faster than it comes. Slide left and right
 * to get under the next plank and jump onto it; the top of the screen is a ceiling, so there is no climbing out of sight. Fall
 * into the lava and you are out; last one climbing wins. Everyone climbs the same planks side by side and never touches.
 * See RoundGame for how runs start and end. */
export class LavaGame extends RoundGame<Climber> {
  readonly id = 'lava' as const;
  private lava = 0;
  private speed = LAVA_START_SPEED;
  private planks: LavaPlank[] = [];
  private spawned = 0;
  private nextZ = FIRST_PLANK;
  private lastX = 0.5;

  /** Each player's own device works out their climbing (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(c: Climber, f: Record<string, number>): void {
    c.x = Math.min(1, Math.max(0, RoundGame.num(f.x, c.x)));
    c.z = Math.max(0, RoundGame.num(f.z, c.z));
    c.vy = RoundGame.num(f.vy, c.vy);
    c.grounded = f.g === 1;
  }

  protected writeReport(c: Climber): Record<string, number> {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return { x: r3(c.x), z: r3(c.z), vy: r3(c.vy), g: c.grounded ? 1 : 0 };
  }

  protected createPlayer(id: string, alive: boolean): Climber {
    return { id, x: 0.5, dir: 0, z: FIRST_PLANK, vy: 0, grounded: true, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(c: Climber): void {
    c.x = 0.5;
    c.dir = 0;
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
    this.lastX = 0.5;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.spawnPlanks();
  }

  input(userId: string, dx: number, _dy?: number): void {
    const c = this.players.get(userId);
    if (c) c.dir = clampDirection(dx);
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
      planks: this.planks.filter((p) => p.z > this.lava - VISIBLE_BELOW && p.z < this.lava + SPAWN_AHEAD).map((p) => ({ z: r3(p.z), x: r3(p.x), w: r3(p.w), n: p.n })),
      players: [...this.players.values()].map((c) => ({
        id: c.id,
        x: r3(c.x),
        dir: c.alive ? c.dir : 0,
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
      c.x = Math.min(1, Math.max(0, c.x + c.dir * MOVE_SPEED * dt));
      if (c.grounded) {
        // Walked off the end of the plank: they fall (and land on whatever is below, or in the lava).
        const standing = this.planks.some((p) => Math.abs(p.z - c.z) < 1e-6 && over(c.x, p));
        if (!standing) c.grounded = false;
      }
      if (!c.grounded) {
        const before = c.z;
        c.vy -= GRAVITY * dt;
        c.z += c.vy * dt;
        // The top of the screen is a ceiling: nobody climbs out of sight.
        if (c.z > this.lava + LAVA_CEILING) {
          c.z = this.lava + LAVA_CEILING;
          c.vy = Math.min(c.vy, 0);
        }
        if (c.vy <= 0) {
          // Falling: land on the highest plank under them whose top their feet just passed through.
          let landed: LavaPlank | null = null;
          for (const p of this.planks) if (before >= p.z && c.z <= p.z && over(c.x, p) && (!landed || p.z > landed.z)) landed = p;
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
      const first = this.spawned === 0;
      const w = first ? FIRST_WIDTH : Math.max(WIDTH_MIN, WIDTH_START - WIDTH_SHRINK * this.nextZ);
      // Always take the same random numbers, so a plank does not change what comes after it.
      const shift = (this.rng() * 2 - 1) * SHIFT_MAX;
      const extra = this.rng();
      const x = first ? 0.5 : Math.min(1 - w / 2, Math.max(w / 2, this.lastX + shift));
      this.planks.push({ z: this.nextZ, x, w, n: ++this.spawned });
      this.lastX = x;
      const spacing = Math.min(SPACING_MAX, SPACING_MIN + SPACING_GROW * this.nextZ);
      this.nextZ += spacing + extra * SPACING_EXTRA * Math.max(0, 1 - (spacing - SPACING_MIN) / (SPACING_MAX - SPACING_MIN + 1e-9));
    }
  }
}
