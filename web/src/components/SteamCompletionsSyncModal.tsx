import { useState } from 'react';
import type { SteamCompletionCandidate, SteamCompletionsSyncResult } from '@queueup/shared';
import { useModalA11y } from '../hooks/useModalA11y';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './SteamCompletionsSyncModal.module.css';

interface SteamCompletionsSyncModalProps {
  result: SteamCompletionsSyncResult;
  applying: boolean;
  onApply: (gameIds: string[]) => Promise<unknown>;
  onClose: () => void;
}

/** Review step for "Sync completions from Steam" (issue #244) - every candidate the scan turned up
 * is a suggestion, not a done deal: each one starts checked, but nothing is marked Beaten until
 * "Mark Beaten" is clicked, and any single one can be dismissed (unchecked and dropped from the
 * list, no server call) without touching the rest. Applying reuses the same bulkUpdateStatus
 * mutation the shelf's "Select multiple" bulk-action bar uses (passed down as `onApply`), so
 * accepted games leave this list the same way they'd leave a bulk-selected one - this dialog is
 * just a different way of building the same gameIds + status payload. */
export function SteamCompletionsSyncModal({ result, applying, onApply, onClose }: SteamCompletionsSyncModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [candidates, setCandidates] = useState<SteamCompletionCandidate[]>(result.candidates);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(result.candidates.map((c) => c.id)));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dismiss(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleApply() {
    const ids = candidates.map((c) => c.id).filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;
    try {
      await onApply(ids);
      const applied = new Set(ids);
      setCandidates((prev) => prev.filter((c) => !applied.has(c.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } catch {
      // The caller's own bulk-status mutation already surfaces a failure elsewhere (the shelf's
      // ActionErrorBanner) - leave the selection as-is here so the user can just retry.
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Sync completions from Steam"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.title}>Sync completions from Steam</div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className={styles.empty}>
            {result.candidates.length === 0
              ? `Checked ${result.consideredCount} not-yet-Beaten shelf game${result.consideredCount === 1 ? '' : 's'} with a linked Steam app - nothing's 100%'d that isn't already marked Beaten.`
              : "That's everything reviewed - nothing left."}
          </p>
        ) : (
          <>
            <p className={styles.hint}>
              🏆 Steam says you've 100%'d {candidates.length} game{candidates.length === 1 ? '' : 's'} that{' '}
              {candidates.length === 1 ? "isn't" : "aren't"} marked Beaten yet (checked {result.consideredCount}). Pick which to
              update - nothing changes until you apply.
            </p>
            <ul className={styles.list}>
              {candidates.map((c) => (
                <li key={c.id} className={styles.row}>
                  <label className={styles.rowLabel}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggle(c.id)} disabled={applying} />
                    <span className={styles.thumb} style={c.coverImageUrl ? { backgroundImage: `url(${c.coverImageUrl})` } : undefined} />
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{c.title}</span>
                      <span className={styles.rowMeta}>100%'d {formatRelativeTime(c.lastUnlockedAt)}</span>
                    </span>
                  </label>
                  <button type="button" className={styles.dismissButton} onClick={() => dismiss(c.id)} disabled={applying}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <div className={styles.actionsLeft}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setSelectedIds(new Set(candidates.map((c) => c.id)))}
                  disabled={applying}
                >
                  Select all
                </button>
                <button type="button" className={styles.linkButton} onClick={() => setSelectedIds(new Set())} disabled={applying}>
                  Clear
                </button>
              </div>
              <button type="button" className={styles.applyButton} onClick={handleApply} disabled={applying || selectedIds.size === 0}>
                {applying ? 'Marking Beaten…' : `Mark Beaten (${selectedIds.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
