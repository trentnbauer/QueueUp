import { useState } from 'react';
import { useChangelog, type ChangelogEntry } from '../hooks/useChangelog';
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
        <div className={styles.backdrop} role="presentation" onClick={handleClose}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="What's new"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.title}>What&apos;s new</div>
            <p className={styles.subtitle}>
              {manualOpen && !autoOpen
                ? 'Everything that has shipped so far.'
                : "Here's what's changed since you were last here."}
            </p>

            <EntryList entries={manualOpen && !autoOpen ? entries : newEntries} />

            <div className={styles.actions}>
              <button type="button" className={styles.confirmButton} onClick={handleClose}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
