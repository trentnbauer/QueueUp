import { useState } from 'react';
import { useChangelog, type ChangelogEntry } from '../hooks/useChangelog';
import { useModalA11y } from '../hooks/useModalA11y';
import styles from './ChangelogModal.module.css';

function EntryList({ entries }: { entries: ChangelogEntry[] }) {
  if (entries.length === 0) {
    return <p className={styles.empty}>No changes yet.</p>;
  }
  return (
    <ul className={styles.list}>
      {entries.map((e) => (
        <li key={e.number} className={styles.item}>
          <a href={e.url} target="_blank" rel="noreferrer" className={styles.link}>
            {e.title}
          </a>
          <span className={styles.number}>#{e.number}</span>
        </li>
      ))}
    </ul>
  );
}

interface ChangelogDialogProps {
  entries: ChangelogEntry[];
  showFullHistory: boolean;
  onClose: () => void;
}

// A separate component (rather than inline JSX behind `{open && ...}`) so useModalA11y - which
// must run unconditionally - only mounts/unmounts along with the dialog itself.
function ChangelogDialog({ entries, showFullHistory, onClose }: ChangelogDialogProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="What's new"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>What&apos;s new</div>
        <p className={styles.subtitle}>
          {showFullHistory ? 'Everything that has shipped so far.' : "Here's what's changed since you were last here."}
        </p>

        <EntryList entries={entries} />

        <div className={styles.actions}>
          <button type="button" className={styles.confirmButton} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Auto-popup "what's new since you were last here" banner, plus a manual
 * "what's new" footer button that always shows the full history. Mirrors the
 * FilmCalc changelog pattern (see issue #74) adapted to a React SPA: a
 * build-time-generated changelog.json (static asset) diffed against a seen-PR
 * set kept in localStorage.
 */
export function ChangelogModal() {
  const { entries, newEntries, loaded, markAllSeen } = useChangelog();
  const [manualOpen, setManualOpen] = useState(false);

  const autoOpen = loaded && newEntries.length > 0;
  const open = autoOpen || manualOpen;
  const showFullHistory = manualOpen && !autoOpen;

  function handleClose() {
    markAllSeen();
    setManualOpen(false);
  }

  return (
    <>
      <button type="button" className={styles.footerButton} onClick={() => setManualOpen(true)}>
        What&apos;s new
      </button>

      {open && (
        <ChangelogDialog
          entries={showFullHistory ? entries : newEntries}
          showFullHistory={showFullHistory}
          onClose={handleClose}
        />
      )}
    </>
  );
}
