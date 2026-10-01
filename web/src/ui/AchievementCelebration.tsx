import { useMemo } from 'react';
import type { BadgeDefinition } from '@queueup/shared';
import { st } from './st';

export const CELEBRATION_MS = 3600;

const COLORS = ['var(--acc)', 'oklch(0.82 0.12 160)', '#4A8FE8', '#B87DE8', '#E8C24A', '#ffffff'];
const BURSTS: [number, number, number][] = [
  [-70, -40, 0],
  [80, -80, 0.28],
  [0, -10, 0.55],
];

/** The design's unlock moment: three 26-particle bursts plus a pop-in card. Click to dismiss. */
export function AchievementCelebration({ badge, onDismiss }: { badge: BadgeDefinition; onDismiss: () => void }) {
  const parts = useMemo(
    () =>
      BURSTS.flatMap(([ox, oy, d], b) =>
        Array.from({ length: 26 }, (_, k) => {
          const a = Math.random() * Math.PI * 2;
          const dist = 90 + Math.random() * 130;
          const w = 5 + Math.random() * 5;
          return {
            ox,
            oy,
            delay: d + Math.random() * 0.08,
            dx: Math.cos(a) * dist,
            dy: Math.sin(a) * dist + 40,
            r: `${Math.random() * 720 - 360}deg`,
            color: COLORS[(k + b) % COLORS.length],
            w,
            round: k % 3 === 0,
          };
        }),
      ),
    [],
  );

  return (
    <div
      onClick={onDismiss}
      role="status"
      aria-label={`Achievement unlocked: ${badge.name}`}
      style={st('position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:oklch(0 0 0 / 0.35);animation:qu-fade .25s ease both;cursor:pointer')}
    >
      <div style={{ position: 'absolute', left: '50%', top: '44%', width: 0, height: 0 }}>
        {parts.map((p, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: p.ox,
              top: p.oy,
              width: p.w,
              height: p.round ? p.w : p.w * 0.45,
              borderRadius: p.round ? '50%' : 2,
              background: p.color,
              opacity: 0,
              animation: `qu-burst 1.5s cubic-bezier(.15,.75,.3,1) ${p.delay}s forwards`,
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              ['--r' as string]: p.r,
            }}
          />
        ))}
      </div>
      <div
        style={st(
          'position:relative;width:min(300px, calc(100% - 48px));padding:26px 22px 22px;border-radius:26px;background:var(--sheet);border:1px solid var(--chip);box-shadow:0 24px 60px oklch(0 0 0 / 0.5);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;animation:qu-pop .55s cubic-bezier(.2,1.5,.4,1) .1s both',
        )}
      >
        <span style={st('width:72px;height:72px;border-radius:22px;background:var(--accSoft2);display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:6px')}>{badge.emoji}</span>
        <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--accText)')}>ACHIEVEMENT UNLOCKED</span>
        <span style={st('font:700 24px/1.1 var(--font-display);letter-spacing:-0.02em')}>{badge.name}</span>
        <span style={st('font:400 13.5px/1.4 var(--font-ui);color:var(--muted)')}>{badge.description}</span>
      </div>
    </div>
  );
}
