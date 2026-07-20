import type { GameStatus } from '@queueup/shared';
import { GAME_STATUS_LABEL, GAME_STATUS_LIST } from './gameGridLogic';
import styles from './BulkActionBar.module.css';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  busy?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onSetStatus: (status: GameStatus) => void;
  onRemove: () => void;
  onCancel: () => void;
}

/** Shown once bulk-select mode is on (issue #205) - lets a status be applied to every selected
 * Personal Shelf game in one action instead of one card at a time. */
export function BulkActionBar({
  selectedCount,
  totalCount,
  busy,
  onSelectAll,
  onClear,
  onSetStatus,
  onRemove,
  onCancel,
}: BulkActionBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.count}>{selectedCount} selected</span>
        <button type="button" className={styles.linkButton} onClick={onSelectAll} disabled={selectedCount === totalCount}>
          Select all
        </button>
        <button type="button" className={styles.linkButton} onClick={onClear} disabled={selectedCount === 0}>
          Clear
        </button>
      </div>
      <div className={styles.right}>
        <span className={styles.setStatusLabel}>Set status:</span>
        {GAME_STATUS_LIST.map((status) => (
          <button
            key={status}
            type="button"
            className={styles.statusButton}
            disabled={selectedCount === 0 || busy}
            onClick={() => onSetStatus(status)}
          >
            {GAME_STATUS_LABEL[status]}
          </button>
        ))}
        <button type="button" className={styles.removeButton} disabled={selectedCount === 0 || busy} onClick={onRemove}>
          Remove
        </button>
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={busy}>
          Done
        </button>
      </div>
    </div>
  );
}
