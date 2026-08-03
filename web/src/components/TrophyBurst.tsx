import { useEffect, useState, type CSSProperties } from 'react';
import type { BadgeDefinition } from '@queueup/shared';
import styles from './TrophyBurst.module.css';

// Kept a bit longer than the longest CSS animation below so nothing visibly cuts off before this
// unmounts itself. Exported so AchievementUnlockContext can time advancing its queue to the next
// pending unlock off the same duration, instead of a second, separately-maintained magic number.
export const TROPHY_BURST_DURATION_MS = 2400;

// One trophy starts from each screen corner (issue #489's own wording: "trophies fly in from the
// corners") and converges on center - fixed positions, not randomized like ConfettiBurst's
// particles, since "the four corners" is the specific effect asked for.
const CORNERS: { x: string; y: string }[] = [
  { x: '-45vw', y: '-45vh' },
  { x: '45vw', y: '-45vh' },
  { x: '-45vw', y: '45vh' },
  { x: '45vw', y: '45vh' },
];

type TrophyStyle = CSSProperties & { '--start-x': string; '--start-y': string };

interface TrophyBurstProps {
  badge: BadgeDefinition;
}

/** A one-shot celebratory unlock moment for a newly-earned QueueUp badge (issue #489) - same
 * hand-rolled-CSS-keyframes idiom as ConfettiBurst.tsx (issue #296), no animation library. Mount
 * fresh per unlock (e.g. `key={badge.key}` from the caller - see AchievementUnlockContext, which
 * queues one of these at a time so back-to-back unlocks don't overlap) - it unmounts itself once
 * the animation finishes. Rendered near the app root (not inside whatever component triggered the
 * unlock), since the triggering action can be anywhere - a status change, a room join, a Spin the
 * Wheel ready-up - and the celebration should read the same regardless of where on screen that
 * happened. */
export function TrophyBurst({ badge }: TrophyBurstProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), TROPHY_BURST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.container} aria-hidden="true">
      {CORNERS.map((corner, i) => (
        <span
          key={i}
          className={styles.trophy}
          style={{ '--start-x': corner.x, '--start-y': corner.y, animationDelay: `${i * 60}ms` } as TrophyStyle}
        >
          {badge.emoji}
        </span>
      ))}
      <div className={styles.card}>
        <span className={styles.cardEmoji}>{badge.emoji}</span>
        <span className={styles.cardLabel}>Achievement unlocked</span>
        <span className={styles.cardName}>{badge.name}</span>
      </div>
    </div>
  );
}
