import { PIT_LAYER_Y, PIT_LEFT, PIT_RIGHT, PIT_TILES, clampDirection, type PitSnapshot, type PitTile } from '../spinLobby.js';
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
/** Gravity and the speed of a jump (arena heights a second, down is positive): a jump clears the next layer up, with a little to spare. */
const GRAVITY = 3;
const JUMP_V = 1.15;
/** Fall past this and you are out: below the bottom layer. */
const DEATH_Y = 0.97;
/** Two players closer than this across, and this close in height, bump into each other, and keep this share of the speed they hit with (the rest is lost in the bump). */
const BODY = 0.05;
const BODY_Y = 0.06;
const BOUNCE = 0.9;
/** How much likelier a tile on each layer, top first, is to be the next to shake: the top goes three times as often as the bottom. */
const LAYER_WEIGHT = [3, 2, 1] as const;
/** Nobody can go further than this from the middle (an invisible wall, so a bump cannot send someone far out of sight). */
const EDGE = 0.03;

interface Bumper extends RoundPlayer {
  x: number;
  /** Speed along the pit (arena widths a second, left is negative). */
  v: number;
  dir: number;
  face: number;
  /** How far down the arena the feet are, and the speed down (negative while rising). */
  y: number;
  vy: number;
  grounded: boolean;
}

/** Which tile of the pit is under `x` (-1 when it is off either end). */
export function tileAt(x: number): number {
  const i = Math.floor((x - PIT_LEFT) / TILE_W);
  return i < 0 || i >= PIT_TILES ? -1 : i;
}

/** Three layers of floor tiles over a drop, and they fall away one at a time, quicker and quicker, the top layer most often. Everyone walks left and
 * right and has a jump button, and can steer in the air; a player lands on any layer's tile from above and falls through a gap to the layer below.
 * Only falling past the bottom layer puts you out. Last one in wins, and alone it is a high score (seconds survived). See RoundGame for how runs start and end. */
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
    return { id, x: 0.5, v: 0, dir: 0, face: 1, y: PIT_LAYER_Y[0], vy: 0, grounded: true, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Bumper): void {
    p.v = 0;
    p.dir = 0;
    p.y = PIT_LAYER_Y[0];
    p.vy = 0;
    p.grounded = true;
  }

  protected resetCourse(): void {
    this.tiles = Array.from({ length: PIT_LAYER_Y.length * PIT_TILES }, () => 0 as PitTile);
    this.shaken = Array.from({ length: this.tiles.length }, () => 0);
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
    if (name !== 'jump' || this.phase !== 'playing' || !p || !p.alive || !p.grounded) return;
    p.vy = -JUMP_V;
    p.grounded = false;
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
        y: r3(p.y),
        face: p.face,
        air: !p.grounded,
      })),
    };
  }

  protected advance(dt: number): void {
    // The floor: the next tile starts to shake when it is due, and one that has shaken long enough is gone.
    this.next -= dt;
    if (this.next <= 0) this.startShaking();
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] !== 1) continue;
      this.shaken[i] += dt;
      if (this.shaken[i] >= SHAKE_S) this.tiles[i] = 2;
    }

    const players = [...this.players.values()].filter((p) => p.alive);
    for (const p of players) {
      p.v += p.dir * WALK_ACCEL * dt;
      // Walking is limited to a top speed; a dash or a bump may carry you faster, and drag brings you back down.
      if (Math.abs(p.v) > WALK_MAX && Math.sign(p.v) === p.dir) p.v -= p.dir * WALK_ACCEL * dt;
      p.v *= Math.max(0, 1 - DRAG * dt);
      p.x = Math.max(EDGE, Math.min(1 - EDGE, p.x + p.v * dt));
      if (p.x === EDGE || p.x === 1 - EDGE) p.v = 0;
      this.fallOrLand(p, dt);
    }
    // Bumps: two players closer than a body, and closing, swap their speeds (a dash is passed on to whoever it hits).
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const gap = b.x - a.x;
        if (Math.abs(gap) >= BODY || Math.abs(a.y - b.y) >= BODY_Y) continue;
        const closing = (a.v - b.v) * Math.sign(gap || 1);
        if (closing <= 0) continue;
        const va = a.v;
        a.v = b.v * BOUNCE;
        b.v = va * BOUNCE;
      }
    }
  }

  /** Gravity pulls a player down; they land on the first layer whose tile is under them as they come down through it (from below they pass through), and are out below the last. */
  private fallOrLand(p: Bumper, dt: number): void {
    const before = p.y;
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    p.grounded = false;
    const tile = tileAt(p.x);
    if (p.vy >= 0 && tile !== -1) {
      for (let l = 0; l < PIT_LAYER_Y.length; l++) {
        if (before <= PIT_LAYER_Y[l] && p.y >= PIT_LAYER_Y[l] && this.tiles[l * PIT_TILES + tile] !== 2) {
          p.y = PIT_LAYER_Y[l];
          p.vy = 0;
          p.grounded = true;
          return;
        }
      }
    }
    if (p.y >= DEATH_Y) this.fall(p);
  }

  /** The next solid tile to go shakes, picked at random with the top layer's tiles likelier; the wait for the one after is shorter. */
  private startShaking(): void {
    const solid = this.tiles.map((t, i) => (t === 0 ? i : -1)).filter((i) => i >= 0);
    const weight = (i: number) => LAYER_WEIGHT[Math.floor(i / PIT_TILES)];
    // Always the same one random number, so one tile does not change the ones after it.
    let roll = this.rng() * solid.reduce((sum, i) => sum + weight(i), 0);
    const pick = solid.find((i) => (roll -= weight(i)) < 0) ?? solid.at(-1);
    if (pick !== undefined) {
      this.tiles[pick] = 1;
      this.shaken[pick] = 0;
    }
    this.crumbled++;
    this.next = Math.max(MIN_CRUMBLE_S, FIRST_CRUMBLE_S * CRUMBLE_SPEEDUP ** this.crumbled);
  }
}
