import { useEffect, useRef, useState } from 'react';
import { playSound } from '../lib/sound';
import { prefersReducedMotion } from './PickCelebration';
import { st } from './st';

const KEY = 'sq-spin-effects';
/** Same cap as the mini games' effects kit (`lobbyGames/kit/fx.ts`). */
const MAX_PARTICLES = 500;
/** A second result inside this window gets a shorter burst, so a table that spins often doesn't tire of it. */
const REPEAT_WINDOW_MS = 90_000;
const BURST_MS = 2200;
const KICK_MS = 520;
const COLOURS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f43'];

let lastBurstAt = 0;

/** Whether the extra spin effects (shake and confetti) are on for this person: on unless they turned them off. Remembered in this browser. */
export function spinEffectsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSpinEffects(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** Presentation only - which game a spin picks is decided on the server. When the spin settles (for everyone in the room at the same
 * moment, since `settled` comes from the shared clock) this kicks the dialog and fires confetti, unless effects are off or the device
 * asks for reduced motion. Opening an already-settled spin fires nothing. `repeat` is set for a second result soon after the last. */
export function useSpinHype(settled: boolean, on: boolean): { kick: number; burst: { key: number; repeat: boolean } | null } {
  const was = useRef(settled);
  const [kick, setKick] = useState(0);
  const [burst, setBurst] = useState<{ key: number; repeat: boolean } | null>(null);
  useEffect(() => {
    const justSettled = settled && !was.current;
    was.current = settled;
    if (justSettled) playSound('spinResult');
    if (!justSettled || !on || prefersReducedMotion()) return;
    const now = Date.now();
    const repeat = now - lastBurstAt < REPEAT_WINDOW_MS;
    lastBurstAt = now;
    setKick((k) => k + 1);
    setBurst({ key: now, repeat });
    const timer = setTimeout(() => setBurst(null), BURST_MS + 300);
    return () => clearTimeout(timer);
  }, [settled, on]);
  return { kick, burst };
}

/** The dialog's jolt: a short shake. Apply as `animation` on the element, keyed by `kick` so each result restarts it. */
export const KICK_ANIMATION = `qu-kick ${KICK_MS}ms ease-out both`;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
}

/** Confetti shot up from the bottom corners and the middle of the screen, then falling. Short for a repeat spin. */
export function ConfettiBurst({ repeat }: { repeat: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(MAX_PARTICLES, repeat ? 70 : 180);
    const life = repeat ? BURST_MS * 0.6 : BURST_MS;
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      const from = i % 3; // left corner, middle, right corner
      const x = from === 0 ? w * 0.08 : from === 1 ? w * 0.5 : w * 0.92;
      const aim = from === 0 ? -0.35 : from === 2 ? 0.35 : 0;
      const a = -Math.PI / 2 + aim + (Math.random() - 0.5) * 0.9;
      const speed = h * (0.55 + Math.random() * 0.55);
      return { x, y: h * 0.98, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[i % COLOURS.length] };
    });
    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, (life - elapsed) / 500));
      for (const p of pieces) {
        p.vy += h * 1.1 * dt;
        p.vx *= Math.pow(0.985, dt * 60);
        p.vy *= Math.pow(0.992, dt * 60);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < life) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [repeat]);
  return <canvas ref={ref} aria-hidden style={st('position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:450')} />;
}
