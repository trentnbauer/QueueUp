import { useSteamCompletionsSync } from '../hooks/useSteamCompletionsSync';
import { SteamCompletionsSyncModal } from './SteamCompletionsSyncModal';
import styles from './SteamImportCard.module.css';

interface SteamCompletionsSyncCardProps {
  steamLinked: boolean;
  /** Applies Done to the given Personal Shelf game ids - the ShelfView's own bulkUpdateStatus
   * (same mutation the "Select multiple" bulk-action bar uses), passed down rather than this
   * component calling useGames(null) itself, so there's exactly one bulk-status mutation instance
   * (and one isApplying flag) per shelf. */
  onApply: (gameIds: string[]) => Promise<unknown>;
  applying: boolean;
}

/** Shelf tile counterpart (issue #244) to SteamImportCard/SteamWishlistImportCard - same tile
 * treatment, but this one doesn't write to the shelf itself. It scans not-yet-Done Personal Shelf
 * games with a linked Steam app id for a 100% achievement completion the app doesn't already know
 * about (the same detection the Year in Review recap uses, just across all time instead of a
 * 12-month window - see findDetectedSteamCompletions server-side), then hands the results to
 * SteamCompletionsSyncModal for review. Nothing is marked Done until the caller explicitly applies
 * it there - same opt-in-by-design pattern as the single-game nudge in GameDetailModal.tsx.
 *
 * Unlike the import tiles, this doesn't go through SteamImportContext - it only ever runs from
 * this one tile, so there's no second trigger point it needs to coordinate a shared `busy` state
 * with. */
export function SteamCompletionsSyncCard({ steamLinked, onApply, applying }: SteamCompletionsSyncCardProps) {
  const { busy, error, result, scan, reset } = useSteamCompletionsSync();

  function handleClick() {
    if (!steamLinked) {
      window.location.href = '/auth/steam/link';
      return;
    }
    scan();
  }

  return (
    <>
      <button type="button" className={styles.card} onClick={handleClick} disabled={busy}>
        <div className={styles.icon} aria-hidden="true">
          🏆
        </div>
        <div className={styles.label}>{busy ? 'Checking Steam…' : steamLinked ? 'Sync Completions from Steam' : 'Link Steam Account'}</div>
        {!busy && !error && (
          <div className={styles.hint}>
            {steamLinked
              ? "Find shelf games you've 100%'d on Steam but haven't marked Beaten"
              : 'Sign in with Steam to sync completions'}
          </div>
        )}
        {error && (
          <div className={styles.hint} style={{ color: '#ff8a80' }}>
            {error}
          </div>
        )}
      </button>
      {result && <SteamCompletionsSyncModal result={result} applying={applying} onApply={onApply} onClose={reset} />}
    </>
  );
}
