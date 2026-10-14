import type { LobbyGameSnapshot } from '@queueup/shared';
import { prefersReducedMotion } from '../../ui/PickCelebration';
import { FONT, STAGE, type StageTheme } from './theme';

type Kind = 'shard' | 'spark' | 'ring' | 'text' | 'conf';

interface Particle {
  k: Kind;
  /** Position as fractions of the arena. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  /** Size as a fraction of the arena. */
  sz: number;
  r: number;
  vr: number;
  g: number;
  sway: number;
  text: string;
}

const MAX_PARTICLES = 500;

/** What the effects need to know about the current frame, supplied by `renderScene`. */
export interface FxFrame {
  me: string;
  /** A player's colour. */
  colorOf: (id: string) => string;
  /** Where a player was on the arena (fractions of its size) in `snapshot` - for the knock-out burst. */
  anchor: (snapshot: LobbyGameSnapshot, index: number) => { x: number; y: number };
  /** The words floated up from a knock-out. */
  outText: string;
  youOutText: string;
}

/** The arena's effects and the little bit of memory they need between frames: knock-out explosions,
 * screen shake and a red flash when it is you, winner confetti, and the scroll position of the
 * background. One lives for as long as the lobby panel is open (the panel creates it and passes it
 * to every `draw`). It finds out what happened by comparing each snapshot with the one before, so a
 * game never has to say "someone just died". Shake, flash and confetti are skipped for people who ask
 * their device for reduced motion. */
export class LobbyFx {
  readonly reduced = prefersReducedMotion();
  shake = 0;
  flash = 0;
  /** How far the background has scrolled, in screens. */
  scroll = 0;
  private particles: Particle[] = [];
  private prev: LobbyGameSnapshot | null = null;
  private lastNow = 0;
  private confettiRun = -1;
  private readonly firstSeen = new WeakMap<object, number>();

  /** Seconds since this snapshot arrived (at most a snapshot interval's worth), so things can keep
   * moving smoothly between the server's ~15 snapshots a second. */
  age(snapshot: object, now: number): number {
    if (!this.firstSeen.has(snapshot)) this.firstSeen.set(snapshot, now);
    return Math.min(0.12, (now - (this.firstSeen.get(snapshot) ?? now)) / 1000);
  }

  /** Advances the effects to `now` and starts any the new snapshot calls for. */
  update(snapshot: LobbyGameSnapshot, now: number, frame: FxFrame): void {
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    const prev = this.prev && this.prev.id === snapshot.id ? this.prev : null;

    if (prev && prev !== snapshot) {
      if (prev.phase === 'playing') {
        snapshot.players.forEach((p) => {
          const before = prev.players.findIndex((q) => q.id === p.id);
          if (before >= 0 && prev.players[before].alive && !p.alive) this.explode(frame.anchor(prev, before), frame.colorOf(p.id), p.id === frame.me, frame);
        });
      }
      if (snapshot.phase === 'over' && prev.phase !== 'over' && snapshot.winnerId && snapshot.run !== this.confettiRun) {
        this.confettiRun = snapshot.run;
        if (!this.reduced) this.confetti(frame.colorOf(snapshot.winnerId));
      }
    }
    if (!prev) this.particles = [];
    this.prev = snapshot;

    if (snapshot.phase === 'playing') this.scroll += snapshot.speed * dt;
    for (const f of this.particles) {
      f.life += dt;
      if (f.k === 'shard' || f.k === 'spark' || f.k === 'conf') {
        const drag = f.k === 'conf' ? 1 : Math.pow(0.9, dt * 60);
        f.vx *= drag;
        f.vy = f.vy * drag + f.g * dt;
        f.x += f.vx * dt + (f.k === 'conf' ? Math.sin(f.life * 3 + f.sway) * 0.0015 : 0);
        f.y += f.vy * dt;
        f.r += f.vr * dt;
      }
    }
    this.particles = this.particles.filter((f) => f.life < f.max);
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  private add(p: Partial<Particle> & { k: Kind; x: number; y: number; c: string; max: number }): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ vx: 0, vy: 0, life: 0, sz: 0.01, r: 0, vr: 0, g: 0, sway: 0, text: '', ...p });
  }

  private explode(at: { x: number; y: number }, color: string, mine: boolean, frame: FxFrame): void {
    const { x, y } = at;
    const colors = [color, color, '#ffffff', 'oklch(0.83 0.15 85)', 'oklch(0.74 0.15 45)'];
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.15 + Math.random() * 0.55;
      this.add({ k: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.25, max: 0.7 + Math.random() * 0.7, c: colors[i % colors.length], sz: 0.006 + Math.random() * 0.014, r: Math.random() * 6, vr: (Math.random() - 0.5) * 18, g: 1.1 });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.4 + Math.random() * 0.6;
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: 0.25 + Math.random() * 0.3, c: 'oklch(0.9 0.12 80)', sz: 0.004 });
    }
    this.add({ k: 'ring', x, y, max: 0.5, c: color });
    this.add({ k: 'ring', x, y, life: -0.08, max: 0.6, c: '#fff' });
    this.add({ k: 'text', x, y: y - 0.05, max: 1.1, c: 'oklch(0.76 0.14 25)', text: mine ? frame.youOutText : frame.outText });
    if (!this.reduced) {
      this.shake = Math.max(this.shake, mine ? 1 : 0.4);
      if (mine) this.flash = 1;
    }
  }

  private confetti(winnerColor: string): void {
    const colors = [winnerColor, 'oklch(0.74 0.15 45)', 'oklch(0.83 0.15 85)', 'oklch(0.82 0.12 160)', '#fff'];
    for (let i = 0; i < 70; i++) {
      this.add({ k: 'conf', x: Math.random(), y: -0.05 - Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.1, vy: 0.18 + Math.random() * 0.25, max: 3.6, c: colors[i % colors.length], sz: 0.01 + Math.random() * 0.01, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, g: 0.05, sway: Math.random() * 6 });
    }
  }

  /** Draws the particles over the world, in arena pixels. */
  draw(ctx: CanvasRenderingContext2D, S: number, _theme: StageTheme): void {
    for (const f of this.particles) {
      if (f.life < 0) continue;
      const k = 1 - f.life / f.max;
      ctx.save();
      if (f.k === 'ring') {
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = k;
        ctx.lineWidth = S * 0.012 * k + 1;
        ctx.beginPath();
        ctx.arc(f.x * S, f.y * S, S * (0.02 + 0.16 * (1 - k * k)), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.k === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x * S, f.y * S);
        ctx.lineTo((f.x - f.vx * 0.05) * S, (f.y - f.vy * 0.05) * S);
        ctx.stroke();
      } else if (f.k === 'shard' || f.k === 'conf') {
        ctx.translate(f.x * S, f.y * S);
        ctx.rotate(f.r);
        ctx.globalAlpha = f.k === 'conf' ? Math.min(1, k * 3) : k;
        ctx.fillStyle = f.c;
        const z = f.sz * S;
        if (f.k === 'conf') ctx.fillRect(-z / 2, -z / 4, z, z / 2);
        else {
          ctx.beginPath();
          ctx.moveTo(0, -z);
          ctx.lineTo(z * 0.8, z * 0.6);
          ctx.lineTo(-z * 0.7, z * 0.4);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const y = (f.y - (1 - k) * 0.08) * S;
        const x = Math.min(S * 0.8, Math.max(S * 0.2, f.x * S));
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = STAGE.ink;
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.c;
        ctx.fillText(f.text, x, y);
      }
      ctx.restore();
    }
  }
}
