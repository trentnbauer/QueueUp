import { useEffect, useRef, useState } from 'react';
import type { Game } from '@queueup/shared';
import { coverBg } from './primitives';
import { st } from './st';
import { t, useT } from '../i18n';

const EVENT = 'queueup:celebrate-pick';
/** How long the fireworks run before the overlay fades out on its own. */
const SHOW_MS = 4200;

interface Picked {
  title: string;
  coverImageUrl: string | null;
  meta: string;
}

/** Shows fireworks with `game`'s box art (#804) - when a spin's pick is agreed ("Let's play"), for
 * whoever pressed it and everyone else watching that room's spin. */
export function celebratePick(game: Game): void {
  const meta = [game.genre?.split(',')[0], game.timeToBeatHours ? t('spin.result.hours', { n: game.timeToBeatHours }) : ''].filter(Boolean).join(' · ');
  window.dispatchEvent(new CustomEvent<Picked>(EVENT, { detail: { title: game.title, coverImageUrl: game.coverImageUrl, meta } }));
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  hue: number;
}

/** Canvas fireworks: rockets rise from the bottom and burst into falling, fading sparks, for about
 * `durationMs`. Shared by the spin pick (#804) and achievement unlocks. */
export function Fireworks({ durationMs = SHOW_MS }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const start = performance.now();
    let nextLaunch = 0;
    let last = start;
    let raf = 0;

    const burst = (r: Rocket) => {
      const n = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const speed = 90 + Math.random() * 170;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: 1 + Math.random() * 0.7, hue: r.hue + (Math.random() * 40 - 20), size: 1.6 + Math.random() * 1.6 });
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      const elapsed = t - start;
      // Launch a rocket every ~260ms for the first 3 seconds.
      if (elapsed < durationMs - 1200 && elapsed >= nextLaunch) {
        nextLaunch = elapsed + 180 + Math.random() * 180;
        rockets.push({ x: w() * (0.12 + Math.random() * 0.76), y: h(), vy: -(h() * 0.9 + Math.random() * h() * 0.3), targetY: h() * (0.12 + Math.random() * 0.35), hue: Math.random() * 360 });
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w(), h());
      ctx.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        // Damping per 60fps frame, scaled to this frame's length so high-refresh screens match.
        r.vy *= Math.pow(0.985, dt * 60);
        ctx.fillStyle = `hsl(${r.hue} 100% 80%)`;
        ctx.fillRect(r.x - 1.5, r.y - 6, 3, 10);
        if (r.y <= r.targetY) {
          burst(r);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        if (s.life >= s.max) {
          sparks.splice(i, 1);
          continue;
        }
        const drag = Math.pow(0.97, dt * 60);
        s.vx *= drag;
        s.vy = s.vy * drag + 140 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = 1 - s.life / s.max;
        ctx.fillStyle = `hsl(${s.hue} 95% ${55 + fade * 25}% / ${fade})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.5 + fade * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      if (elapsed < durationMs + 1500 || sparks.length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [durationMs]);
  return <canvas ref={ref} aria-hidden style={st('position:absolute;inset:0;width:100%;height:100%;pointer-events:none')} />;
}

export function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Mounted once (see Overlays): listens for celebratePick and shows the fireworks and box art. */
export function PickCelebrationHost() {
  const t = useT();
  const [picked, setPicked] = useState<(Picked & { key: number }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => setPicked({ ...(e as CustomEvent<Picked>).detail, key: Date.now() });
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!picked) return;
    const timer = setTimeout(() => setPicked(null), SHOW_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [picked]);
  if (!picked) return null;
  const calm = prefersReducedMotion();
  return (
    <div
      key={picked.key}
      onClick={() => setPicked(null)}
      role="status"
      aria-label={t('spin.celebrate.aria', { title: picked.title })}
      style={st('position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:oklch(0 0 0 / 0.55);animation:qu-fade .25s ease both;cursor:pointer')}
    >
      {!calm && <Fireworks />}
      <div style={st('position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:0 24px;animation:qu-pop .6s cubic-bezier(.2,1.5,.4,1) .1s both')}>
        <span
          style={st(
            `width:min(200px,46vw);aspect-ratio:3/4;border-radius:18px;background:${coverBg(picked.title, picked.coverImageUrl)};box-shadow:0 0 0 3px var(--acc), 0 0 60px var(--accA70), 0 30px 70px oklch(0 0 0 / 0.6);margin-bottom:10px`,
          )}
        />
        <span style={st('font:600 12px var(--font-mono);letter-spacing:0.1em;color:var(--accText)')}>{t('spin.celebrate.kicker')}</span>
        <span style={st('font:800 32px/1.05 var(--font-display);letter-spacing:-0.03em;color:#fff;text-wrap:balance;max-width:520px')}>{picked.title}</span>
        {picked.meta && <span style={st('font:500 14px var(--font-ui);color:oklch(1 0 0 / 0.75)')}>{picked.meta}</span>}
      </div>
    </div>
  );
}
