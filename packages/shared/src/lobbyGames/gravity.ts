import { GRAVITY_MID_H, GRAVITY_PLAYER_R, GRAVITY_SPIKE_H, GRAVITY_X, type GravityObstacle, type GravitySnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// Everything is in screens: x runs 0..1 across, y 0 (floor) to 1 (ceiling). The course scrolls from the right.
const SPEED_START = 0.6;
const SPEED_GAIN = 0.02; // per second of the run
const SPEED_MAX = 1.6;
const SPAWN_AHEAD = 1.3;
/** A flip crosses the corridor in this long: slow enough that tapping again every FLIP_COOLDOWN_S keeps a player floating near the middle. */
const FLIP_S = 0.7;
/** Obstacles grow with how far a run has come: this much bigger (all round) by SIZE_FULL_AT screens, and no more after. */
const SIZE_GAIN = 0.7;
const SIZE_FULL_AT = 60;
/** Spikes are this many seconds of travel apart (edge to edge), plus up to GAP_EXTRA_S more: always enough to flip in. */
const GAP_MIN_S = 0.85;
const GAP_EXTRA_S = 0.7;
const SPIKE_MIN_W = 0.06;
const SPIKE_EXTRA_W = 0.08;
const VISIBLE_BEHIND = 0.2;
/** A flip can be turned round part way across, but not again for this long, so mashing the button cannot hold a player still in
 * the middle of the corridor, out of reach of the spikes. */
const FLIP_COOLDOWN_S = 0.18;
/** The share of obstacles that are spikes on the floor, spikes on the ceiling, and the rest floating blocks in the middle. */
const FLOOR_SHARE = 0.4;
const CEILING_SHARE = 0.8;

interface Flipper extends RoundPlayer {
  /** Height of their middle, 0 (floor) to 1 (ceiling), between GRAVITY_PLAYER_R and 1 - GRAVITY_PLAYER_R. */
  y: number;
  /** The side they are on or heading for: 0 floor, 1 ceiling. */
  side: number;
  /** Seconds before they can flip again. */
  cool: number;
}

const FLOOR_Y = GRAVITY_PLAYER_R;
const CEILING_Y = 1 - GRAVITY_PLAYER_R;

/** Run along the floor or the ceiling and flip between them to dodge the spikes that come at you from either
 * side, everyone on the same course. Hit a spike and you are out. See RoundGame for how runs start and end. */
export class GravityGame extends RoundGame<Flipper> {
  readonly id = 'gravity' as const;
  private speed = SPEED_START;
  private spikes: GravityObstacle[] = [];
  private spawned = 0;
  private nextEdgeX = 0;

  /** Each player's own device works out their flips (see RoundGame.clientSim). */
  get clientSim(): boolean {
    return true;
  }

  protected readReport(f: Flipper, r: Record<string, number>): void {
    f.y = Math.min(CEILING_Y, Math.max(FLOOR_Y, RoundGame.num(r.y, f.y)));
    f.side = r.s === 1 ? 1 : 0;
  }

  protected writeReport(f: Flipper): Record<string, number> {
    return { y: Math.round(f.y * 1000) / 1000, s: f.side };
  }

  protected createPlayer(id: string, alive: boolean): Flipper {
    return { id, y: FLOOR_Y, side: 0, cool: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(f: Flipper): void {
    f.y = FLOOR_Y;
    f.side = 0;
    f.cool = 0;
  }

  protected resetCourse(): void {
    this.speed = SPEED_START;
    this.spikes = [];
    this.spawned = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // The first spike is a little way in, so there is time to see it coming.
    this.nextEdgeX = 1.1;
    this.spawnSpikes();
  }

  input(): void {
    // Flipping is an action; there is nothing to hold.
  }

  /** Flips to the other side, from wherever the player is: part way across, it turns them round. A short wait between flips
   * keeps it from being used to hover in the middle. */
  action(userId: string, name: string): void {
    if (name !== 'flip' || this.phase !== 'playing') return;
    const f = this.players.get(userId);
    if (!f?.alive || f.cool > 0) return;
    f.side = 1 - f.side;
    f.cool = FLIP_COOLDOWN_S;
  }

  snapshot(): GravitySnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'gravity',
      phase: this.phase,
      meters: this.meters,
      speed: r3(this.speed),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      spikes: this.spikes.map((s) => ({ x: r3(s.x - this.distance), w: r3(s.w), h: r3(s.h), side: s.side, n: s.n })).filter((s) => s.x > -VISIBLE_BEHIND && s.x < SPAWN_AHEAD),
      players: [...this.players.values()].map((f) => ({
        id: f.id,
        y: r3(f.y),
        side: f.side,
        alive: f.alive,
        wins: f.wins,
        meters: f.alive && this.phase === 'playing' ? this.meters : f.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    this.speed = Math.min(SPEED_MAX, SPEED_START + SPEED_GAIN * (this.roundMs / 1000));
    this.distance += this.speed * dt;
    this.spawnSpikes();

    const cross = ((CEILING_Y - FLOOR_Y) / FLIP_S) * dt;
    for (const f of this.players.values()) {
      if (!f.alive || !this.simulated(f)) continue;
      f.cool = Math.max(0, f.cool - dt);
      const target = f.side === 1 ? CEILING_Y : FLOOR_Y;
      f.y = f.y < target ? Math.min(target, f.y + cross) : Math.max(target, f.y - cross);
      if (this.hits(f)) this.knockOut(f);
    }
    this.spikes = this.spikes.filter((s) => s.x + s.w / 2 - this.distance > -VISIBLE_BEHIND);
  }

  private hits(f: Flipper): boolean {
    for (const s of this.spikes) {
      const rel = s.x - this.distance;
      if (Math.abs(rel - GRAVITY_X) >= (s.w + GRAVITY_PLAYER_R * 2) / 2) continue;
      if (s.side === 2) {
        // The block in the middle: anyone whose body is level with it, which is whoever is flying across.
        if (Math.abs(f.y - 0.5) < s.h / 2 + GRAVITY_PLAYER_R) return true;
      } else if (s.side === 0 ? f.y - GRAVITY_PLAYER_R < s.h : f.y + GRAVITY_PLAYER_R > 1 - s.h) return true;
    }
    return false;
  }

  private spawnSpikes(): void {
    while (this.nextEdgeX < this.distance + SPAWN_AHEAD) {
      const w = SPIKE_MIN_W + this.rng() * SPIKE_EXTRA_W;
      const roll = this.rng();
      const side = roll < FLOOR_SHARE ? 0 : roll < CEILING_SHARE ? 1 : 2;
      // Sized by where on the course it is (not by the clock), so it is the same wherever the steps happen to fall.
      const size = 1 + SIZE_GAIN * Math.min(1, this.nextEdgeX / SIZE_FULL_AT);
      const wide = w * size;
      this.spikes.push({ x: this.nextEdgeX + wide / 2, w: wide, h: (side === 2 ? GRAVITY_MID_H : GRAVITY_SPIKE_H) * size, side, n: ++this.spawned });
      this.nextEdgeX += wide + this.speed * (GAP_MIN_S + this.rng() * GAP_EXTRA_S);
    }
  }
}
