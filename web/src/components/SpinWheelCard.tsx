import { useState } from 'react';
import type { Game } from '@squadqueue/shared';
import { playNextGames } from './gameGridLogic';
import { SpinWheelModal } from './SpinWheelModal';
import styles from './SpinWheelCard.module.css';

interface SpinWheelCardProps {
  games: Game[];
}

/** Sits in the grid as its own tile (rather than a button in a bar above it), so picking tonight's
 * game reads as part of the collection instead of a toolbar action. Opens the actual spin/reveal
 * in SpinWheelModal - this component only decides whether the wheel has anything to draw from. */
export function SpinWheelCard({ games }: SpinWheelCardProps) {
  const [open, setOpen] = useState(false);
  const candidates = playNextGames(games);
  const locked = candidates.length === 0;

  return (
    <>
      <button
        type="button"
        className={`${styles.card} ${locked ? styles.locked : ''}`}
        onClick={() => setOpen(true)}
        disabled={locked}
      >
        <div className={styles.icon} aria-hidden="true">
          🎰
        </div>
        <div className={styles.label}>Spin the Wheel</div>
        <div className={styles.hint}>
          {locked ? 'Vote on a few backlog games to unlock' : `Picks from your top ${candidates.length}`}
        </div>
      </button>

      {open && <SpinWheelModal games={games} candidates={candidates} onClose={() => setOpen(false)} />}
    </>
  );
}
