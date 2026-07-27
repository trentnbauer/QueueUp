import type { GameStatus } from '@queueup/shared';
import styles from './QuickAddStatusButtons.module.css';

interface QuickAddStatusButtonsProps {
  added: boolean;
  /** Whether the click that set `added` actually became a pending suggestion (issue #362 approval-
   * gated rooms) rather than landing directly - drives the "Suggested ✓" vs "Added ✓" wording. */
  suggested: boolean;
  /** True while this row's own add request is in flight - all three buttons disable/show an
   * ellipsis together rather than tracking which of the three was actually clicked, since only one
   * request is ever in flight per row at a time anyway. */
  adding: boolean;
  disabled: boolean;
  onAdd: (status: GameStatus) => void;
}

const QUICK_ADD_OPTIONS: { status: GameStatus; icon: string; label: string }[] = [
  { status: 'wishlist', icon: '🔖', label: 'Add to Wishlist' },
  { status: 'backlog', icon: '⏸️', label: 'Add to Backlog' },
  { status: 'playing', icon: '▶️', label: 'Add as Playing' },
];

/** Three one-click status buttons, replacing a single ambiguous "Add" button across every game-
 * search-result row in the app (Add Game's Search/Popular tabs, the DLC browse-and-add modal) -
 * lets whoever's adding a game decide where it lands right away (Wishlist/Backlog/Playing),
 * instead of every add landing wherever defaultStatusForRelease's release-date guess puts it. */
export function QuickAddStatusButtons({ added, suggested, adding, disabled, onAdd }: QuickAddStatusButtonsProps) {
  if (added) {
    return <span className={styles.added}>{suggested ? 'Suggested ✓' : 'Added ✓'}</span>;
  }

  return (
    <div className={styles.group} role="group" aria-label="Add to…">
      {QUICK_ADD_OPTIONS.map(({ status, icon, label }) => (
        <button
          key={status}
          type="button"
          className={styles.button}
          onClick={() => onAdd(status)}
          disabled={disabled}
          aria-label={label}
          title={adding ? 'Adding…' : label}
        >
          {adding ? '…' : icon}
        </button>
      ))}
    </div>
  );
}
