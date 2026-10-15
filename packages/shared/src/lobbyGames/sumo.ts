import { clampDirection, type SumoSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

// Distances are fractions of the line the platform sits on (0..1); times are seconds.
/** The platform starts this wide (centred) and shrinks from both ends, to a minimum, so a run always ends. */
const START_L = 0.1;
const START_R = 0.9;
const SHRINK_PER_END = 0.012; // each end moves in this far every second
const MIN_WIDTH = 0.24;
/** A run that is still going at this time ends with no winner. */
const RUN_LIMIT_S = 120;
const WALK_ACCEL = 1.6;
const WALK_MAX = 0.28;
/** Friction on speed along the platform, per second. Walking stops quickly; a shove's knock-back slides. */
const DRAG = 3.2;
/** A shove hits anyone this close in front (and not behind), knocking them away, and lunges the shover. */
const SHOVE_RANGE = 0.09;
const KNOCK = 0.95;
const LUNGE = 0.2;
const SHOVE_COOLDOWN_S = 0.7;
/** How long a shove is shown for. */
const SHOVE_SHOW_S = 0.25;

interface Wrestler extends RoundPlayer {
  x: number;
  /** Speed along the platform (screens a second, left is negative). */
  v: number;
  dir: number;
  face: number;
  cooldown: number;
  shoveShow: number;
}

/** A side-on platform over a drop that shrinks from both ends. Everyone walks left and right on it and has a
 * shove button; a shove knocks anyone just in front of you away from you. Fall off an end and you are out;
 * last one on wins. Nobody collides except by shoving. Needs 2 players, so a bot joins a lone player. See
 * RoundGame for how runs start and end. */
export class SumoGame extends RoundGame<Wrestler> {
  readonly id = 'sumo' as const;
  readonly minPlayers = 2;

  /** The score is the seconds a player stayed on; for the run, how long it has lasted. */
  protected get meters(): number {
    return Math.floor(this.roundMs / 1000);
  }

  protected createPlayer(id: string, alive: boolean): Wrestler {
    return { id, x: 0.5, v: 0, dir: 0, face: 1, cooldown: 0, shoveShow: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Wrestler): void {
    p.v = 0;
    p.dir = 0;
    p.cooldown = 0;
    p.shoveShow = 0;
  }

  protected resetCourse(): void {
    // Everyone is spread evenly along the starting platform, facing the middle.
    const players = [...this.players.values()];
    players.forEach((p, i) => {
      p.x = START_L + ((i + 0.5) / players.length) * (START_R - START_L);
      p.face = p.x < 0.5 ? 1 : -1;
    });
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  /** The platform's two ends right now. */
  private get platform(): { l: number; r: number } {
    const shrink = Math.min(SHRINK_PER_END * (this.roundMs / 1000), (START_R - START_L - MIN_WIDTH) / 2);
    return { l: START_L + shrink, r: START_R - shrink };
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.dir = clampDirection(dx);
    if (p.dir !== 0) p.face = p.dir;
  }

  action(userId: string, name: string): void {
    if (name !== 'shove') return;
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || p.cooldown > 0) return;
    p.cooldown = SHOVE_COOLDOWN_S;
    p.shoveShow = SHOVE_SHOW_S;
    p.v += p.face * LUNGE;
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const d = (q.x - p.x) * p.face;
      if (d > 0 && d <= SHOVE_RANGE) q.v += p.face * KNOCK;
    }
  }

  snapshot(): SumoSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const { l, r } = this.platform;
    return {
      id: 'sumo',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      platform: { l: r3(l), r: r3(r) },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        face: p.face,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
        cooldownMs: Math.round(Math.max(0, p.cooldown) * 1000),
        shoveMs: Math.round(Math.max(0, p.shoveShow) * 1000),
      })),
    };
  }

  protected advance(dt: number): void {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.shoveShow = Math.max(0, p.shoveShow - dt);
      // Walking pushes toward a top speed; anything faster (a knock-back) is only slowed by friction.
      if (p.dir !== 0 && Math.abs(p.v) < WALK_MAX) p.v += p.dir * WALK_ACCEL * dt;
      p.v *= Math.exp(-DRAG * dt);
      p.x += p.v * dt;
    }
    const { l, r } = this.platform;
    for (const p of this.players.values()) if (p.alive && (p.x < l || p.x > r)) this.knockOut(p);
    if (this.roundMs / 1000 >= RUN_LIMIT_S) this.endRun(null);
  }
}

/** A bot that walks toward the nearest other player and shoves when one is in range (with a human-ish
 * delay), and backs away from an edge it is too close to. Beatable: it is slow to notice and shoves late. */
export function sumoBrain(id: string, rng: () => number): BotBrain {
  let react = 0.25 + rng() * 0.3;
  return (snap, dtMs) => {
    if (snap.id !== 'sumo' || snap.phase !== 'playing') return { dx: 0 };
    const me = snap.players.find((p) => p.id === id);
    if (!me?.alive) return { dx: 0 };
    const { l, r } = snap.platform;
    const edge = 0.05;
    if (me.x < l + edge) return { dx: 1 };
    if (me.x > r - edge) return { dx: -1 };
    const others = snap.players.filter((p) => p.id !== id && p.alive);
    if (others.length === 0) return { dx: 0 };
    const target = others.reduce((a, b) => (Math.abs(b.x - me.x) < Math.abs(a.x - me.x) ? b : a));
    const gap = target.x - me.x;
    const toward = gap > 0 ? 1 : -1;
    if (Math.abs(gap) <= 0.08 && me.face === toward) {
      react -= dtMs / 1000;
      if (react <= 0 && me.cooldownMs === 0) {
        react = 0.25 + rng() * 0.3;
        return { dx: 0, actions: ['shove'] };
      }
      return { dx: 0 };
    }
    react = Math.max(react, 0.15);
    return { dx: Math.abs(gap) > 0.06 ? toward : 0 };
  };
}
