import type { BadgeDefinition } from '@queueup/shared';
import { Fireworks, prefersReducedMotion } from './PickCelebration';
import { st } from './st';

export const CELEBRATION_MS = 4200;

/** The unlock moment: fireworks (the same show as a spin pick) behind a pop-in card with the
 * achievement's emoji. Click to dismiss. */
export function AchievementCelebration({ badge, onDismiss }: { badge: BadgeDefinition; onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      role="status"
      aria-label={`Achievement unlocked: ${badge.name}`}
      style={st('position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:oklch(0 0 0 / 0.5);animation:qu-fade .25s ease both;cursor:pointer')}
    >
      {!prefersReducedMotion() && <Fireworks durationMs={CELEBRATION_MS} />}
      <div
        style={st(
          'position:relative;width:min(300px, calc(100% - 48px));padding:26px 22px 22px;border-radius:26px;background:var(--sheet);border:1px solid var(--chip);box-shadow:0 0 60px var(--accA45), 0 24px 60px oklch(0 0 0 / 0.5);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;animation:qu-pop .55s cubic-bezier(.2,1.5,.4,1) .1s both',
        )}
      >
        <span style={st('width:84px;height:84px;border-radius:24px;background:var(--accSoft2);display:flex;align-items:center;justify-content:center;font-size:48px;margin-bottom:6px')}>{badge.emoji}</span>
        <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--accText)')}>ACHIEVEMENT UNLOCKED</span>
        <span style={st('font:700 24px/1.1 var(--font-display);letter-spacing:-0.02em')}>{badge.name}</span>
        <span style={st('font:400 13.5px/1.4 var(--font-ui);color:var(--muted)')}>{badge.description}</span>
      </div>
    </div>
  );
}
