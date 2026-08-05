import { useEffect, useState } from 'react';
import type { NextPickSuggestion } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import styles from './NextPickModal.module.css';

const REASON_LABEL: Record<NextPickSuggestion['reason'], string> = {
  shortest: '⏱️ Shortest game in your backlog',
  oldest_wishlist: '⏳ Longest on your wishlist',
  franchise_progress: '🎬 Closest to finishing a series',
  neglected: '🕸 Collecting dust',
};

interface NextPickModalProps {
  onClose: () => void;
}

/** Issue #508 - a personal "what should I play next" picker over the caller's own Personal Shelf.
 * Distinct from Spin the Wheel (SpinPickerButton.tsx): that draws from an already-loaded, already-
 * filtered pool client-side; this always fetches fresh from GET /api/me/next-pick, since the
 * franchise-progress heuristic needs the *entire* shelf (not just whatever's currently rendered in
 * the grid) to compute accurately, and the fallback pick needs `Date.now()` evaluated at request
 * time rather than whenever the shelf was last loaded. */
export function NextPickModal({ onClose }: NextPickModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [suggestion, setSuggestion] = useState<NextPickSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gamesApi.nextPick();
      setSuggestion(result.suggestion);
    } catch {
      setError('Could not get a suggestion right now - try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPick();
    // Only ever needs to run once on open - "Try Another" below re-triggers it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="What should I play next?"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>🔮 What should I play next?</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading && <div className={styles.status}>Thinking…</div>}
        {!loading && error && <div className={styles.status}>{error}</div>}
        {!loading && !error && suggestion === null && (
          <div className={styles.status}>Nothing to suggest yet - add a backlog or wishlist game first.</div>
        )}
        {!loading && !error && suggestion && (
          <div className={styles.pick}>
            {suggestion.game.coverImageUrl && <img className={styles.cover} src={suggestion.game.coverImageUrl} alt="" />}
            <div className={styles.pickBody}>
              <div className={styles.reason}>{REASON_LABEL[suggestion.reason]}</div>
              <div className={styles.gameTitle}>{suggestion.game.title}</div>
              <div className={styles.detail}>{suggestion.detail}</div>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.tryAgainButton} onClick={fetchPick} disabled={loading}>
            🔁 Try Another
          </button>
          <button type="button" className={styles.closeTextButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
