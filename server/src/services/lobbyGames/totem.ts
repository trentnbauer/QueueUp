import { TOTEM_CENTER, clampDirection, type TotemPhase, type TotemSnapshot } from '@queueup/shared';
import type { LobbyGame } from './types.js';

// All distances are in arena units (the arena is a unit square), speeds in units per second.
const SPEED = 0.32;
const RADIUS_START = 0.4;
const RADIUS_MIN = 0.13;
/** How long a round takes to shrink the totem from its biggest to its smallest. */
const SHRINK_MS = 40_000;
const PUNCH_REACH = 0.13;
const PUNCH_COOLDOWN_MS = 700;
const KNOCK_SPEED = 1.1;
/** How quickly a shove wears off (per second). */
const KNOCK_DECAY = 5;
const COUNTDOWN_MS = 3000;
const OVER_MS = 4000;
const RING_RADIUS = 0.22;
const MIN_PLAYERS_FOR_ROUND = 2;
const PUNCH_ANIM_CAP_MS = 1000;

interface Player {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Knock-back velocity from a punch. */
  kx: number;
  ky: number;
  alive: boolean;
  wins: number;
  lastPunchAt: number;
  cooldownUntil: number;
}

/** Musical chairs with punches: everyone starts on a round totem that shrinks. Shove other players
 * off its edge; whoever is left standing wins the round, and a new one starts by itself. With one
 * player it is free-roam practice. */
export class TotemGame implements LobbyGame {
  readonly id = 'totem' as const;
  private readonly players = new Map<string, Player>();
  private phase: TotemPhase = 'lobby';
  private radius = RADIUS_START;
  private timerMs = 0;
  private roundMs = 0;
  private winnerId: string | null = null;
  /** The game's own clock in ms, advanced by `tick`. */
  private now = 0;

  join(userId: string): void {
    if (this.players.has(userId)) return;
    this.players.set(userId, {
      id: userId,
      x: TOTEM_CENTER,
      y: TOTEM_CENTER,
      dx: 0,
      dy: 0,
      kx: 0,
      ky: 0,
      // Someone who arrives mid-round watches it, and joins the next one.
      alive: this.phase !== 'playing' && this.phase !== 'over',
      wins: 0,
      lastPunchAt: -Infinity,
      cooldownUntil: 0,
    });
    if (this.phase === 'lobby' || this.phase === 'countdown') this.placeOnRing();
    if (this.phase === 'lobby' && this.players.size >= MIN_PLAYERS_FOR_ROUND) this.startCountdown();
  }

  leave(userId: string): void {
    this.players.delete(userId);
    if (this.phase === 'playing') this.checkRoundEnd();
    else if (this.phase === 'countdown' && this.players.size < MIN_PLAYERS_FOR_ROUND) this.phase = 'lobby';
  }

  input(userId: string, dx: number, dy: number): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.dx = clampDirection(dx);
    p.dy = clampDirection(dy);
  }

  action(userId: string, name: string): void {
    if (name !== 'punch') return;
    const p = this.players.get(userId);
    if (!p || !p.alive || this.phase === 'countdown' || this.phase === 'over') return;
    if (this.now < p.cooldownUntil) return;
    p.lastPunchAt = this.now;
    p.cooldownUntil = this.now + PUNCH_COOLDOWN_MS;
    for (const other of this.players.values()) {
      if (other === p || !other.alive) continue;
      const vx = other.x - p.x;
      const vy = other.y - p.y;
      const dist = Math.hypot(vx, vy);
      if (dist > PUNCH_REACH) continue;
      // Straight away from the puncher; if they stand on the same spot, shove toward the edge.
      const [ux, uy] = dist > 1e-6 ? [vx / dist, vy / dist] : [1, 0];
      other.kx = ux * KNOCK_SPEED;
      other.ky = uy * KNOCK_SPEED;
    }
  }

  tick(dtMs: number): void {
    const dt = Math.min(dtMs, 250) / 1000;
    this.now += dt * 1000;

    switch (this.phase) {
      case 'lobby':
        this.move(dt, false);
        if (this.players.size >= MIN_PLAYERS_FOR_ROUND) this.startCountdown();
        break;
      case 'countdown':
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) {
          this.phase = 'playing';
          this.roundMs = 0;
          this.timerMs = 0;
        }
        break;
      case 'playing':
        this.roundMs += dt * 1000;
        this.radius = Math.max(RADIUS_MIN, RADIUS_START - ((RADIUS_START - RADIUS_MIN) * this.roundMs) / SHRINK_MS);
        this.move(dt, true);
        this.checkRoundEnd();
        break;
      case 'over':
        this.move(dt, false);
        this.timerMs -= dt * 1000;
        if (this.timerMs <= 0) {
          if (this.players.size >= MIN_PLAYERS_FOR_ROUND) this.startCountdown();
          else this.toLobby();
        }
        break;
    }
  }

  snapshot(): TotemSnapshot {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'totem',
      phase: this.phase,
      radius: r(this.radius),
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r(p.x),
        y: r(p.y),
        alive: p.alive,
        wins: p.wins,
        punchAgo: Math.min(PUNCH_ANIM_CAP_MS, Math.round(this.now - p.lastPunchAt)),
        cooldown: Math.max(0, Math.round(p.cooldownUntil - this.now)),
      })),
    };
  }

  /** Walks and shoves everyone for `dt` seconds. In a round (`falls`) anyone past the edge is out;
   * otherwise they are held on the totem. */
  private move(dt: number, falls: boolean): void {
    const decay = Math.exp(-KNOCK_DECAY * dt);
    for (const p of this.players.values()) {
      if (falls && !p.alive) continue;
      const len = Math.hypot(p.dx, p.dy);
      const wx = len > 0 ? (p.dx / len) * SPEED : 0;
      const wy = len > 0 ? (p.dy / len) * SPEED : 0;
      p.x += (wx + p.kx) * dt;
      p.y += (wy + p.ky) * dt;
      p.kx *= decay;
      p.ky *= decay;
      if (Math.abs(p.kx) < 0.01) p.kx = 0;
      if (Math.abs(p.ky) < 0.01) p.ky = 0;

      const vx = p.x - TOTEM_CENTER;
      const vy = p.y - TOTEM_CENTER;
      const dist = Math.hypot(vx, vy);
      if (dist <= this.radius) continue;
      if (falls) {
        p.alive = false;
        p.dx = p.dy = p.kx = p.ky = 0;
      } else {
        p.x = TOTEM_CENTER + (vx / dist) * this.radius;
        p.y = TOTEM_CENTER + (vy / dist) * this.radius;
      }
    }
  }

  /** A round ends when one player (or none) is left standing. */
  private checkRoundEnd(): void {
    if (this.phase !== 'playing') return;
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length > 1) return;
    this.phase = 'over';
    this.timerMs = OVER_MS;
    this.winnerId = alive.length === 1 ? alive[0].id : null;
    if (alive.length === 1) alive[0].wins++;
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.timerMs = COUNTDOWN_MS;
    this.radius = RADIUS_START;
    this.winnerId = null;
    for (const p of this.players.values()) {
      p.alive = true;
      p.dx = p.dy = p.kx = p.ky = 0;
    }
    this.placeOnRing();
  }

  private toLobby(): void {
    this.phase = 'lobby';
    this.radius = RADIUS_START;
    this.winnerId = null;
    for (const p of this.players.values()) p.alive = true;
    this.placeOnRing();
  }

  /** Spreads everyone evenly around a ring so nobody starts on top of anyone else. */
  private placeOnRing(): void {
    const all = [...this.players.values()];
    all.forEach((p, i) => {
      const angle = (i / Math.max(1, all.length)) * Math.PI * 2 - Math.PI / 2;
      const ring = all.length === 1 ? 0 : RING_RADIUS;
      p.x = TOTEM_CENTER + Math.cos(angle) * ring;
      p.y = TOTEM_CENTER + Math.sin(angle) * ring;
    });
  }
}
