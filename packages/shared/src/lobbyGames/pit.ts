import { PIT_LEFT, PIT_RIGHT, PIT_TILES, clampDirection, type PitSnapshot, type PitTile } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Distances are fractions of the arena's width (0..1); times are seconds.
const TILE_W = (PIT_RIGHT - PIT_LEFT) / PIT_TILES;
/** The first tile starts to shake this long after the run starts, and each one after comes sooner by this share, down to a floor, so the floor always runs out. */
const FIRST_CRUMBLE_S = 2.5;
const CRUMBLE_SPEEDUP = 0.93;
const MIN_CRUMBLE_S = 0.7;
/** A shaking tile falls after this long. */
const SHAKE_S = 1;
/** Walking: acceleration, top speed and the share of speed lost each second. */
const WALK_ACCEL = 1.6;
const WALK_MAX = 0.32;
const DRAG = 3;
/** A dash adds this much speed the way you face and then needs this long to recharge. */
const DASH = 0.55;
const DASH_COOLDOWN_S = 1.2;
/** Two players closer than this bump into each other, and keep this share of the speed they hit with (the rest is lost in the bump). */
const BODY = 0.05;
const BOUNCE = 0.9;
/** Over a gap for this long and you fall: a quick dash over a gap one tile wide is safe, standing in it is not. */
const FALL_S = 0.3;
/** Nobody can go further than this from the middle (an invisible wall, so a bump cannot send someone far out of sight). */
const EDGE = 0.03;

interface Bumper extends RoundPlayer {
  x: number;
  /** Speed along the pit (arena widths a second, left is negative). */
  v: number;
  dir: number;
  face: number;
  cooldown: number;
  /** Seconds spent over a gap. */
  slip: number;
}

/** Which tile of the pit is under `x` (-1 when it is off either end). */
export function tileAt(x: number): number {
  const i = Math.floor((x - PIT_LEFT) / TILE_W);
  return i < 0 || i >= PIT_TILES ? -1 : i;
}

/** A row of floor tiles over a drop, and they fall away one at a time, quicker and quicker. Everyone walks left and right and has a dash button;
 * players bump into each other, and a dash sends whoever you hit flying, perhaps into a gap. Stand over a gap for a moment and you fall. Last one
 * on the floor wins, and alone it is a high score (seconds on the floor). See RoundGame for how runs start and end. */
export class PitGame extends RoundGame<Bumper> {
  readonly id = 'pit' as const;
  private tiles: PitTile[] = [];
  /** Seconds until the next tile starts to shake, and how long each tile has shaken. */
  private next = 0;
  private shaken: number[] = [];
  private crumbled = 0;

  /** The score is the seconds a player stayed on; for the run, how long it has lasted. */
  protected get meters(): number {
    return Math.floor(this.roundMs / 1000);
  }

  protected createPlayer(id: string, alive: boolean): Bumper {
    return { id, x: 0.5, v: 0, dir: 0, face: 1, cooldown: 0, slip: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Bumper): void {
    p.v = 0;
    p.dir = 0;
    p.cooldown = 0;
    p.slip = 0;
  }

  protected resetCourse(): void {
    this.tiles = Array.from({ length: PIT_TILES }, () => 0 as PitTile);
    this.shaken = Array.from({ length: PIT_TILES }, () => 0);
    this.next = FIRST_CRUMBLE_S;
    this.crumbled = 0;
    // Everyone is spread evenly along the floor, facing the middle.
    const players = [...this.players.values()];
    players.forEach((p, i) => {
      p.x = PIT_LEFT + ((i + 0.5) / players.length) * (PIT_RIGHT - PIT_LEFT);
      p.face = p.x < 0.5 ? 1 : -1;
    });
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (!p || !p.alive) return;
    p.dir = clampDirection(dx);
    if (p.dir !== 0) p.face = p.dir;
  }

  action(userId: string, name: string): void {
    const p = this.players.get(userId);
    if (name !== 'dash' || this.phase !== 'playing' || !p || !p.alive || p.cooldown > 0) return;
    p.v += p.face * DASH;
    p.cooldown = DASH_COOLDOWN_S;
  }

  /** Out, with the seconds they lasted as their score. */
  private fall(p: Bumper): void {
    this.knockOut(p);
    p.outAtMeters = Math.floor(this.roundMs / 1000);
  }

  snapshot(): PitSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'pit',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      tiles: [...this.tiles],
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? this.meters : p.outAtMeters,
        x: r3(p.x),
        face: p.face,
        cooldown: r3(p.cooldown / DASH_COOLDOWN_S),
        slipping: r3(Math.min(1, p.slip / FALL_S)),
      })),
    };
  }

  protected advance(dt: number): void {
    // The floor: the next tile starts to shake when it is due, and one that has shaken long enough is gone.
    this.next -= dt;
    if (this.next <= 0) this.startShaking();
    for (let i = 0; i < PIT_TILES; i++) {
      if (this.tiles[i] !== 1) continue;
      this.shaken[i] += dt;
      if (this.shaken[i] >= SHAKE_S) this.tiles[i] = 2;
    }

    const players = [...this.players.values()].filter((p) => p.alive);
    for (const p of players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.v += p.dir * WALK_ACCEL * dt;
      // Walking is limited to a top speed; a dash or a bump may carry you faster, and drag brings you back down.
      if (Math.abs(p.v) > WALK_MAX && Math.sign(p.v) === p.dir) p.v -= p.dir * WALK_ACCEL * dt;
      p.v *= Math.max(0, 1 - DRAG * dt);
      p.x = Math.max(EDGE, Math.min(1 - EDGE, p.x + p.v * dt));
      if (p.x === EDGE || p.x === 1 - EDGE) p.v = 0;
    }
    // Bumps: two players closer than a body, and closing, swap their speeds (a dash is passed on to whoever it hits).
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const gap = b.x - a.x;
        if (Math.abs(gap) >= BODY) continue;
        const closing = (a.v - b.v) * Math.sign(gap || 1);
        if (closing <= 0) continue;
        const va = a.v;
        a.v = b.v * BOUNCE;
        b.v = va * BOUNCE;
      }
    }
    // Falling: over a gap (or off the end) for long enough.
    for (const p of players) {
      const tile = tileAt(p.x);
      const over = tile === -1 || this.tiles[tile] === 2;
      p.slip = over ? p.slip + dt : Math.max(0, p.slip - dt * 2);
      if (p.slip >= FALL_S) this.fall(p);
    }
  }

  /** The next solid tile to go shakes, picked at random; the wait for the one after is shorter. */
  private startShaking(): void {
    const solid = this.tiles.map((t, i) => (t === 0 ? i : -1)).filter((i) => i >= 0);
    // Always the same one random number, so one tile does not change the ones after it.
    const roll = this.rng();
    if (solid.length > 0) {
      const i = solid[Math.floor(roll * solid.length)];
      this.tiles[i] = 1;
      this.shaken[i] = 0;
    }
    this.crumbled++;
    this.next = Math.max(MIN_CRUMBLE_S, FIRST_CRUMBLE_S * CRUMBLE_SPEEDUP ** this.crumbled);
  }
}
