import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { PillFilter } from './PillFilter';
import styles from './FilterModal.module.css';

interface FilterModalProps {
  platformOptions: string[];
  genreOptions: string[];
  statusOptions: string[];
  platformFilter: string;
  genreFilter: string;
  statusFilter: string;
  setPlatformFilter: (value: string) => void;
  setGenreFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  onClose: () => void;
}

/** Houses the Platform/Genre/Status filters behind a single "Filters" button (issue #335) instead
 * of them permanently taking up a row of the header - the pills were the biggest space cost on a
 * narrow screen, and this is the same centered-modal idiom already used for Room/Profile/Add Game.
 * Tags and "Collecting dust" stay inline in the header - the issue's proposed solution names only
 * genre/status/console (platform) as the ones worth tucking away. */
export function FilterModal({
  platformOptions,
  genreOptions,
  statusOptions,
  platformFilter,
  genreFilter,
  statusFilter,
  setPlatformFilter,
  setGenreFilter,
  setStatusFilter,
  onClose,
}: FilterModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Filters</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <PillFilter label="Platform" allLabel="All platforms" options={platformOptions} value={platformFilter} onChange={setPlatformFilter} />
          <PillFilter label="Genre" allLabel="All genres" options={genreOptions} value={genreFilter} onChange={setGenreFilter} />
          <PillFilter label="Status" allLabel="All statuses" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        </div>

        <button type="button" className={styles.doneButton} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
