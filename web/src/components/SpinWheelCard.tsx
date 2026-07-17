import { useState } from 'react';
import type { Game } from '@queueup/shared';
import { backlogGames } from './gameGridLogic';
import { SpinWheelModal } from './SpinWheelModal';
import styles from './SpinWheelCard.module.css';

interface SpinWheelCardProps {
  games: Game[];
  /** Room Settings toggle (issue #173) - when true, only games every current member owns are
   * eligible, so the wheel never lands on something part of the squad would need to buy first. */
  spinOnlyFullyOwned?: boolean;
}

/** Sits in the grid as its own tile (rather than a button in a bar above it), so picking tonight's
 * game reads as part of the collection instead of a toolbar action. Opens the actual spin/reveal
 * in SpinWheelModal - this component only decides whether the wheel has anything to draw from. */
export function SpinWheelCard({ games, spinOnlyFullyOwned }: SpinWheelCardProps) {
  const [open, setOpen] = useState(false);
  const backlog = backlogGames(games);
  const candidates = spinOnlyFullyOwned
    ? backlog.filter((g) => g.ownership !== null && g.ownership.owned === g.ownership.total)
    : backlog;
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
          {locked
            ? spinOnlyFullyOwned
              ? 'No backlog game is owned by everyone yet'
              : 'Add a backlog game to unlock'
            : `Picks from your ${candidates.length}-game backlog`}
        </div>
      </button>

      {open && <SpinWheelModal games={games} candidates={candidates} onClose={() => setOpen(false)} />}
    </>
  );
}
